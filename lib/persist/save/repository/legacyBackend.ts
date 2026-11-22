import { missionMedals, missionScore } from "@/lib/sim/debrief";
import type { CampaignProgress, SimState } from "@/lib/types";
import {
  campaignKey,
  completeMission,
  readCampaignProgress,
  retainedGameplayRules,
  writeCampaignProgress,
} from "../../campaign";
import { progressAfterRetiredBattlefield } from "../../rulesRetirement";
import { saveKey } from "../serialize";
import type { SaveWriteStatus } from "../session";
import { type ParsedSlot, slotKey } from "../slots";
import { type StorageAdapter, safeGetItem, safeRemoveItem, safeSetItem } from "../storage";

export function keepRetiredSlotLegacy(
  legacy: StorageAdapter,
  slot: { state: SimState; campaign: CampaignProgress },
): boolean {
  const seed = slot.state.seed;
  const existingRaw = safeGetItem(legacy, campaignKey(seed));
  const existing = existingRaw ? readCampaignProgress(legacy, seed) : null;
  return writeCampaignProgress(
    legacy,
    progressAfterRetiredBattlefield(existing, slot.campaign, slot.state.missionIndex),
  );
}

export function saveLegacy(
  legacy: StorageAdapter,
  autosave: string,
  captured: SimState,
): { status: SaveWriteStatus } {
  const previousAutosave = safeGetItem(legacy, saveKey(captured.seed));
  const previousProgress = safeGetItem(legacy, campaignKey(captured.seed));
  const written = safeSetItem(legacy, saveKey(captured.seed), autosave);
  if (written && captured.result === "won") {
    const recordExists = previousProgress !== null;
    const existing = readCampaignProgress(legacy, captured.seed);
    const progress = completeMission(
      {
        ...existing,
        gameplayRulesVersion: retainedGameplayRules(
          existing.gameplayRulesVersion,
          captured.gameplayRulesVersion,
          recordExists,
        ),
      },
      captured.missionIndex,
      missionMedals(captured),
      missionScore(captured),
    );
    if (!writeCampaignProgress(legacy, progress)) {
      if (previousAutosave === null) safeRemoveItem(legacy, saveKey(captured.seed));
      else safeSetItem(legacy, saveKey(captured.seed), previousAutosave);
      if (previousProgress === null) safeRemoveItem(legacy, campaignKey(captured.seed));
      else safeSetItem(legacy, campaignKey(captured.seed), previousProgress);
      return { status: "failed" };
    }
  }
  return { status: written ? "saved" : "failed" };
}

export function saveSlotLegacy(
  legacy: StorageAdapter,
  input: { id: string; raw: string; autosave: string; seed: number },
  isCurrent: () => boolean,
): boolean {
  const previousSlot = safeGetItem(legacy, slotKey(input.id));
  const previousAutosave = safeGetItem(legacy, saveKey(input.seed));
  if (!isCurrent()) return false;
  if (!safeSetItem(legacy, slotKey(input.id), input.raw)) return false;
  if (!isCurrent()) {
    if (previousSlot === null) safeRemoveItem(legacy, slotKey(input.id));
    else safeSetItem(legacy, slotKey(input.id), previousSlot);
    return false;
  }
  const autosaveWritten = safeSetItem(legacy, saveKey(input.seed), input.autosave);
  if (!autosaveWritten || !isCurrent()) {
    if (previousSlot === null) safeRemoveItem(legacy, slotKey(input.id));
    else safeSetItem(legacy, slotKey(input.id), previousSlot);
    if (previousAutosave !== null) safeSetItem(legacy, saveKey(input.seed), previousAutosave);
    else safeRemoveItem(legacy, saveKey(input.seed));
    return false;
  }
  return true;
}

export async function restoreSlotLegacy(
  legacy: StorageAdapter,
  slot: ParsedSlot,
  isCurrent: () => boolean,
): Promise<string | null> {
  const { restoreSlot } = await import("../restore");
  if (!isCurrent()) {
    return "Couldn't restore the slot because the mission changed before storage was ready.";
  }
  return restoreSlot(legacy, slot);
}
