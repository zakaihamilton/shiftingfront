import { labelFor } from "../catalog";
import { createRng, type Rng } from "../seed/rng";
import type { BuildingKind, MissionKind, ReadonlyMissionDef, ReadonlyWinCategory, SecondaryObjective, UnitKind, WinCategory } from "../types";
import {
  CONVOY_STAGING_MINUTES,
  CONVOY_STAGING_TICKS,
  CONVOY_COMPLETION_BUFFER_MINUTES,
  CONVOY_COMPLETION_BUFFER_TICKS,
  DEADLINE_DURATION_MULT,
  formatMissionClockFromTicks,
  formatMissionMinutesFromTicks,
  MAX_DEADLINE_MINUTES,
  MIN_DEADLINE_MINUTES,
  MIN_SABOTAGE_MINUTES,
  minutesToTicks,
  missionDurationMinutes,
} from "./pacing";
import { objectiveContractFor } from "./profile";

// Structure quotas may ask for several copies, so do not generate a quota for
// the producer buildings that are capped at one per mission.
const BUILDABLE: BuildingKind[] = ["power", "refinery", "turret", "runway", "antiAirTurret"];
const COMBAT_ROLES: UnitKind[] = ["infantry", "antiArmor", "tank"];
const SCENARIO_KINDS: MissionKind[] = ["escort", "sabotage", "rescue", "extraction"];

function baseMissionDurationMinutes(seed: number, missionIndex: number, kind: MissionKind): number {
  const rng = createRng(seed, `win:${missionIndex}:${kind}`);
  return missionDurationMinutes(missionIndex, rng.fork("duration"));
}

function clampDeadlineMinutes(minutes: number, minMinutes: number): number {
  return Math.min(MAX_DEADLINE_MINUTES, Math.max(minMinutes, minutes));
}

function activeMissionDurationMinutes(kind: MissionKind, minutes: number): number {
  const scaled = Math.round(minutes * DEADLINE_DURATION_MULT);
  if (kind === "escort" || kind === "rescue") return clampDeadlineMinutes(scaled - 1, MIN_DEADLINE_MINUTES);
  if (kind === "sabotage") return clampDeadlineMinutes(scaled + 3, MIN_SABOTAGE_MINUTES);
  if (kind === "extraction") return clampDeadlineMinutes(scaled, MIN_DEADLINE_MINUTES);
  return minutes;
}

/** Returns the expected operation window in minutes, including escort staging and its approach buffer. */
export function missionDurationMinutesFor(
  seed: number,
  missionIndex: number,
  kind: MissionKind,
): number {
  const minutes = baseMissionDurationMinutes(seed, missionIndex, kind);
  const activeMinutes = activeMissionDurationMinutes(kind, minutes);
  return kind === "escort" ? activeMinutes + CONVOY_STAGING_MINUTES + CONVOY_COMPLETION_BUFFER_MINUTES : activeMinutes;
}

/** Returns the full player-facing time limit, including escort staging and its approach buffer. */
export function missionTimeLimitTicks(win: Pick<ReadonlyWinCategory, "kind" | "ticks">): number | undefined {
  if (win.ticks === undefined) return undefined;
  return win.ticks + (win.kind === "escort" ? CONVOY_STAGING_TICKS + CONVOY_COMPLETION_BUFFER_TICKS : 0);
}

export function missionTimeLimitClock(win: Pick<ReadonlyWinCategory, "kind" | "ticks">): string | undefined {
  const ticks = missionTimeLimitTicks(win);
  return ticks === undefined ? undefined : formatMissionClockFromTicks(ticks);
}

export function missionTimeLimitLabel(win: Pick<ReadonlyWinCategory, "kind" | "ticks">): string | undefined {
  const ticks = missionTimeLimitTicks(win);
  return ticks === undefined ? undefined : formatMissionMinutesFromTicks(ticks);
}

export function secondaryObjectivesForMission(mission: Pick<ReadonlyMissionDef, "win" | "profile">, rng: Rng): SecondaryObjective[] {
  const yard: SecondaryObjective = {
    id: "yard",
    kind: "preserveYard",
    label: `Keep the ${labelFor("constructionYard")} standing`,
  };
  if (SCENARIO_KINDS.includes(mission.win.kind)) {
    const timeLimitTicks = missionTimeLimitTicks(mission.win) ?? 3600;
    const timeLimit = formatMissionMinutesFromTicks(timeLimitTicks);
    if (mission.win.kind === "rescue" || mission.win.kind === "extraction") {
      return [yard, { id: "survivors", kind: "keepUnits", label: "Keep at least one combat unit alive", target: 1 }];
    }
    const label = mission.win.kind === "escort"
      ? `Speed bonus: complete the operation within ${timeLimit} total`
      : `Complete the operation within ${timeLimit}`;
    return [
      yard,
      {
        id: "time",
        kind: "completeBefore",
        label,
        target: timeLimitTicks,
      },
    ];
  }

  const objective = objectiveContractFor(mission.win.kind);
  const supportWeighted = mission.win.kind === "holdTheLine" || mission.profile?.variant === "siege";
  const secondary: SecondaryObjective = supportWeighted || rng.chance(0.5)
    ? { id: "survivors", kind: "keepUnits", label: "Keep at least one combat unit alive", target: 1 }
    : {
      id: "tempo",
      kind: "completeBefore",
      label: objective
        ? `Secure ${objective.targetLabel} before the final push`
        : "Complete the operation before the final push",
      target: (mission.win.ticks ?? 3600) + 1,
    };
  return [yard, secondary];
}

/** Generates the same secondary objectives used when the mission runtime is created. */
export function secondaryObjectivesForMissionSeed(
  seed: number,
  mission: Pick<ReadonlyMissionDef, "index" | "win" | "profile">,
): SecondaryObjective[] {
  const rng = createRng(seed, `mission-spawn:${mission.index}`);
  if (mission.win.kind === "destroyMarked") {
    for (let i = 0; i < (mission.win.targetCount ?? 1); i++) rng.next();
  }
  return secondaryObjectivesForMission(mission, rng);
}

export function generateWinCategory(
  seed: number,
  missionIndex: number,
  kind: MissionKind,
): WinCategory {
  const rng = createRng(seed, `win:${missionIndex}:${kind}`);
  const minutes = baseMissionDurationMinutes(seed, missionIndex, kind);
  const activeMinutes = activeMissionDurationMinutes(kind, minutes);
  switch (kind) {
    case "harvestQuota":
      return {
        kind,
        target: Math.round((2800 + minutes * 420 + rng.int(600)) / 500) * 500,
      };
    case "forceQuota": {
      const role = rng.chance(0.55) ? rng.pick(COMBAT_ROLES) : undefined;
      if (role === "tank") {
        return { kind, role, target: 6 + missionIndex + rng.int(4) };
      }
      if (role === "antiArmor") {
        return { kind, role, target: 8 + missionIndex * 2 + rng.int(4) };
      }
      return {
        kind,
        role,
        target: 12 + missionIndex * 3 + rng.int(6),
      };
    }
    case "structureQuota": {
      const building = rng.chance(0.4) ? rng.pick(BUILDABLE) : undefined;
      const target = building === "turret" || building === "power"
        ? 4 + Math.floor(missionIndex / 2) + rng.int(3)
        : 7 + Math.floor(missionIndex / 2) + rng.int(3);
      return { kind, target, building };
    }
    case "destroyMarked":
      return { kind, targetCount: 2 + (missionIndex >= 4 ? 1 : 0) };
    case "razeAll":
      return { kind };
    case "decapitate":
      return { kind };
    case "annihilate":
      return { kind };
    case "holdTheLine":
      return { kind, ticks: minutesToTicks(minutes) };
    case "escort":
      return { kind, targetCount: 2 + rng.int(2), ticks: minutesToTicks(activeMinutes) };
    case "sabotage":
      return { kind, targetCount: 2 + (missionIndex >= 4 ? 1 : 0), ticks: minutesToTicks(activeMinutes) };
    case "rescue":
      return { kind, targetCount: 2 + rng.int(2), ticks: minutesToTicks(activeMinutes) };
    case "extraction":
      return { kind, targetCount: 2 + rng.int(3), ticks: minutesToTicks(activeMinutes) };
    default:
      return { kind: "decapitate" };
  }
}

export { pickMissionKinds } from "./missionOrder";
