import type { CampaignProgress, DeploymentEdge, SimState } from "@/lib/types";
import { campaignKey, readCampaignProgress } from "../campaign";
import {
  isCurrentGameplayRules,
  JOURNAL_PREFIX,
  progressAfterRetiredBattlefield,
  RULES_REBUILD_NOTICE,
} from "../rulesRetirement";
import {
  keepRetiredSlotLegacy,
  restoreSlotLegacy,
  saveLegacy,
  saveSlotLegacy,
} from "./repository/legacyBackend";
import { migrateLegacyStorage } from "./repository/migrateLegacy";
import {
  type CampaignRecord,
  completion,
  encode,
  encodeProgress,
  type Journal,
  type MigrationRecord,
  progressFor,
  request,
  SAVE_FALLBACK_EPOCH_KEY,
  type SlotRecord,
  stampFallbackEpoch,
} from "./repository/progressMerge";
import { recoverJournalsFromStorage } from "./repository/recoverJournals";
import { retireIndexedRulesStore } from "./repository/retireIndexedRules";
import { applyRulesRetirement } from "./retireRules";
import { decodeSave, saveKey } from "./serialize";
import type { SaveSession, SaveWriteStatus } from "./session";
import {
  decodeSlot,
  type ParsedSlot,
  SLOT_PREFIX,
  type SlotWriteResult,
  slotKey,
  writeSlot,
} from "./slots";
import {
  cachedLocalStorage,
  clearAllGameData,
  memoryStorage,
  type StorageAdapter,
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
} from "./storage";

export const SAVE_DATABASE_NAME = "shiftingfront-saves";
const SAVE_REPOSITORY_INITIALIZATION_TIMEOUT_MS = 5_000;
type SaveOutcome = { status: SaveWriteStatus; revision?: number };

function browserIndexedDB(): IDBFactory | undefined {
  try {
    return typeof indexedDB === "undefined" ? undefined : indexedDB;
  } catch {
    return undefined;
  }
}

/** Async durable writes with a synchronous, read-only view for React snapshots and existing codecs. */
export class SaveRepository {
  mode: "indexeddb" | "legacy" = "legacy";
  private db: IDBDatabase | null = null;
  private cache = memoryStorage();
  private revisions = new Map<number, number>();
  /** null means a clear must survive the next autosave even if the durable write failed. */
  private edgeOverrides = new Map<number, DeploymentEdge | null>();
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private initPromise: Promise<void> | null = null;
  private generation = 0;
  private openAttempt = 0;
  readonly storage: StorageAdapter;

  constructor(
    private legacy: StorageAdapter = cachedLocalStorage(),
    private factory: IDBFactory | undefined = browserIndexedDB(),
  ) {
    this.storage = {
      getItem: (key) =>
        this.mode === "legacy" ? this.legacy.getItem(key) : this.cache.getItem(key),
      keys: () => (this.mode === "legacy" ? this.legacy.keys() : this.cache.keys()),
      setItem: (key, value) => {
        if (this.mode === "legacy") this.legacy.setItem(key, value);
        else throw new Error("Use SaveRepository for durable writes");
      },
      removeItem: (key) => {
        if (this.mode === "legacy") this.legacy.removeItem(key);
        else throw new Error("Use SaveRepository for durable writes");
      },
    };
  }
  private rulesRebuilt = false;
  get notice(): string | null {
    const legacy =
      this.mode === "legacy"
        ? "Using legacy browser saves. Save recovery and multi-tab protection are reduced; export important saves as a backup."
        : null;
    const rebuilt = this.rulesRebuilt ? RULES_REBUILD_NOTICE : null;
    return [legacy, rebuilt].filter((line) => line !== null).join(" ") || null;
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(): void {
    for (const listener of this.listeners) listener();
  }
  private fallBackToLegacy(): void {
    this.openAttempt += 1;
    this.db?.close();
    this.db = null;
    this.mode = "legacy";
    stampFallbackEpoch(this.legacy);
  }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    const next = this.queue.then(() => {
      if (generation !== this.generation) throw new Error("Save operation cancelled");
      return work();
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        this.fallBackToLegacy();
        finish();
      }, SAVE_REPOSITORY_INITIALIZATION_TIMEOUT_MS);

      void this.open()
        .catch(() => this.fallBackToLegacy())
        .finally(() => {
          try {
            if (this.mode === "legacy" && applyRulesRetirement(this.legacy)) {
              this.rulesRebuilt = true;
            }
          } catch {
            // Retirement must not block the game when storage itself is failing.
          }
          finish();
        });
    });
    return this.initPromise;
  }
  private async open(): Promise<void> {
    if (!this.factory) return;
    const attempt = this.openAttempt;
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const opening = this.factory!.open(SAVE_DATABASE_NAME, 1);
        let expired = false;
        const timeout = setTimeout(() => {
          expired = true;
          reject(new Error("Save database unavailable"));
        }, 2500);
        opening.onupgradeneeded = () => {
          const upgradingDb = opening.result;
          upgradingDb.createObjectStore("campaigns", { keyPath: "seed" });
          upgradingDb.createObjectStore("slots", { keyPath: "id" });
          upgradingDb.createObjectStore("metadata", { keyPath: "key" });
        };
        opening.onsuccess = () => {
          clearTimeout(timeout);
          if (expired) opening.result.close();
          else resolve(opening.result);
        };
        opening.onerror = () => {
          clearTimeout(timeout);
          reject(opening.error);
        };
      });
      if (attempt !== this.openAttempt) {
        db.close();
        return;
      }
      this.db = db;
      db.onversionchange = () => {
        this.close();
        this.publish();
      };
      this.mode = "indexeddb";
      await this.migrateLegacy();
      if (attempt !== this.openAttempt) return;
      await this.recoverJournals();
      if (attempt !== this.openAttempt) return;
      if (await this.retireIndexedRules()) this.rulesRebuilt = true;
      if (attempt !== this.openAttempt) return;
      if (applyRulesRetirement(this.legacy)) this.rulesRebuilt = true;
      await this.refresh();
      if (attempt !== this.openAttempt) return;
      safeRemoveItem(this.legacy, SAVE_FALLBACK_EPOCH_KEY);
      if (typeof BroadcastChannel !== "undefined" && typeof window !== "undefined") {
        this.channel = new BroadcastChannel("shiftingfront-save-revisions");
        this.channel.onmessage = ({ data }) => {
          if (data?.type === "committed") void this.refresh().catch(() => undefined);
        };
      }
    } catch {
      if (attempt === this.openAttempt) this.fallBackToLegacy();
    }
  }
  private transaction = async <T>(
    stores: string[],
    work: (tx: IDBTransaction) => Promise<T>,
  ): Promise<T> => {
    if (!this.db) throw new Error("Save database unavailable");
    const tx = this.db.transaction(stores, "readwrite");
    const done = completion(tx);
    try {
      const result = await work(tx);
      await done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => undefined);
      throw error;
    }
  };
  private async refresh(): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(["campaigns", "slots", "metadata"], "readonly");
    const [campaigns, slots, metadata] = await Promise.all([
      request(tx.objectStore("campaigns").getAll()) as Promise<CampaignRecord[]>,
      request(tx.objectStore("slots").getAll()) as Promise<SlotRecord[]>,
      request(tx.objectStore("metadata").getAll()) as Promise<MigrationRecord[]>,
    ]);
    const next = memoryStorage();
    this.revisions.clear();
    for (const record of campaigns) {
      this.revisions.set(record.seed, record.revision);
      if (record.autosave) next.setItem(saveKey(record.seed), record.autosave);
      if (record.progress) next.setItem(campaignKey(record.seed), record.progress);
    }
    for (const record of slots) next.setItem(slotKey(record.id), record.raw);
    for (const record of metadata) {
      if (record.unreadable && !next.getItem(record.key)) next.setItem(record.key, record.raw);
    }
    this.cache = next;
    this.applyPendingEdgesToCache();
    this.publish();
  }
  private progressWithPendingEdge(seed: number, progress: CampaignProgress): CampaignProgress {
    if (!this.edgeOverrides.has(seed)) return progress;
    const edge = this.edgeOverrides.get(seed);
    const next = { ...progress };
    if (edge) next.deploymentEdge = edge;
    else delete next.deploymentEdge;
    return next;
  }
  private applyPendingEdgesToCache(): void {
    for (const seed of this.edgeOverrides.keys()) {
      this.cache.setItem(
        campaignKey(seed),
        encodeProgress(this.progressWithPendingEdge(seed, readCampaignProgress(this.cache, seed))),
      );
    }
  }
  private async committed(): Promise<void> {
    if (this.db) await this.refresh();
    else this.publish();
    this.channel?.postMessage({ type: "committed", revisions: [...this.revisions] });
  }
  private async migrateLegacy(): Promise<void> {
    return migrateLegacyStorage(this.legacy, this.transaction);
  }
  private async recoverJournals(): Promise<void> {
    return recoverJournalsFromStorage(this.legacy, this.transaction);
  }
  private async retireIndexedRules(): Promise<boolean> {
    return retireIndexedRulesStore(this.db, this.transaction);
  }
  private keepRetiredSlot(slot: { state: SimState; campaign: CampaignProgress }): Promise<boolean> {
    const seed = slot.state.seed;
    return this.enqueue(async () => {
      if (this.mode === "legacy") {
        if (!keepRetiredSlotLegacy(this.legacy, slot)) return false;
        this.rulesRebuilt = true;
        this.publish();
        return true;
      }
      try {
        await this.transaction(["campaigns"], async (tx) => {
          const store = tx.objectStore("campaigns");
          const record = (await request(store.get(seed))) as CampaignRecord | undefined;
          const existing = record?.progress
            ? readCampaignProgress(memoryStorage({ [campaignKey(seed)]: record.progress }), seed)
            : null;
          let autosave = record?.autosave ?? null;
          if (autosave) {
            try {
              if (!isCurrentGameplayRules(decodeSave(autosave).state.gameplayRulesVersion)) {
                autosave = null;
              }
            } catch {
              autosave = null;
            }
          }
          store.put({
            seed,
            revision: (record?.revision ?? 0) + 1,
            autosave,
            progress: encodeProgress(
              progressAfterRetiredBattlefield(existing, slot.campaign, slot.state.missionIndex),
            ),
          } satisfies CampaignRecord);
        });
      } catch {
        return false;
      }
      this.rulesRebuilt = true;
      try {
        await this.committed();
      } catch {
        this.publish();
      }
      return true;
    }).catch(() => false);
  }
  writeJournal(state: SimState, revision = this.revisions.get(state.seed) ?? 0): boolean {
    try {
      return safeSetItem(
        this.legacy,
        `${JOURNAL_PREFIX}${state.seed.toString().padStart(4, "0")}`,
        JSON.stringify({
          revision,
          autosave: encode(state),
          progress: encodeProgress(
            progressFor(
              {
                seed: state.seed,
                revision,
                autosave: null,
                progress: this.storage.getItem(campaignKey(state.seed)),
              },
              state,
            ),
          ),
          savedAt: Date.now(),
        } satisfies Journal),
      );
    } catch {
      return false;
    }
  }
  createSession(seed: number): SaveSession {
    let revision = this.revisions.get(seed) ?? 0;
    let external = false;
    let writes: Promise<unknown> = Promise.resolve();
    let generation = 0;
    return {
      write: (state, mode) => {
        if (mode === "implicit" && external) return Promise.resolve("conflict" as const);
        let captured: SimState;
        try {
          captured = decodeSave(encode(state)).state;
        } catch {
          return Promise.resolve("failed" as const);
        }
        const token = generation;
        const next = writes
          .then(() =>
            token !== generation
              ? { status: "conflict" as const }
              : this.saveWithRevision(
                  captured,
                  mode === "implicit" ? revision : undefined,
                  () => token === generation,
                ),
          )
          .then((outcome) => {
            // A refresh may already include another tab's later commit. Only adopt
            // the revision written by this operation, so the next autosave conflicts.
            if (outcome.status === "saved" && token === generation) {
              revision = outcome.revision ?? revision;
              external = false;
            }
            return outcome.status;
          });
        writes = next.catch(() => undefined);
        return next;
      },
      adoptCurrent: () => {
        generation++;
        revision = this.revisions.get(seed) ?? 0;
        external = false;
      },
      markExternalChange: () => {
        external = true;
      },
      writeJournal: (state) => this.writeJournal(state, revision),
    };
  }
  setDeploymentEdge(seed: number, edge: DeploymentEdge | undefined): Promise<boolean> {
    const current = readCampaignProgress(this.storage, seed);
    const next: CampaignProgress = { ...current };
    if (edge) next.deploymentEdge = edge;
    else delete next.deploymentEdge;
    const encoded = encodeProgress(next);
    if (this.mode === "legacy") {
      const wrote = safeSetItem(this.legacy, campaignKey(seed), encoded);
      if (wrote) this.publish();
      return Promise.resolve(wrote);
    }
    this.cache.setItem(campaignKey(seed), encoded);
    const pendingEdge = edge ?? null;
    this.edgeOverrides.set(seed, pendingEdge);
    this.publish();
    return this.enqueue(async () => {
      let written: DeploymentEdge | null | undefined;
      await this.transaction(["campaigns"], async (tx) => {
        if (!this.edgeOverrides.has(seed)) return;
        const store = tx.objectStore("campaigns");
        const record: CampaignRecord = (await request(store.get(seed))) ?? {
          seed,
          revision: 0,
          autosave: null,
          progress: null,
        };
        if (!this.edgeOverrides.has(seed)) return;
        written = this.edgeOverrides.get(seed) ?? null;
        const stored = record.progress
          ? readCampaignProgress(memoryStorage({ [campaignKey(seed)]: record.progress }), seed)
          : current;
        if (written) stored.deploymentEdge = written;
        else delete stored.deploymentEdge;
        // Leave the revision alone. This record is also the autosave lock, and
        // the victory save is often still queued when the player picks a reward.
        store.put({ ...record, progress: encodeProgress(stored) });
      });
      if (written !== undefined && this.edgeOverrides.get(seed) === written) {
        this.edgeOverrides.delete(seed);
      }
      await this.committed();
      return true;
    }).catch(() => false);
  }
  save(
    state: SimState,
    expectedRevision?: number,
    isCurrent: () => boolean = () => true,
  ): Promise<SaveWriteStatus> {
    return this.saveWithRevision(state, expectedRevision, isCurrent).then(
      (outcome) => outcome.status,
    );
  }
  private saveWithRevision(
    state: SimState,
    expectedRevision?: number,
    isCurrent: () => boolean = () => true,
  ): Promise<SaveOutcome> {
    // Capture before queueing: simulation keeps mutating its original object.
    let autosave: string;
    try {
      autosave = encode(state);
    } catch {
      return Promise.resolve({ status: "failed" });
    }
    const captured = decodeSave(autosave).state;
    return this.enqueue<SaveOutcome>(async () => {
      if (!isCurrent()) return { status: "conflict" };
      if (this.mode === "legacy") {
        const outcome = saveLegacy(this.legacy, autosave, captured);
        this.publish();
        return outcome;
      }
      let writtenEdge: DeploymentEdge | null | undefined;
      const outcome = await this.transaction<SaveOutcome>(["campaigns"], async (tx) => {
        const store = tx.objectStore("campaigns");
        const record: CampaignRecord = (await request(store.get(captured.seed))) ?? {
          seed: captured.seed,
          revision: 0,
          autosave: null,
          progress: null,
        };
        if (!isCurrent()) return { status: "conflict" };
        if (expectedRevision !== undefined && record.revision !== expectedRevision) {
          return { status: "conflict" };
        }
        const progress = progressFor(record, captured);
        if (this.edgeOverrides.has(captured.seed)) {
          writtenEdge = this.edgeOverrides.get(captured.seed) ?? null;
          if (writtenEdge) progress.deploymentEdge = writtenEdge;
          else delete progress.deploymentEdge;
        }
        store.put({
          ...record,
          revision: record.revision + 1,
          autosave,
          progress: encodeProgress(progress),
        });
        return { status: "saved", revision: record.revision + 1 };
      });
      if (outcome.status === "saved") {
        if (writtenEdge !== undefined && this.edgeOverrides.get(captured.seed) === writtenEdge) {
          this.edgeOverrides.delete(captured.seed);
        }
        await this.committed();
      }
      return outcome;
    }).catch(() => ({ status: "failed" }));
  }
  saveSlot(
    input: { id?: string; name: string; state: SimState; campaign: CampaignProgress },
    isCurrent: () => boolean = () => true,
  ): Promise<SlotWriteResult> {
    const temp = memoryStorage();
    const result = writeSlot(temp, input);
    if (!result.ok) return Promise.resolve(result);
    const raw = temp.getItem(slotKey(result.id))!;
    const captured = decodeSlot(raw);
    const autosave = encode(captured.state);
    return this.enqueue(async () => {
      if (!isCurrent()) return { ok: false } as const;
      if (this.mode === "legacy") {
        if (
          !saveSlotLegacy(
            this.legacy,
            { id: result.id, raw, autosave, seed: captured.state.seed },
            isCurrent,
          )
        ) {
          return { ok: false } as const;
        }
      } else {
        await this.transaction(["slots", "campaigns"], async (tx) => {
          if (!isCurrent()) throw new Error("Save operation cancelled");
          const slots = tx.objectStore("slots");
          const previous = (await request(slots.get(result.id))) as SlotRecord | undefined;
          if (!isCurrent()) throw new Error("Save operation cancelled");
          if (!input.id && previous) throw new Error("Slot ID collision");
          slots.put({ id: result.id, revision: (previous?.revision ?? 0) + 1, raw });
          const campaigns = tx.objectStore("campaigns");
          const record = (await request(campaigns.get(captured.state.seed))) as
            | CampaignRecord
            | undefined;
          if (!isCurrent()) throw new Error("Save operation cancelled");
          campaigns.put({
            seed: captured.state.seed,
            revision: (record?.revision ?? 0) + 1,
            autosave,
            progress: encodeProgress(captured.campaign),
          });
        });
      }
      if (!isCurrent()) return { ok: false } as const;
      await this.committed();
      return result;
    }).catch(() => ({ ok: false }));
  }
  restoreSlot(parsed: ParsedSlot, isCurrent: () => boolean = () => true): Promise<string | null> {
    if (!isCurrentGameplayRules(parsed.state.gameplayRulesVersion)) {
      return this.keepRetiredSlot(parsed).then((kept) =>
        kept
          ? RULES_REBUILD_NOTICE
          : "Couldn't preserve campaign progress from that slot because browser storage is unavailable. Your current mission is unchanged.",
      );
    }
    const autosave = encode(parsed.state);
    const progress = encodeProgress(parsed.campaign);
    return this.enqueue(async () => {
      if (!isCurrent()) {
        return "Couldn't restore the slot because the mission changed before storage was ready.";
      }
      if (this.mode === "legacy") {
        return restoreSlotLegacy(this.legacy, parsed, isCurrent);
      }
      await this.transaction(["campaigns"], async (tx) => {
        if (!isCurrent()) throw new Error("Save operation cancelled");
        const store = tx.objectStore("campaigns");
        const record = (await request(store.get(parsed.state.seed))) as CampaignRecord | undefined;
        if (!isCurrent()) throw new Error("Save operation cancelled");
        store.put({
          seed: parsed.state.seed,
          revision: (record?.revision ?? 0) + 1,
          autosave,
          progress,
        });
      });
      if (!isCurrent()) {
        return "Couldn't restore the slot because the mission changed before storage was ready.";
      }
      await this.committed();
      return null;
    }).catch(
      () =>
        "Couldn't restore the slot. Browser storage is unavailable; your current mission is unchanged.",
    );
  }
  importSlot(raw: string): Promise<SlotWriteResult> {
    if (raw.length > 1_048_576) return Promise.resolve({ ok: false });
    let decoded: ReturnType<typeof decodeSlot>;
    try {
      decoded = decodeSlot(raw);
    } catch {
      return Promise.resolve({ ok: false });
    }
    if (!isCurrentGameplayRules(decoded.state.gameplayRulesVersion)) {
      return this.keepRetiredSlot(decoded).then((kept) =>
        kept
          ? { ok: false as const, reason: "legacy-rules" as const }
          : { ok: false as const, reason: "storage-failed" as const },
      );
    }
    const temp = memoryStorage();
    const result = writeSlot(temp, decoded);
    if (!result.ok) return Promise.resolve(result);
    return this.enqueue(async () => {
      const imported = temp.getItem(slotKey(result.id))!;
      if (this.mode === "legacy") {
        if (!safeSetItem(this.legacy, slotKey(result.id), imported)) return { ok: false } as const;
      } else {
        await this.transaction(["slots"], async (tx) => {
          const store = tx.objectStore("slots");
          if (await request(store.get(result.id))) throw new Error("Slot ID collision");
          store.put({ id: result.id, revision: 1, raw: imported });
        });
      }
      await this.committed();
      return result;
    }).catch(() => ({ ok: false }));
  }
  remove(key: string): Promise<boolean> {
    return this.enqueue(async () => {
      if (this.mode === "legacy") return safeRemoveItem(this.legacy, key);
      let sourceKey = key;
      await this.transaction(["campaigns", "slots", "metadata"], async (tx) => {
        const previous = (await request(tx.objectStore("metadata").get(key))) as
          | MigrationRecord
          | undefined;
        sourceKey = previous?.sourceKey ?? key;
        const raw = safeGetItem(this.legacy, key);
        if (raw) tx.objectStore("metadata").put({ key, raw } satisfies MigrationRecord);
        else tx.objectStore("metadata").delete(key);
        if (key.startsWith(SLOT_PREFIX))
          tx.objectStore("slots").delete(key.slice(SLOT_PREFIX.length));
        else {
          const seed = Number(key.slice(key.lastIndexOf(":") + 1));
          const store = tx.objectStore("campaigns");
          const record = (await request(store.get(seed))) as CampaignRecord | undefined;
          if (record) store.put({ ...record, revision: record.revision + 1, autosave: null });
        }
      });
      const removed = safeRemoveItem(this.legacy, sourceKey);
      await this.committed();
      return removed;
    }).catch(() => false);
  }
  async clear(): Promise<boolean> {
    this.generation++;
    await this.queue;
    this.edgeOverrides.clear();
    try {
      if (this.db) {
        await this.transaction(["campaigns", "slots", "metadata"], async (tx) => {
          for (const store of ["campaigns", "slots", "metadata"]) tx.objectStore(store).clear();
        });
      }
      const cleared = clearAllGameData(this.legacy);
      await this.committed();
      return cleared;
    } catch {
      return false;
    }
  }
  close(): void {
    this.generation++;
    this.openAttempt += 1;
    this.channel?.close();
    this.channel = null;
    this.db?.close();
    this.db = null;
    this.mode = "legacy";
  }
}

let repository: SaveRepository | null = null;
export function getSaveRepository(): SaveRepository | null {
  return repository;
}
export function installSaveRepository(next: SaveRepository | null): void {
  repository = next;
}
export function cachedCampaignStorage(): StorageAdapter {
  return repository?.storage ?? cachedLocalStorage();
}
export async function initializeSaveRepository(): Promise<SaveRepository> {
  repository ??= new SaveRepository();
  await repository.initialize();
  return repository;
}
