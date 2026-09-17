import { createCampaign } from "@/lib/gen/campaign";
import { CINEMA_SCENARIO_KINDS, CINEMA_SEED, type CinemaScenarioKind } from "./scene";
import { PREVIEW_SHOT_COUNT } from "./shots";

export const PREVIEW_INITIAL_DELAY_MS = 5000;
export const PREVIEW_PLAY_MS = 5000;
export const PREVIEW_IDLE_MS = 3000;
export const PREVIEW_CYCLE_MS = PREVIEW_PLAY_MS + PREVIEW_IDLE_MS;
export const PREVIEW_LOCK_COUNT = 3;
export const PREVIEW_LOCK_IDS = ["a", "b", "c"] as const;

export type PreviewPhase = {
  expanded: boolean;
  lockIndex: number;
  shotIndex: number;
  cycleIndex: number;
  missionIndex: number;
  scenarioKind: CinemaScenarioKind;
};

export const EXCLUDED_SCENARIO_KINDS = ["rescue", "extraction", "escort", "sabotage"] as const;

export function normalMissionIndices(seed: number): number[] {
  const campaign = createCampaign(seed);
  const normal = campaign.missions
    .filter((m) => !EXCLUDED_SCENARIO_KINDS.includes(m.win.kind as (typeof EXCLUDED_SCENARIO_KINDS)[number]))
    .map((m) => m.index);
  return normal.length ? normal : [0];
}

export function previewSeed(cycleIndex: number): number {
  return (((CINEMA_SEED + Math.max(0, cycleIndex | 0) * 137) % 10000) + 10000) % 10000;
}

export function previewMissionIndex(cycleIndex: number, seed = CINEMA_SEED): number {
  const normal = normalMissionIndices(seed);
  return normal[Math.max(0, cycleIndex | 0) % normal.length]!;
}

export function previewScenarioKind(cycleIndex: number): CinemaScenarioKind {
  const index = ((Math.max(0, cycleIndex | 0) % CINEMA_SCENARIO_KINDS.length) + CINEMA_SCENARIO_KINDS.length) % CINEMA_SCENARIO_KINDS.length;
  return CINEMA_SCENARIO_KINDS[index]!;
}

export function previewAt(
  elapsedMs: number,
  lockCount = PREVIEW_LOCK_COUNT,
  shotCount = PREVIEW_SHOT_COUNT,
  initialDelayMs = PREVIEW_INITIAL_DELAY_MS,
  cycleOffset = 0,
): PreviewPhase {
  const elapsed = Math.max(0, elapsedMs);
  const baseCycle = Math.max(0, cycleOffset | 0);
  if (elapsed < initialDelayMs) {
    const seed = previewSeed(baseCycle);
    return {
      expanded: false,
      lockIndex: baseCycle % Math.max(1, lockCount),
      shotIndex: baseCycle % Math.max(1, shotCount),
      cycleIndex: baseCycle,
      missionIndex: previewMissionIndex(baseCycle, seed),
      scenarioKind: previewScenarioKind(baseCycle),
    };
  }
  const cycleElapsed = elapsed - initialDelayMs;
  const cycleIndex = baseCycle + Math.floor(cycleElapsed / PREVIEW_CYCLE_MS);
  const phase = cycleElapsed % PREVIEW_CYCLE_MS;
  const seed = previewSeed(cycleIndex);
  return {
    expanded: phase < PREVIEW_PLAY_MS,
    lockIndex: cycleIndex % Math.max(1, lockCount),
    shotIndex: cycleIndex % Math.max(1, shotCount),
    cycleIndex,
    missionIndex: previewMissionIndex(cycleIndex, seed),
    scenarioKind: previewScenarioKind(cycleIndex),
  };
}
