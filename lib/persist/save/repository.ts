import type { CampaignProgress, SimState } from "@/lib/types";
import { campaignKey, CAMPAIGN_PREFIX, completeMission, readCampaignProgress, writeCampaignProgress } from "../campaign";
import { missionMedals, missionScore } from "@/lib/sim/debrief";
import { decodeSave, SAVE_PREFIX, saveKey } from "./serialize";
import { writeSave } from "./api";
import { createSlotId, decodeSlot, isSlotId, SLOT_PREFIX, slotKey, writeSlot, type ParsedSlot, type SlotWriteResult } from "./slots";
import { cachedLocalStorage, clearAllGameData, memoryStorage, safeGetItem, safeKeys, safeRemoveItem, safeSetItem, type StorageAdapter } from "./storage";
import type { SaveSession, SaveWriteStatus } from "./session";
import { isCampaignProgressShape } from "./validation";

export const SAVE_DATABASE_NAME = "shiftingfront-saves";
const SAVE_REPOSITORY_INITIALIZATION_TIMEOUT_MS = 5_000;
const JOURNAL_PREFIX = "shiftingfront:journal:";
type CampaignRecord = { seed: number; revision: number; autosave: string | null; progress: string | null };
type SlotRecord = { id: string; revision: number; raw: string };
type MigrationRecord = { key: string; raw: string; unreadable?: boolean; sourceKey?: string };
type Journal = { revision: number; autosave: string; progress: string; savedAt: number };

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
}
function completion(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Save transaction aborted")); });
}
function encode(state: SimState): string {
  const memory = memoryStorage();
  if (!writeSave(memory, state)) throw new Error("Invalid save state");
  return memory.getItem(saveKey(state.seed))!;
}
function encodeProgress(progress: CampaignProgress): string {
  const memory = memoryStorage();
  if (!writeCampaignProgress(memory, progress)) throw new Error("Invalid campaign progress");
  return memory.getItem(campaignKey(progress.seed))!;
}
function progressFor(record: CampaignRecord, state: SimState): CampaignProgress {
  const progress = { ...readCampaignProgress(memoryStorage(record.progress ? { [campaignKey(state.seed)]: record.progress } : {}), state.seed), gameplayRulesVersion: state.gameplayRulesVersion ?? 1 as const };
  return state.result === "won" ? completeMission(progress, state.missionIndex, missionMedals(state), missionScore(state)) : progress;
}
function validatedProgress(raw: string, seed: number): string {
  const parsed = JSON.parse(raw);
  if (parsed.version !== 1 || !isCampaignProgressShape(parsed.progress) || parsed.progress.seed !== seed) throw new Error("Invalid campaign progress");
  return encodeProgress(readCampaignProgress(memoryStorage({ [campaignKey(seed)]: raw }), seed));
}

function browserIndexedDB(): IDBFactory | undefined {
  try { return typeof indexedDB === "undefined" ? undefined : indexedDB; } catch { return undefined; }
}

/** Async durable writes with a synchronous, read-only view for React snapshots and existing codecs. */
export class SaveRepository {
  mode: "indexeddb" | "legacy" = "legacy";
  private db: IDBDatabase | null = null;
  private cache = memoryStorage();
  private revisions = new Map<number, number>();
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private initPromise: Promise<void> | null = null;
  private generation = 0;
  readonly storage: StorageAdapter;

  constructor(private legacy: StorageAdapter = cachedLocalStorage(), private factory: IDBFactory | undefined = browserIndexedDB()) {
    this.storage = {
      getItem: (key) => this.mode === "legacy" ? this.legacy.getItem(key) : this.cache.getItem(key),
      keys: () => this.mode === "legacy" ? this.legacy.keys() : this.cache.keys(),
      setItem: (key, value) => { if (this.mode === "legacy") this.legacy.setItem(key, value); else throw new Error("Use SaveRepository for durable writes"); },
      removeItem: (key) => { if (this.mode === "legacy") this.legacy.removeItem(key); else throw new Error("Use SaveRepository for durable writes"); },
    };
  }
  get notice(): string | null { return this.mode === "legacy" ? "Using legacy browser saves. Save recovery and multi-tab protection are reduced; export important saves as a backup." : null; }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(): void { for (const listener of this.listeners) listener(); }
  private fallBackToLegacy(): void {
    this.db?.close();
    this.db = null;
    this.mode = "legacy";
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

      void this.open().catch(() => this.fallBackToLegacy()).finally(finish);
    });
    return this.initPromise;
  }
  private async open(): Promise<void> {
    if (!this.factory) return;
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const opening = this.factory!.open(SAVE_DATABASE_NAME, 1);
        let expired = false;
        const timeout = setTimeout(() => { expired = true; reject(new Error("Save database unavailable")); }, 2500);
        opening.onupgradeneeded = () => {
          const db = opening.result;
          db.createObjectStore("campaigns", { keyPath: "seed" });
          db.createObjectStore("slots", { keyPath: "id" });
          db.createObjectStore("metadata", { keyPath: "key" });
        };
        opening.onsuccess = () => { clearTimeout(timeout); if (expired) opening.result.close(); else resolve(opening.result); };
        opening.onerror = () => { clearTimeout(timeout); reject(opening.error); };
      });
      this.db = db;
      db.onversionchange = () => { this.close(); this.publish(); };
      this.mode = "indexeddb";
      await this.migrateLegacy();
      await this.recoverJournals();
      await this.refresh();
      if (typeof BroadcastChannel !== "undefined" && typeof window !== "undefined") {
        this.channel = new BroadcastChannel("shiftingfront-save-revisions");
        this.channel.onmessage = ({ data }) => { if (data?.type === "committed") void this.refresh().catch(() => undefined); };
      }
    } catch {
      this.fallBackToLegacy();
    }
  }
  private async transaction<T>(stores: string[], work: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    if (!this.db) throw new Error("Save database unavailable");
    const tx = this.db.transaction(stores, "readwrite");
    const done = completion(tx);
    try { const result = await work(tx); await done; return result; }
    catch (error) { try { tx.abort(); } catch {} await done.catch(() => undefined); throw error; }
  }
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
    for (const record of metadata) if (record.unreadable && !next.getItem(record.key)) next.setItem(record.key, record.raw);
    this.cache = next;
    this.publish();
  }
  private async committed(): Promise<void> {
    if (this.db) await this.refresh();
    else this.publish();
    this.channel?.postMessage({ type: "committed", revisions: [...this.revisions] });
  }
  private async migrateLegacy(): Promise<void> {
    for (const key of safeKeys(this.legacy).sort()) {
      if (!key.startsWith(SAVE_PREFIX) && !key.startsWith(CAMPAIGN_PREFIX) && !key.startsWith(SLOT_PREFIX)) continue;
      const raw = safeGetItem(this.legacy, key);
      if (!raw) continue;
      await this.transaction(["campaigns", "slots", "metadata"], async (tx) => {
        const metadata = tx.objectStore("metadata");
        const previous = await request(metadata.get(key)) as MigrationRecord | undefined;
        if (previous?.raw === raw) return;
        try {
          if (key.startsWith(SLOT_PREFIX)) {
            const slot = decodeSlot(raw);
            const id = key.slice(SLOT_PREFIX.length);
            if (!isSlotId(id)) throw new Error("Invalid slot ID");
            const slots = tx.objectStore("slots");
            const existing = await request(slots.get(id)) as SlotRecord | undefined;
            slots.put({ id: existing ? createSlotId() : id, revision: 1, raw } satisfies SlotRecord);
            void slot;
          } else {
            const seed = Number(key.slice(key.lastIndexOf(":") + 1));
            if (!/^\d{4}$/.test(key.slice(key.lastIndexOf(":") + 1))) throw new Error("Invalid seed key");
            const campaigns = tx.objectStore("campaigns");
            const existing = await request(campaigns.get(seed)) as CampaignRecord | undefined;
            const record = existing ?? { seed, revision: 0, autosave: null, progress: null };
            if (key.startsWith(SAVE_PREFIX)) {
              const saved = decodeSave(raw);
              if (saved.state.seed !== seed) throw new Error("Save seed mismatch");
              if (record.autosave && record.autosave !== raw) {
                const temp = memoryStorage();
                const result = writeSlot(temp, { name: "Recovered legacy save", state: saved.state, campaign: progressFor(record, saved.state) });
                if (result.ok) tx.objectStore("slots").put({ id: result.id, revision: 1, raw: temp.getItem(slotKey(result.id))! });
              } else {
                record.autosave = raw;
                if (saved.state.result === "won") record.progress = encodeProgress(progressFor(record, saved.state));
              }
            } else {
              const progress = validatedProgress(raw, seed);
              if (!record.progress) record.progress = progress;
              else if (previous && previous.raw !== raw && record.autosave) {
                const temp = memoryStorage();
                const result = writeSlot(temp, { name: "Recovered legacy progress", state: decodeSave(record.autosave).state,
                  campaign: readCampaignProgress(memoryStorage({ [key]: progress }), seed) });
                if (result.ok) tx.objectStore("slots").put({ id: result.id, revision: 1, raw: temp.getItem(slotKey(result.id))! });
              }
            }
            record.revision++;
            campaigns.put(record);
          }
          metadata.put({ key, raw } satisfies MigrationRecord);
        } catch { metadata.put({ key, raw, unreadable: true } satisfies MigrationRecord); }
      });
    }
  }
  private async recoverJournals(): Promise<void> {
    for (const key of safeKeys(this.legacy).filter((key) => key.startsWith(JOURNAL_PREFIX))) {
      const raw = safeGetItem(this.legacy, key);
      if (!raw) continue;
      try {
        const journal: Journal = JSON.parse(raw);
        const state = decodeSave(journal.autosave).state;
        if (!Number.isSafeInteger(journal.revision) || journal.revision < 0
          || key !== `${JOURNAL_PREFIX}${state.seed.toString().padStart(4, "0")}`) throw new Error("Invalid recovery journal");
        const progress = validatedProgress(journal.progress, state.seed);
        await this.transaction(["campaigns", "slots"], async (tx) => {
          const store = tx.objectStore("campaigns");
          const record = await request(store.get(state.seed)) as CampaignRecord | undefined;
          if (record?.autosave && JSON.stringify(decodeSave(record.autosave).state) === JSON.stringify(state)) return;
          if ((record?.revision ?? 0) === journal.revision) {
            store.put({ seed: state.seed, revision: journal.revision + 1, autosave: journal.autosave, progress });
          } else {
            const temp = memoryStorage({ [campaignKey(state.seed)]: progress });
            const result = writeSlot(temp, { name: "Recovered interrupted save", state, campaign: readCampaignProgress(temp, state.seed) });
            if (result.ok) tx.objectStore("slots").put({ id: result.id, revision: 1, raw: temp.getItem(slotKey(result.id))! });
          }
        });
        safeRemoveItem(this.legacy, key);
      } catch {
        // Preserve the original and expose malformed journals in the existing damaged-slot UI.
        const id = `journal${key.slice(JOURNAL_PREFIX.length)}`;
        if (isSlotId(id)) await this.transaction(["metadata"], async (tx) => {
          tx.objectStore("metadata").put({ key: slotKey(id), raw, unreadable: true, sourceKey: key } satisfies MigrationRecord);
        });
      }
    }
  }
  writeJournal(state: SimState, revision = this.revisions.get(state.seed) ?? 0): boolean {
    try {
      return safeSetItem(this.legacy, `${JOURNAL_PREFIX}${state.seed.toString().padStart(4, "0")}`, JSON.stringify({
        revision, autosave: encode(state), progress: encodeProgress(progressFor({ seed: state.seed, revision, autosave: null,
          progress: this.storage.getItem(campaignKey(state.seed)) }, state)), savedAt: Date.now(),
      } satisfies Journal));
    } catch { return false; }
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
        try { captured = decodeSave(encode(state)).state; } catch { return Promise.resolve("failed" as const); }
        const token = generation;
        const next = writes.then(() => token !== generation ? "conflict" as const : this.save(captured, mode === "implicit" ? revision : undefined, () => token === generation)).then((status) => {
          if (status === "saved" && token === generation) { revision = this.revisions.get(seed) ?? revision; external = false; }
          return status;
        });
        writes = next.catch(() => undefined);
        return next;
      },
      adoptCurrent: () => { generation++; revision = this.revisions.get(seed) ?? 0; external = false; },
      markExternalChange: () => { external = true; },
      writeJournal: (state) => this.writeJournal(state, revision),
    };
  }
  save(state: SimState, expectedRevision?: number, isCurrent: () => boolean = () => true): Promise<SaveWriteStatus> {
    // Capture before queueing: simulation keeps mutating its original object.
    let autosave: string;
    try { autosave = encode(state); } catch { return Promise.resolve("failed"); }
    const captured = decodeSave(autosave).state;
    return this.enqueue(async () => {
      if (!isCurrent()) return "conflict";
      if (this.mode === "legacy") {
        const previousAutosave = safeGetItem(this.legacy, saveKey(captured.seed));
        const previousProgress = safeGetItem(this.legacy, campaignKey(captured.seed));
        const written = safeSetItem(this.legacy, saveKey(captured.seed), autosave);
        if (written && captured.result === "won") {
          const progress = completeMission({ ...readCampaignProgress(this.legacy, captured.seed), gameplayRulesVersion: captured.gameplayRulesVersion ?? 1 }, captured.missionIndex, missionMedals(captured), missionScore(captured));
          if (!writeCampaignProgress(this.legacy, progress)) {
            if (previousAutosave === null) safeRemoveItem(this.legacy, saveKey(captured.seed));
            else safeSetItem(this.legacy, saveKey(captured.seed), previousAutosave);
            if (previousProgress === null) safeRemoveItem(this.legacy, campaignKey(captured.seed));
            else safeSetItem(this.legacy, campaignKey(captured.seed), previousProgress);
            return "failed";
          }
        }
        this.publish(); return written ? "saved" : "failed";
      }
      const status = await this.transaction(["campaigns"], async (tx) => {
        const store = tx.objectStore("campaigns");
        const record: CampaignRecord = await request(store.get(captured.seed)) ?? { seed: captured.seed, revision: 0, autosave: null, progress: null };
        if (!isCurrent()) return "conflict" as const;
        if (expectedRevision !== undefined && record.revision !== expectedRevision) return "conflict" as const;
        store.put({ ...record, revision: record.revision + 1, autosave, progress: encodeProgress(progressFor(record, captured)) });
        return "saved" as const;
      });
      if (status === "saved") await this.committed();
      return status;
    }).catch(() => "failed");
  }
  saveSlot(input: { id?: string; name: string; state: SimState; campaign: CampaignProgress }, isCurrent: () => boolean = () => true): Promise<SlotWriteResult> {
    const temp = memoryStorage();
    const result = writeSlot(temp, input);
    if (!result.ok) return Promise.resolve(result);
    const raw = temp.getItem(slotKey(result.id))!;
    const captured = decodeSlot(raw);
    const autosave = encode(captured.state);
    return this.enqueue(async () => {
      if (!isCurrent()) return { ok: false } as const;
      if (this.mode === "legacy") {
        const previousSlot = safeGetItem(this.legacy, slotKey(result.id));
        const previousAutosave = safeGetItem(this.legacy, saveKey(captured.state.seed));
        if (!isCurrent()) return { ok: false } as const;
        if (!safeSetItem(this.legacy, slotKey(result.id), raw)) return { ok: false } as const;
        if (!isCurrent()) {
          if (previousSlot === null) safeRemoveItem(this.legacy, slotKey(result.id));
          else safeSetItem(this.legacy, slotKey(result.id), previousSlot);
          return { ok: false } as const;
        }
        const autosaveWritten = safeSetItem(this.legacy, saveKey(captured.state.seed), autosave);
        if (!autosaveWritten || !isCurrent()) {
          if (previousSlot === null) safeRemoveItem(this.legacy, slotKey(result.id));
          else safeSetItem(this.legacy, slotKey(result.id), previousSlot);
          if (previousAutosave !== null) safeSetItem(this.legacy, saveKey(captured.state.seed), previousAutosave);
          else safeRemoveItem(this.legacy, saveKey(captured.state.seed));
          return { ok: false } as const;
        }
      } else await this.transaction(["slots", "campaigns"], async (tx) => {
        if (!isCurrent()) throw new Error("Save operation cancelled");
        const slots = tx.objectStore("slots");
        const previous = await request(slots.get(result.id)) as SlotRecord | undefined;
        if (!isCurrent()) throw new Error("Save operation cancelled");
        if (!input.id && previous) throw new Error("Slot ID collision");
        slots.put({ id: result.id, revision: (previous?.revision ?? 0) + 1, raw });
        const campaigns = tx.objectStore("campaigns");
        const record = await request(campaigns.get(captured.state.seed)) as CampaignRecord | undefined;
        if (!isCurrent()) throw new Error("Save operation cancelled");
        campaigns.put({ seed: captured.state.seed, revision: (record?.revision ?? 0) + 1, autosave, progress: encodeProgress(captured.campaign) });
      });
      if (!isCurrent()) return { ok: false } as const;
      await this.committed(); return result;
    }).catch(() => ({ ok: false }));
  }
  restoreSlot(slot: ParsedSlot, isCurrent: () => boolean = () => true): Promise<string | null> {
    const autosave = encode(slot.state);
    const progress = encodeProgress(slot.campaign);
    return this.enqueue(async () => {
      if (!isCurrent()) return "Couldn't restore the slot because the mission changed before storage was ready.";
      if (this.mode === "legacy") {
        const { restoreSlot } = await import("./restore");
        if (!isCurrent()) return "Couldn't restore the slot because the mission changed before storage was ready.";
        return restoreSlot(this.legacy, slot);
      }
      await this.transaction(["campaigns"], async (tx) => {
        if (!isCurrent()) throw new Error("Save operation cancelled");
        const store = tx.objectStore("campaigns");
        const record = await request(store.get(slot.state.seed)) as CampaignRecord | undefined;
        if (!isCurrent()) throw new Error("Save operation cancelled");
        store.put({ seed: slot.state.seed, revision: (record?.revision ?? 0) + 1, autosave, progress });
      });
      if (!isCurrent()) return "Couldn't restore the slot because the mission changed before storage was ready.";
      await this.committed(); return null;
    }).catch(() => "Couldn't restore the slot. Browser storage is unavailable; your current mission is unchanged.");
  }
  importSlot(raw: string): Promise<SlotWriteResult> {
    if (raw.length > 1_048_576) return Promise.resolve({ ok: false });
    let decoded: ReturnType<typeof decodeSlot>;
    try { decoded = decodeSlot(raw); } catch { return Promise.resolve({ ok: false }); }
    const temp = memoryStorage();
    const result = writeSlot(temp, decoded);
    if (!result.ok) return Promise.resolve(result);
    return this.enqueue(async () => {
      const imported = temp.getItem(slotKey(result.id))!;
      if (this.mode === "legacy") { if (!safeSetItem(this.legacy, slotKey(result.id), imported)) return { ok: false } as const; }
      else await this.transaction(["slots"], async (tx) => {
        const store = tx.objectStore("slots");
        if (await request(store.get(result.id))) throw new Error("Slot ID collision");
        store.put({ id: result.id, revision: 1, raw: imported });
      });
      await this.committed(); return result;
    }).catch(() => ({ ok: false }));
  }
  remove(key: string): Promise<boolean> {
    return this.enqueue(async () => {
      if (this.mode === "legacy") return safeRemoveItem(this.legacy, key);
      let sourceKey = key;
      await this.transaction(["campaigns", "slots", "metadata"], async (tx) => {
        const previous = await request(tx.objectStore("metadata").get(key)) as MigrationRecord | undefined;
        sourceKey = previous?.sourceKey ?? key;
        const raw = safeGetItem(this.legacy, key);
        if (raw) tx.objectStore("metadata").put({ key, raw } satisfies MigrationRecord);
        else tx.objectStore("metadata").delete(key);
        if (key.startsWith(SLOT_PREFIX)) tx.objectStore("slots").delete(key.slice(SLOT_PREFIX.length));
        else {
          const seed = Number(key.slice(key.lastIndexOf(":") + 1));
          const store = tx.objectStore("campaigns");
          const record = await request(store.get(seed)) as CampaignRecord | undefined;
          if (record) store.put({ ...record, revision: record.revision + 1, autosave: null });
        }
      });
      const removed = safeRemoveItem(this.legacy, sourceKey);
      await this.committed(); return removed;
    }).catch(() => false);
  }
  async clear(): Promise<boolean> {
    this.generation++;
    await this.queue;
    try {
      if (this.db) await this.transaction(["campaigns", "slots", "metadata"], async (tx) => {
        for (const store of ["campaigns", "slots", "metadata"]) tx.objectStore(store).clear();
      });
      const cleared = clearAllGameData(this.legacy);
      await this.committed(); return cleared;
    } catch { return false; }
  }
  close(): void {
    this.generation++;
    this.channel?.close();
    this.channel = null;
    this.db?.close();
    this.db = null;
    this.mode = "legacy";
  }
}

let repository: SaveRepository | null = null;
export function getSaveRepository(): SaveRepository | null { return repository; }
export function cachedCampaignStorage(): StorageAdapter { return repository?.storage ?? cachedLocalStorage(); }
export async function initializeSaveRepository(): Promise<SaveRepository> {
  repository ??= new SaveRepository();
  await repository.initialize();
  return repository;
}
