import { campaignKey, readCampaignProgress, writeCampaignProgress } from "../campaign";
import { decodeSave, SAVE_PREFIX } from "./serialize";
import { readSave, removeSave } from "./api";
import { readSlot, removeSlot, SLOT_PREFIX } from "./slots";
import { safeGetItem, safeKeys, safeRemoveItem, type StorageAdapter } from "./storage";
import { isRecord } from "../utils";
import {
  journalKey,
  planSeedRetirement,
  type RetiredSlot,
  type RulesRetirementSnapshot,
} from "../rulesRetirement";

function journalSnapshot(storage: StorageAdapter, seed: number): RulesRetirementSnapshot["journal"] {
  const raw = safeGetItem(storage, journalKey(seed));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.autosave !== "string" || typeof parsed.progress !== "string") return null;
    const state = decodeSave(parsed.autosave).state;
    if (state.seed !== seed) return null;
    const progress = readCampaignProgress(progressStorage(seed, parsed.progress), seed);
    return { state, progress };
  } catch {
    return null;
  }
}

function progressStorage(seed: number, raw: string): StorageAdapter {
  return {
    getItem: (key) => key === campaignKey(seed) ? raw : null,
    keys: () => [campaignKey(seed)],
    setItem: () => { throw new Error("Journal progress is read-only"); },
    removeItem: () => { throw new Error("Journal progress is read-only"); },
  };
}

/** Drop rules 1 battlefields on one storage adapter and keep the campaign record. */
export function applyRulesRetirement(storage: StorageAdapter): boolean {
  const seeds = new Set<number>();
  const slotsBySeed = new Map<number, RetiredSlot[]>();
  for (const key of safeKeys(storage)) {
    if (key.startsWith(SAVE_PREFIX) || key.startsWith("shiftingfront:campaign:") || key.startsWith("shiftingfront:journal:")) {
      const seedText = key.slice(key.lastIndexOf(":") + 1);
      if (/^\d{4}$/.test(seedText)) seeds.add(Number(seedText));
    } else if (key.startsWith(SLOT_PREFIX)) {
      const slot = readSlot(storage, key.slice(SLOT_PREFIX.length));
      if (!slot) continue;
      const list = slotsBySeed.get(slot.state.seed) ?? [];
      list.push(slot);
      slotsBySeed.set(slot.state.seed, list);
      seeds.add(slot.state.seed);
    }
  }
  let rebuilt = false;
  for (const seed of seeds) {
    const progressRaw = safeGetItem(storage, campaignKey(seed));
    const plan = planSeedRetirement({
      seed,
      progress: progressRaw ? readCampaignProgress(storage, seed) : null,
      autosave: readSave(storage, seed),
      slots: slotsBySeed.get(seed) ?? [],
      journal: journalSnapshot(storage, seed),
    });
    if (!plan) continue;
    if (!writeCampaignProgress(storage, plan.progress)) continue;
    if (plan.dropAutosave) removeSave(storage, seed);
    for (const id of plan.dropSlotIds) removeSlot(storage, id);
    if (plan.dropJournal) safeRemoveItem(storage, journalKey(seed));
    if (plan.rebuilt) rebuilt = true;
  }
  return rebuilt;
}
