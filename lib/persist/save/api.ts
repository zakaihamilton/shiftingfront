import { formatSeed } from "../../seed/rng";
import { generateWorld } from "../../gen/world";
import type { SimState } from "../../types";
import { safeGetItem, safeSetItem, safeRemoveItem, safeKeys, type StorageAdapter } from "./storage";
import {
  SAVE_PREFIX,
  SAVE_VERSION,
  SAVE_CONTENT_VERSION,
  type SaveEnvelope,
  type SaveMeta,
  saveKey,
  decodeSave,
  encodeSavedState,
} from "./serialize";

export function writeSave(storage: StorageAdapter, state: SimState): boolean {
  try {
    const payload: SaveEnvelope = {
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      savedAt: Date.now(),
      state: encodeSavedState(state),
    };
    return safeSetItem(storage, saveKey(state.seed), JSON.stringify(payload));
  } catch (err) {
    console.debug(`[persist] Failed to serialize save for seed ${state.seed}:`, err);
    return false;
  }
}

export function hasSaveForSeed(storage: StorageAdapter, seed: number): boolean {
  return safeGetItem(storage, saveKey(seed)) !== null;
}

export function readSave(storage: StorageAdapter, seed: number): SimState | null {
  const raw = safeGetItem(storage, saveKey(seed));
  if (!raw) return null;
  try {
    const { state } = decodeSave(raw);
    return state.seed === seed ? state : null;
  } catch (err) {
    console.debug(`[persist] Failed to read save for seed ${seed}:`, err);
    return null;
  }
}

export function removeSave(storage: StorageAdapter, seed: number): void {
  safeRemoveItem(storage, saveKey(seed));
}

/** Save keys whose payload cannot be migrated into a playable state. */
export function listUnreadableSaves(storage: StorageAdapter): string[] {
  const unreadable: string[] = [];
  for (const key of safeKeys(storage)) {
    if (!key.startsWith(SAVE_PREFIX)) continue;
    const seed = key.slice(SAVE_PREFIX.length);
    if (!/^\d{4}$/.test(seed)) continue;
    try {
      const { state } = decodeSave(safeGetItem(storage, key) ?? "");
      if (state.seed !== Number(seed)) unreadable.push(seed);
    } catch (err) {
      console.debug(`[persist] Save ${key} is unreadable:`, err);
      unreadable.push(seed);
    }
  }
  return unreadable.sort();
}

export function listSaves(storage: StorageAdapter): SaveMeta[] {
  const out: SaveMeta[] = [];
  for (const key of safeKeys(storage)) {
    if (!key.startsWith(SAVE_PREFIX)) continue;
    const raw = safeGetItem(storage, key);
    if (!raw) continue;
    try {
      const { state: s, savedAt } = decodeSave(raw);
      if (key !== saveKey(s.seed)) continue;
      out.push({
        seed: formatSeed(s.seed),
        campaignName: generateWorld(s.seed).name,
        missionIndex: s.missionIndex,
        tick: s.tick,
        result: s.result,
        missionName: s.missionName,
        savedAt,
      });
    } catch (err) {
      console.debug(`[persist] Failed to list save ${key}:`, err);
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt || a.seed.localeCompare(b.seed));
}
