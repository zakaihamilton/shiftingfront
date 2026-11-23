import { missionMedals, missionScore } from "@/lib/sim/debrief";
import type { CampaignProgress, SimState } from "@/lib/types";
import {
  CAMPAIGN_PREFIX,
  campaignKey,
  completeMission,
  readCampaignProgress,
  retainedGameplayRules,
  writeCampaignProgress,
} from "../../campaign";
import { mergeCampaignProgress } from "../../rulesRetirement";
import { writeSave } from "../api";
import { decodeSave, saveKey } from "../serialize";
import { memoryStorage, type StorageAdapter, safeGetItem, safeSetItem } from "../storage";
import { isCampaignProgressShape } from "../validation";

export const SAVE_FALLBACK_EPOCH_KEY = "shiftingfront:save-fallback-epoch";

export type CampaignRecord = {
  seed: number;
  revision: number;
  autosave: string | null;
  progress: string | null;
};

export type SlotRecord = { id: string; revision: number; raw: string };

export type MigrationRecord = {
  key: string;
  raw: string;
  unreadable?: boolean;
  sourceKey?: string;
};

export type Journal = {
  revision: number;
  autosave: string;
  progress: string;
  savedAt: number;
};

export type SaveTransaction = <T>(
  stores: string[],
  work: (tx: IDBTransaction) => Promise<T>,
) => Promise<T>;

export function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

export function completion(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Save transaction aborted"));
  });
}

export function encode(state: SimState): string {
  const memory = memoryStorage();
  if (!writeSave(memory, state)) throw new Error("Invalid save state");
  return memory.getItem(saveKey(state.seed))!;
}

export function encodeProgress(progress: CampaignProgress): string {
  const memory = memoryStorage();
  if (!writeCampaignProgress(memory, progress)) throw new Error("Invalid campaign progress");
  return memory.getItem(campaignKey(progress.seed))!;
}

export function progressFor(record: CampaignRecord, state: SimState): CampaignProgress {
  const existing = readCampaignProgress(
    memoryStorage(record.progress ? { [campaignKey(state.seed)]: record.progress } : {}),
    state.seed,
  );
  const progress = {
    ...existing,
    gameplayRulesVersion: retainedGameplayRules(
      existing.gameplayRulesVersion,
      state.gameplayRulesVersion,
      record.progress !== null,
    ),
  };
  return state.result === "won"
    ? completeMission(progress, state.missionIndex, missionMedals(state), missionScore(state))
    : progress;
}

export function progressSavedAt(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { savedAt?: unknown };
    return typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt)
      ? parsed.savedAt
      : 0;
  } catch {
    return 0;
  }
}

/** A later committed reward wins, including when the journal battlefield is a different snapshot. */
export function keepNewerDeploymentEdge(
  existing: CampaignProgress,
  merged: CampaignProgress,
  existingSavedAt: number,
  incomingSavedAt: number,
): CampaignProgress {
  if (existingSavedAt <= incomingSavedAt) return merged;
  const next = { ...merged };
  if (existing.deploymentEdge) next.deploymentEdge = existing.deploymentEdge;
  else delete next.deploymentEdge;
  return next;
}

function sameStatMap(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key])
  );
}

export function sameCampaignProgress(left: CampaignProgress, right: CampaignProgress): boolean {
  return (
    left.version === right.version &&
    left.seed === right.seed &&
    left.tutorialComplete === right.tutorialComplete &&
    left.unlockedMission === right.unlockedMission &&
    left.gameplayRulesVersion === right.gameplayRulesVersion &&
    left.deploymentEdge === right.deploymentEdge &&
    left.completedMissions.length === right.completedMissions.length &&
    left.completedMissions.every((mission, index) => mission === right.completedMissions[index]) &&
    sameStatMap(left.medals, right.medals) &&
    sameStatMap(left.bestScores, right.bestScores)
  );
}

function withoutDeploymentEdge(progress: CampaignProgress): CampaignProgress {
  const next = { ...progress };
  delete next.deploymentEdge;
  return next;
}

/**
 * A fresh launch restamps the legacy campaign envelope. That rewrite is not a
 * new import: keep the autosave revision so a crash journal can still resume.
 * A newer envelope may change only the deployment reward. An older envelope
 * must not erase a reward stored after it was written.
 */
export function legacyCampaignMirror(
  existing: CampaignProgress,
  incoming: CampaignProgress,
  existingSavedAt: number,
  incomingSavedAt: number,
): "keep" | "edge" | "merge" {
  if (!sameCampaignProgress(withoutDeploymentEdge(existing), withoutDeploymentEdge(incoming))) {
    return "merge";
  }
  if (existing.deploymentEdge === incoming.deploymentEdge) return "keep";
  return incomingSavedAt >= existingSavedAt ? "edge" : "keep";
}

/** Merge progress-only journal data when the battlefield snapshot is already stored. */
export function progressWhenBattlefieldMatches(
  record: CampaignRecord,
  journalSavedAt: number,
  progress: string,
): string | undefined {
  const existing = readCampaignProgress(
    memoryStorage(record.progress ? { [campaignKey(record.seed)]: record.progress } : {}),
    record.seed,
  );
  const incoming = readCampaignProgress(
    memoryStorage({ [campaignKey(record.seed)]: progress }),
    record.seed,
  );
  const merged = keepNewerDeploymentEdge(
    existing,
    mergeCampaignProgress(existing, incoming),
    progressSavedAt(record.progress),
    journalSavedAt,
  );
  return sameCampaignProgress(existing, merged) ? undefined : encodeProgress(merged);
}

function sortBattlefieldValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortBattlefieldValue);
  if (!value || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const nested = (value as Record<string, unknown>)[key];
    if (nested !== undefined) sorted[key] = sortBattlefieldValue(nested);
  }
  return sorted;
}

function canonicalBattlefield(state: SimState): string {
  const sorted = sortBattlefieldValue(state) as { entities?: { id?: number }[] };
  if (Array.isArray(sorted.entities)) {
    sorted.entities.sort((left, right) => (left.id ?? 0) - (right.id ?? 0));
  }
  return JSON.stringify(sorted);
}

export function sameBattlefield(left: SimState, right: SimState): boolean {
  return canonicalBattlefield(left) === canonicalBattlefield(right);
}

export function savedAtOf(raw: string): number {
  try {
    return decodeSave(raw).savedAt;
  } catch {
    return 0;
  }
}

export function validatedProgress(raw: string, seed: number): string {
  const parsed = JSON.parse(raw);
  if (
    parsed.version !== 1 ||
    !isCampaignProgressShape(parsed.progress) ||
    parsed.progress.seed !== seed
  ) {
    throw new Error("Invalid campaign progress");
  }
  return encodeProgress(readCampaignProgress(memoryStorage({ [campaignKey(seed)]: raw }), seed));
}

export function stampFallbackEpoch(legacy: StorageAdapter): void {
  const existing = Number(safeGetItem(legacy, SAVE_FALLBACK_EPOCH_KEY));
  if (!Number.isFinite(existing) || existing <= 0) {
    safeSetItem(legacy, SAVE_FALLBACK_EPOCH_KEY, String(Date.now()));
  }
}

export { CAMPAIGN_PREFIX };
