import type { MissionKind } from "../types";

/** Rescue and extraction lose on the clock if the contact team stalls. */
export function isTimedRecovery(kind: MissionKind): boolean {
  return kind === "rescue" || kind === "extraction";
}

/**
 * Player-bot yard reserve during timed recovery. Rescue keeps at least two
 * defenders; extraction can leave one. Other kinds keep a single slot so
 * callers can share the helper without a timed-recovery branch.
 */
export function scenarioHomeGuardSize(kind: MissionKind, combatCount: number): number {
  if (!isTimedRecovery(kind)) return 1;
  return Math.max(kind === "rescue" ? 2 : 1, Math.min(3, Math.floor(combatCount / 3)));
}

/** Enemy units held at the yard / resource lane. Independent of the player bot. */
export function homeGuardCount(missionIndex: number): number {
  return 1 + (missionIndex >= 4 ? 1 : 0);
}
