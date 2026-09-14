import { TICKS_PER_SECOND } from "../catalog";
import type { Rng } from "../seed/rng";

export const MIN_MISSION_MINUTES = 5;
export const MAX_MISSION_MINUTES = 20;
export const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND;

/** Fail-deadline scenario windows are scaled for casual play; hold-the-line stays on the 5–20 curve. */
export const DEADLINE_DURATION_MULT = 1.5;
export const MAX_DEADLINE_MINUTES = 30;
export const MIN_DEADLINE_MINUTES = 10;
export const MIN_SABOTAGE_MINUTES = 12;

/** Mission 0 ≈ 5.5 min, mission 7 ≈ 19 min, with ±1 min jitter, clamped to 5–20. */
export function missionDurationMinutes(missionIndex: number, rng: Rng): number {
  const base = 5.5 + missionIndex * (13.5 / 7);
  const jitter = (rng.next() - 0.5) * 2;
  return Math.max(MIN_MISSION_MINUTES, Math.min(MAX_MISSION_MINUTES, Math.round(base + jitter)));
}

export function minutesToTicks(minutes: number): number {
  return Math.round(minutes * TICKS_PER_MINUTE);
}

/** Escort missions spend this long staging the convoy before it starts moving. */
export const CONVOY_STAGING_MINUTES = 3;
export const CONVOY_STAGING_TICKS = minutesToTicks(CONVOY_STAGING_MINUTES);
/** Extra escort time covers the final approach through a contested route. */
export const CONVOY_COMPLETION_BUFFER_MINUTES = 3;
export const CONVOY_COMPLETION_BUFFER_TICKS = minutesToTicks(CONVOY_COMPLETION_BUFFER_MINUTES);

/** Formats a player-facing mission clock with a stable two-digit minute field. */
export function formatMissionClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/** Converts simulation ticks to a player-facing countdown, rounding up to the next second. */
export function formatMissionClockFromTicks(ticks: number): string {
  return formatMissionClock(Math.ceil(Math.max(0, ticks) / TICKS_PER_SECOND));
}

/** Formats a generated mission duration as a whole-minute player-facing label. */
export function formatMissionMinutes(minutes: number): string {
  return `${Math.max(0, Math.round(minutes))} min`;
}

/** Converts a generated mission deadline to a whole-minute player-facing label. */
export function formatMissionMinutesFromTicks(ticks: number): string {
  const safeTicks = Math.max(0, ticks);
  return formatMissionMinutes(safeTicks === 0 ? 0 : Math.max(1, Math.round(safeTicks / TICKS_PER_MINUTE)));
}

export const MIN_MISSION_TICKS = minutesToTicks(MIN_MISSION_MINUTES);
export const MAX_MISSION_TICKS = minutesToTicks(MAX_MISSION_MINUTES);
export const MAX_DEADLINE_TICKS = minutesToTicks(MAX_DEADLINE_MINUTES);
/** Longest player-facing fail-deadline, including escort staging and its approach buffer. */
export const MAX_OPERATION_TICKS = minutesToTicks(MAX_DEADLINE_MINUTES + CONVOY_STAGING_MINUTES + CONVOY_COMPLETION_BUFFER_MINUTES);
