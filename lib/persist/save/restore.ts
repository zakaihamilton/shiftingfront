import { campaignKey, readCampaignProgress, writeCampaignProgress } from "../campaign";
import { writeSave } from "./api";
import { saveKey } from "./serialize";
import type { ParsedSlot } from "./slots";
import { safeGetItem, safeRemoveItem, safeSetItem, type StorageAdapter } from "./storage";
import { isCurrentGameplayRules, progressAfterRetiredBattlefield, RULES_REBUILD_NOTICE } from "../rulesRetirement";

/** Restore both records before changing the active mission or its URL. */
export function restoreSlot(storage: StorageAdapter, slot: ParsedSlot): string | null {
  if (!isCurrentGameplayRules(slot.state.gameplayRulesVersion)) {
    const existingRaw = safeGetItem(storage, campaignKey(slot.state.seed));
    const existing = existingRaw ? readCampaignProgress(storage, slot.state.seed) : null;
    const kept = writeCampaignProgress(storage, progressAfterRetiredBattlefield(existing, slot.campaign, slot.state.missionIndex));
    return kept
      ? RULES_REBUILD_NOTICE
      : "Couldn't preserve campaign progress from that slot because browser storage is unavailable. Your current mission is unchanged.";
  }
  const key = saveKey(slot.state.seed);
  let previous: string | null;
  try {
    // A failed read must not be mistaken for an absent autosave during rollback.
    previous = storage.getItem(key);
  } catch {
    return "Couldn't load the slot because browser storage is unavailable. Your current mission is unchanged.";
  }
  if (!writeSave(storage, slot.state)) {
    return "Couldn't load the slot because its autosave could not be written. Your current mission is unchanged.";
  }
  if (writeCampaignProgress(storage, slot.campaign)) return null;
  const rolledBack = previous === null
    ? safeRemoveItem(storage, key)
    : safeSetItem(storage, key, previous);
  return rolledBack
    ? "Couldn't restore campaign progress. The previous autosave was restored; your current mission is unchanged."
    : "Couldn't restore campaign progress or recover the previous autosave. Your current mission is still open; the named slot is intact. Free browser storage and load the slot again.";
}
