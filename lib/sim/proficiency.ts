import { UNIT_STATS, isSupportUnit } from "../catalog";
import { TICKS_PER_MINUTE } from "../gen/pacing";
import { isUnitEntity, type Entity, type MissionDirectorPhase } from "../types";
import { homeGuardCount } from "./policy";
import { RETREAT_ENTER_HEALTH, RETREAT_RECOVER_HEALTH } from "./ai/helpers";

/** One step easier, unchanged, or one step harder. */
export type ProficiencyBand = -1 | 0 | 1;

/** Recent finished battles used to judge campaign proficiency. */
export const PROFICIENCY_SAMPLE_SIZE = 4;

/** Each step shortens or lengthens decision gaps by this fraction. */
export const PROFICIENCY_TEMPO_STEP = 0.15;

/** Shortest production gap after a harder band. Neutral intervals already sit above this. */
export const MIN_SCALED_PRODUCTION_EVERY = 72;

/** Shortest assault gap. Matches the director's existing wave floor. */
export const MIN_SCALED_ASSAULT_EVERY = 240;

const FAST_WIN_TICKS = 12 * TICKS_PER_MINUTE;
const LOW_CASUALTIES = 4;
const HEALTHY_HQ = 0.6;
const DAMAGED_HQ = 0.35;

export type CampaignProficiencyRecord = {
  result: "playing" | "won" | "lost";
  deadlineOutcome: "completed" | "timedOut" | "notApplicable";
  casualties: number;
  hqHealthAtEnd?: number;
  secondaryObjectivesCompleted: number;
  secondaryObjectivesTotal: number;
  primaryCompletedTick?: number;
};

function recordLean(record: CampaignProficiencyRecord): ProficiencyBand {
  const hq = record.hqHealthAtEnd;
  if (record.result === "lost" || record.deadlineOutcome === "timedOut" || (hq !== undefined && hq < DAMAGED_HQ)) return -1;
  const optionalsCleared = record.secondaryObjectivesTotal === 0
    || record.secondaryObjectivesCompleted >= record.secondaryObjectivesTotal;
  const fast = record.deadlineOutcome === "completed"
    || (record.primaryCompletedTick !== undefined && record.primaryCompletedTick <= FAST_WIN_TICKS);
  const clean = record.result === "won"
    && record.casualties <= LOW_CASUALTIES
    && (hq === undefined || hq >= HEALTHY_HQ)
    && optionalsCleared
    && fast;
  return clean ? 1 : 0;
}

/**
 * Campaign band from recent finished battles. Fewer than two results stays neutral.
 * Command rejections are ignored; they measure interface friction.
 */
export function campaignProficiencyBand(records: readonly CampaignProficiencyRecord[]): ProficiencyBand {
  const finished = records.filter((record) => record.result === "won" || record.result === "lost");
  if (finished.length < 2) return 0;
  const leans = finished.slice(-PROFICIENCY_SAMPLE_SIZE).map(recordLean);
  const tail = leans.slice(-2);
  const advanced = leans.filter((lean) => lean === 1).length;
  const struggling = leans.filter((lean) => lean === -1).length;
  if (tail.length === 2 && tail.every((lean) => lean === -1)) return -1;
  if (tail.length === 2 && tail.every((lean) => lean === 1)) return 1;
  if (struggling * 2 > leans.length && struggling > advanced) return -1;
  if (advanced * 2 > leans.length && advanced > struggling) return 1;
  return 0;
}

export function briefingProficiencyNote(band: ProficiencyBand, missionIndex: number): string | undefined {
  const shown: ProficiencyBand = missionIndex <= 0 ? (band > 0 ? 0 : band) : band;
  if (shown > 0) return "The opponent is pressing harder.";
  if (shown < 0) return "The opponent is easing off.";
  return undefined;
}

export type LivePressureInput = {
  phase: MissionDirectorPhase;
  playerCombat: number;
  enemyCombat: number;
  playerBases: number;
  enemyBases: number;
  openingYardThreat: boolean;
  playerHqHealthRatio?: number;
  enemyUnitLosses: number;
};

const PRESSURE_BASE_KINDS = new Set<Entity["kind"]>(["refinery", "barracks", "factory", "turret"]);

export function isPressureCombatant(entity: Entity): boolean {
  return isUnitEntity(entity)
    && entity.kind !== "harvester"
    && !isSupportUnit(entity.kind)
    && UNIT_STATS[entity.kind].damage > 0;
}

export function isPressureBase(entity: Entity): boolean {
  return entity.class === "building" && PRESSURE_BASE_KINDS.has(entity.kind);
}

/** Fog-limited lead or deficit. Hidden credits and unseen armies are not inputs. */
export function livePressureFromForces(input: LivePressureInput): ProficiencyBand {
  const ahead = (input.playerCombat >= 4 && input.playerCombat >= input.enemyCombat + 3)
    || (input.playerBases >= 3 && input.playerBases >= input.enemyBases + 2)
    || (input.phase === "opening" && input.openingYardThreat)
    || (input.enemyUnitLosses >= 6 && input.playerCombat >= 2 && input.playerCombat >= input.enemyCombat);
  if (ahead) return 1;
  const hqUnderPressure = input.playerHqHealthRatio !== undefined && input.playerHqHealthRatio < 0.7;
  if (hqUnderPressure && input.enemyCombat >= 4 && input.playerCombat * 2 <= input.enemyCombat) return -1;
  return 0;
}

export function adaptiveDifficultyShift(
  state: { tutorialStage?: unknown; multiplayer?: boolean; missionIndex: number; proficiencyBand?: number },
  live: ProficiencyBand,
): number {
  if (state.tutorialStage !== undefined || state.multiplayer) return 0;
  const campaign = state.proficiencyBand === -1 || state.proficiencyBand === 1 ? state.proficiencyBand : 0;
  let shift = Math.max(-2, Math.min(2, campaign + live));
  if (state.missionIndex <= 0) shift = Math.min(0, shift);
  return shift;
}

export function proficiencyTempoScale(shift: number): number {
  return 1 - shift * PROFICIENCY_TEMPO_STEP;
}

/** Leave a neutral interval untouched, including values that are already integers. */
export function scaleDecisionInterval(interval: number, shift: number, floor: number): number {
  if (shift === 0) return interval;
  return Math.max(floor, Math.round(interval * proficiencyTempoScale(shift)));
}

export function retreatEnterHealth(shift: number): number {
  if (shift === 0) return RETREAT_ENTER_HEALTH;
  const adjusted = RETREAT_ENTER_HEALTH - shift * 0.08;
  return Math.min(RETREAT_RECOVER_HEALTH - 0.05, Math.max(0.15, adjusted));
}

export function adaptiveHomeGuardCount(missionIndex: number, shift: number): number {
  return homeGuardCount(missionIndex) + (shift < 0 ? 1 : 0);
}

export function adaptiveDefenseCap(difficultyMission: number, shift: number): number {
  return 1 + Math.floor(difficultyMission / 2) + (shift > 0 ? 1 : 0);
}

export function adaptiveAirCapacity(difficultyMission: number, shift: number): number {
  const mission = difficultyMission + (shift > 0 ? 1 : 0);
  return mission >= 4 ? 2 : 1;
}

export function adaptiveCombatWant(
  counts: { tanks: number; infantry: number; antiArmor: number },
  shift: number,
  rollTank: (chance: number) => boolean,
): "infantry" | "tank" | "antiArmor" {
  if (shift < 0) return rollTank(0.4) ? "tank" : "infantry";
  if (
    shift > 0
    && counts.tanks > 0
    && counts.tanks >= counts.infantry
    && counts.tanks >= counts.antiArmor
  ) {
    return "antiArmor";
  }
  if (counts.tanks > counts.infantry && counts.tanks > counts.antiArmor) return "antiArmor";
  if (counts.antiArmor > counts.tanks) return "infantry";
  return rollTank(shift > 0 ? 0.15 : 0.4) ? "tank" : "infantry";
}
