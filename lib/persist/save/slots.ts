import { formatSeed } from "../../seed/rng";
import { generateWorld } from "../../gen/world";
import type { CampaignProgress, SimState } from "../../types";
import { isRecord } from "../utils";
import {
  SAVE_CONTENT_VERSION,
  isCampaignProgressShape,
  isNumber,
  assertSupportedContentVersion,
} from "./validation";
import { decodeSavedState, encodeSavedState } from "./serialize";
import { migrateSaveContent } from "./migrations";
import { listSaves } from "./api";
import { safeGetItem, safeKeys, safeRemoveItem, safeSetItem, type StorageAdapter } from "./storage";

export const SLOT_PREFIX = "shiftingfront:slot:";
export const SLOT_VERSION = 1;
export const SLOT_NAME_MAX = 40;
export const SLOT_IMPORT_MAX_BYTES = 1_048_576;
export const SLOT_ID_PATTERN = /^[a-z0-9]{8,32}$/i;

export type SlotEnvelope = {
  version: typeof SLOT_VERSION;
  contentVersion: typeof SAVE_CONTENT_VERSION;
  savedAt: number;
  name: string;
  state: unknown;
  campaign: CampaignProgress;
};

export type SlotMeta = {
  id: string;
  name: string;
  seed: string;
  campaignName: string;
  missionIndex: number;
  tick: number;
  result: SimState["result"];
  missionName: string;
  savedAt: number;
};

export type ParsedSlot = {
  id: string;
  name: string;
  savedAt: number;
  state: SimState;
  campaign: CampaignProgress;
};

export type ArchiveEntry =
  | (SlotMeta & { kind: "slot" })
  | {
      kind: "autosave";
      seed: string;
      campaignName: string;
      missionIndex: number;
      tick: number;
      result: SimState["result"];
      missionName: string;
      savedAt: number;
    };

export type SlotWriteResult = { ok: true; id: string } | { ok: false };

export function slotKey(id: string): string {
  return `${SLOT_PREFIX}${id}`;
}

export function isSlotId(value: string): boolean {
  return SLOT_ID_PATTERN.test(value);
}

export function normalizeSlotName(name: string): string | null {
  const normalized = name.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, SLOT_NAME_MAX);
}

export function defaultSlotName(state: SimState): string {
  return normalizeSlotName(`${generateWorld(state.seed).name} · M${state.missionIndex + 1}`)
    ?? `Mission ${state.missionIndex + 1}`;
}

function randomSlotId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createSlotId(storage?: StorageAdapter): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = randomSlotId();
    if (!storage || safeGetItem(storage, slotKey(id)) === null) return id;
  }
  return `${randomSlotId()}${Date.now().toString(36)}`.slice(0, 32);
}

export function decodeSlot(raw: string): Omit<ParsedSlot, "id"> {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed.version !== SLOT_VERSION || !isNumber(parsed.savedAt)) {
    throw new Error("Unsupported save slot version");
  }
  assertSupportedContentVersion(parsed.contentVersion);
  const name = typeof parsed.name === "string" ? normalizeSlotName(parsed.name) : null;
  if (!name) throw new Error("Invalid save slot name");
  if (!isCampaignProgressShape(parsed.campaign)) throw new Error("Invalid campaign progress");
  const state = decodeSavedState(migrateSaveContent(parsed.state, parsed.contentVersion));
  if (state.seed !== parsed.campaign.seed) throw new Error("Save and campaign seeds must match");
  return { name, savedAt: parsed.savedAt, state, campaign: parsed.campaign };
}

/** Return a validated slot envelope suitable for downloading as a JSON file. */
export function exportSlot(storage: StorageAdapter, id: string): string | null {
  if (!isSlotId(id)) return null;
  const raw = safeGetItem(storage, slotKey(id));
  if (!raw) return null;
  try {
    decodeSlot(raw);
    return raw;
  } catch (err) {
    console.debug(`[persist] Failed to export save slot ${id}:`, err);
    return null;
  }
}

/** Import a slot as a new local save without replacing any existing slot. */
export function importSlot(storage: StorageAdapter, raw: string): SlotWriteResult {
  if (raw.length > SLOT_IMPORT_MAX_BYTES) {
    console.debug("[persist] Rejected oversized save slot import");
    return { ok: false };
  }
  try {
    const decoded = decodeSlot(raw);
    return writeSlot(storage, {
      name: decoded.name,
      state: decoded.state,
      campaign: decoded.campaign,
    });
  } catch (err) {
    console.debug("[persist] Failed to import save slot:", err);
    return { ok: false };
  }
}

export function writeSlot(
  storage: StorageAdapter,
  {
    id,
    name,
    state,
    campaign,
    savedAt = Date.now(),
  }: {
    id?: string;
    name: string;
    state: SimState;
    campaign: CampaignProgress;
    savedAt?: number;
  },
): SlotWriteResult {
  const normalizedName = normalizeSlotName(name);
  if (!normalizedName) return { ok: false };
  if (!isCampaignProgressShape(campaign) || state.seed !== campaign.seed) return { ok: false };
  const slotId = id && isSlotId(id) ? id : createSlotId(storage);
  // Fresh imports must never replace an existing slot if ID generation ever
  // collides (explicit IDs retain the existing save/overwrite behavior).
  if (!id && safeGetItem(storage, slotKey(slotId)) !== null) return { ok: false };
  try {
    const payload: SlotEnvelope = {
      version: SLOT_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      savedAt,
      name: normalizedName,
      state: encodeSavedState(state),
      campaign,
    };
    if (!safeSetItem(storage, slotKey(slotId), JSON.stringify(payload))) return { ok: false };
    return { ok: true, id: slotId };
  } catch (err) {
    console.debug(`[persist] Failed to serialize save slot ${slotId}:`, err);
    return { ok: false };
  }
}

export function readSlot(storage: StorageAdapter, id: string): ParsedSlot | null {
  if (!isSlotId(id)) return null;
  const raw = safeGetItem(storage, slotKey(id));
  if (!raw) return null;
  try {
    return { id, ...decodeSlot(raw) };
  } catch (err) {
    console.debug(`[persist] Failed to read save slot ${id}:`, err);
    return null;
  }
}

export function removeSlot(storage: StorageAdapter, id: string): void {
  if (!isSlotId(id)) return;
  safeRemoveItem(storage, slotKey(id));
}

export function listSlots(storage: StorageAdapter): SlotMeta[] {
  const out: SlotMeta[] = [];
  for (const key of safeKeys(storage)) {
    if (!key.startsWith(SLOT_PREFIX)) continue;
    const id = key.slice(SLOT_PREFIX.length);
    if (!isSlotId(id)) continue;
    const raw = safeGetItem(storage, key);
    if (!raw) continue;
    try {
      const slot = decodeSlot(raw);
      out.push({
        id,
        name: slot.name,
        seed: formatSeed(slot.state.seed),
        campaignName: generateWorld(slot.state.seed).name,
        missionIndex: slot.state.missionIndex,
        tick: slot.state.tick,
        result: slot.state.result,
        missionName: slot.state.missionName,
        savedAt: slot.savedAt,
      });
    } catch (err) {
      console.debug(`[persist] Failed to list save slot ${key}:`, err);
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function listUnreadableSlots(storage: StorageAdapter): string[] {
  const unreadable: string[] = [];
  for (const key of safeKeys(storage)) {
    if (!key.startsWith(SLOT_PREFIX)) continue;
    const id = key.slice(SLOT_PREFIX.length);
    if (!isSlotId(id)) continue;
    try {
      decodeSlot(safeGetItem(storage, key) ?? "");
    } catch (err) {
      console.debug(`[persist] Save slot ${key} is unreadable:`, err);
      unreadable.push(id);
    }
  }
  return unreadable.sort();
}

export function listArchiveEntries(storage: StorageAdapter): ArchiveEntry[] {
  const slots: ArchiveEntry[] = listSlots(storage).map((slot) => ({ ...slot, kind: "slot" }));
  const autosaves: ArchiveEntry[] = listSaves(storage).map((save) => ({ ...save, kind: "autosave" }));
  return [...slots, ...autosaves].sort((a, b) => {
    if (b.savedAt !== a.savedAt) return b.savedAt - a.savedAt;
    if (a.kind !== b.kind) return a.kind === "slot" ? -1 : 1;
    return a.seed.localeCompare(b.seed);
  });
}

export function hasLoadableSaves(storage: StorageAdapter, seed?: number): boolean {
  if (listSlots(storage).length > 0) return true;
  if (seed === undefined) return listSaves(storage).length > 0;
  // Match the load list rather than checking for a raw key. A corrupt or
  // unsupported autosave can remain in storage, but it is not loadable and
  // must not open an empty pause-menu load screen.
  return listSaves(storage).some((save) => save.seed === formatSeed(seed));
}

export function listPauseLoadEntries(storage: StorageAdapter, seed: number): ArchiveEntry[] {
  const seedKey = formatSeed(seed);
  return listArchiveEntries(storage).filter((entry) => entry.kind === "slot" || entry.seed === seedKey);
}
