import type { MissionKind, SimState } from "../types";
import { type StorageAdapter, safeRemoveItem, safeSetItem } from "./save";
import { isRecord, readPersistedEnvelope } from "./utils";

export const TELEMETRY_KEY = "shiftingfront:telemetry";
export const TELEMETRY_VERSION = 1 as const;
export const TELEMETRY_MAX_RECORDS = 128;

export type MissionUxTelemetry = {
  briefingSkipped: boolean;
  controlsOpened: number;
  tutorialCompleted: boolean;
  tutorialExited: boolean;
  mobilePanelOpened: number;
  objectivePanelToggles: number;
  firstSelectionTick?: number;
  firstOrderTick?: number;
  firstBuildTick?: number;
  firstProductionTick?: number;
  commandFeedbackCount: number;
  commandRejectionsByReason: Record<string, number>;
};

export function createMissionUxTelemetry(): MissionUxTelemetry {
  return {
    briefingSkipped: false,
    controlsOpened: 0,
    tutorialCompleted: false,
    tutorialExited: false,
    mobilePanelOpened: 0,
    objectivePanelToggles: 0,
    commandFeedbackCount: 0,
    commandRejectionsByReason: {},
  };
}

/**
 * Keeps UI-side validation messages and simulation rejection events in one
 * stable, aggregate-friendly namespace without storing player-entered text.
 */
export function canonicalCommandRejectionReason(reason: string): string {
  const value = reason.trim().toLowerCase();
  if (value.includes("building limit") || value.includes("limited to one"))
    return "building limit reached";
  if (value.includes("invalid building")) return "invalid building";
  if (value.includes("invalid placement") || value.includes("build site"))
    return "invalid placement";
  if (value.includes("construction yard")) return "construction yard unavailable";
  if (value.includes("insufficient credits") || value.includes("more credits"))
    return "insufficient credits";
  if (value.includes("attack target") || value.includes("enemy target"))
    return "invalid attack target";
  if (value.includes("support target")) return "invalid support target";
  if (value.includes("eligible support")) return "no eligible support unit";
  if (
    value.includes("eligible units") ||
    value.includes("friendly unit") ||
    value.includes("combat unit")
  )
    return "no eligible unit";
  if (value.includes("friendly building")) return "invalid building target";
  if (value.includes("training step")) return "training step";
  if (value.includes("unit unavailable") || value.includes("advance the campaign"))
    return "unit unavailable";
  if (value.includes("wrong producer")) return "wrong producer";
  if (value.includes("production slot") || value.includes("producer unavailable"))
    return "producer unavailable";
  if (value.includes("queue full")) return "production queue full";
  if (value.includes("power shortage") || value.includes("restore power")) return "power shortage";
  if (value.includes("ore field") || value.includes("harvesting")) return "invalid harvest target";
  if (value.includes("destination") || value.includes("ground") || value.includes("walked"))
    return "invalid destination";
  return value.replace(/\s+/g, "_") || "unknown command rejection";
}

export type MissionTelemetry = {
  missionIndex: number;
  missionKind: MissionKind | "unknown";
  result: SimState["result"];
  lossReason?: SimState["lossReason"];
  durationTicks: number;
  deadlineOutcome: "completed" | "timedOut" | "notApplicable";
  credits: number;
  unitsProduced: number;
  casualties: number;
  commandsIssued: number;
  commandRejections: number;
  firstCombatTick?: number;
  firstPressureTick?: number;
  firstHqThreatTick?: number;
  hqHealthAtPressure?: number;
  hqHealthAtEnd?: number;
  primaryCompletedTick?: number;
  assaultTransitions: number;
  secondaryObjectivesCompleted: number;
  secondaryObjectivesTotal: number;
  ux?: MissionUxTelemetry;
  recordedAt: number;
};

type TelemetryEnvelope = {
  version: typeof TELEMETRY_VERSION;
  records: MissionTelemetry[];
};

function finiteInteger(value: unknown, min = 0): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= min
  );
}

function normalizeUx(value: unknown): MissionUxTelemetry {
  const base = createMissionUxTelemetry();
  if (!isRecord(value)) return base;
  const count = (candidate: unknown) => (finiteInteger(candidate) ? candidate : 0);
  const tick = (candidate: unknown) => (finiteInteger(candidate) ? candidate : undefined);
  const reasons: Record<string, number> = {};
  if (isRecord(value.commandRejectionsByReason)) {
    for (const [reason, amount] of Object.entries(value.commandRejectionsByReason)) {
      if (finiteInteger(amount)) reasons[reason] = amount;
    }
  }
  return {
    briefingSkipped: value.briefingSkipped === true,
    controlsOpened: count(value.controlsOpened),
    tutorialCompleted: value.tutorialCompleted === true,
    tutorialExited: value.tutorialExited === true,
    mobilePanelOpened: count(value.mobilePanelOpened),
    objectivePanelToggles: count(value.objectivePanelToggles),
    firstSelectionTick: tick(value.firstSelectionTick),
    firstOrderTick: tick(value.firstOrderTick),
    firstBuildTick: tick(value.firstBuildTick),
    firstProductionTick: tick(value.firstProductionTick),
    commandFeedbackCount: count(value.commandFeedbackCount),
    commandRejectionsByReason: reasons,
  };
}

function normalizeRecord(value: unknown): MissionTelemetry | null {
  if (!isRecord(value)) return null;
  if (!finiteInteger(value.missionIndex) || typeof value.missionKind !== "string") return null;
  if (value.result !== "playing" && value.result !== "won" && value.result !== "lost") return null;
  const deadlineOutcome =
    value.deadlineOutcome === "completed" || value.deadlineOutcome === "timedOut"
      ? value.deadlineOutcome
      : "notApplicable";
  const numberOrZero = (candidate: unknown) =>
    typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 ? candidate : 0;
  const numberOrUndefined = (candidate: unknown) =>
    typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0
      ? candidate
      : undefined;
  return {
    missionIndex: value.missionIndex,
    missionKind: value.missionKind as MissionTelemetry["missionKind"],
    result: value.result,
    lossReason:
      value.lossReason === "yardDestroyed" ||
      value.lossReason === "deadline" ||
      value.lossReason === "objectiveTargetLost"
        ? value.lossReason
        : undefined,
    durationTicks: numberOrZero(value.durationTicks),
    deadlineOutcome,
    credits: numberOrZero(value.credits),
    unitsProduced: numberOrZero(value.unitsProduced),
    casualties: numberOrZero(value.casualties),
    commandsIssued: numberOrZero(value.commandsIssued),
    commandRejections: numberOrZero(value.commandRejections),
    firstCombatTick: finiteInteger(value.firstCombatTick) ? value.firstCombatTick : undefined,
    firstPressureTick: finiteInteger(value.firstPressureTick) ? value.firstPressureTick : undefined,
    firstHqThreatTick: finiteInteger(value.firstHqThreatTick) ? value.firstHqThreatTick : undefined,
    hqHealthAtPressure: numberOrUndefined(value.hqHealthAtPressure),
    hqHealthAtEnd: numberOrUndefined(value.hqHealthAtEnd),
    primaryCompletedTick: finiteInteger(value.primaryCompletedTick)
      ? value.primaryCompletedTick
      : undefined,
    assaultTransitions: numberOrZero(value.assaultTransitions),
    secondaryObjectivesCompleted: numberOrZero(value.secondaryObjectivesCompleted),
    secondaryObjectivesTotal: numberOrZero(value.secondaryObjectivesTotal),
    ux: normalizeUx(value.ux),
    recordedAt: numberOrZero(value.recordedAt),
  };
}

export function normalizeTelemetry(value: unknown): MissionTelemetry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeRecord)
    .filter((record): record is MissionTelemetry => record !== null)
    .slice(-TELEMETRY_MAX_RECORDS);
}

export function readTelemetry(storage: StorageAdapter): MissionTelemetry[] {
  return readPersistedEnvelope(
    storage,
    TELEMETRY_KEY,
    (parsed) => {
      if (!isRecord(parsed) || parsed.version !== TELEMETRY_VERSION) return null;
      return normalizeTelemetry(parsed.records);
    },
    [],
  );
}

export function writeTelemetry(storage: StorageAdapter, records: MissionTelemetry[]): boolean {
  const envelope: TelemetryEnvelope = {
    version: TELEMETRY_VERSION,
    records: normalizeTelemetry(records),
  };
  return safeSetItem(storage, TELEMETRY_KEY, JSON.stringify(envelope));
}

export function recordTelemetry(storage: StorageAdapter, record: MissionTelemetry): boolean {
  return writeTelemetry(storage, [...readTelemetry(storage), record]);
}

/** Returns the bounded, normalized telemetry envelope for local export. */
export function serializeTelemetry(storage: StorageAdapter): string {
  const envelope: TelemetryEnvelope = {
    version: TELEMETRY_VERSION,
    records: readTelemetry(storage),
  };
  return JSON.stringify(envelope, null, 2);
}

/** Clears only the local mission telemetry key. */
export function clearTelemetry(storage: StorageAdapter): boolean {
  return safeRemoveItem(storage, TELEMETRY_KEY);
}

export function telemetryFromMission(
  state: SimState,
  stats: Pick<
    MissionTelemetry,
    | "commandsIssued"
    | "commandRejections"
    | "firstCombatTick"
    | "firstPressureTick"
    | "firstHqThreatTick"
    | "hqHealthAtPressure"
    | "hqHealthAtEnd"
    | "primaryCompletedTick"
    | "assaultTransitions"
  > & { ux?: MissionUxTelemetry } = {
    commandsIssued: 0,
    commandRejections: 0,
    assaultTransitions: 0,
  },
): MissionTelemetry {
  const secondary = state.runtime?.secondary ?? [];
  const deadlineOutcome =
    state.result === "lost" && state.lossReason === "deadline"
      ? "timedOut"
      : state.runtime?.deadline === undefined
        ? "notApplicable"
        : "completed";
  return {
    missionIndex: state.missionIndex,
    missionKind: state.missionKind ?? state.runtime?.kind ?? "unknown",
    result: state.result,
    lossReason: state.lossReason,
    durationTicks: state.tick,
    deadlineOutcome,
    credits: state.credits[0],
    unitsProduced: state.unitsProduced[0],
    casualties: state.losses.units[0],
    commandsIssued: stats.commandsIssued,
    commandRejections: stats.commandRejections,
    firstCombatTick: stats.firstCombatTick,
    firstPressureTick: stats.firstPressureTick,
    firstHqThreatTick: stats.firstHqThreatTick,
    hqHealthAtPressure: stats.hqHealthAtPressure,
    hqHealthAtEnd: stats.hqHealthAtEnd,
    primaryCompletedTick: stats.primaryCompletedTick,
    assaultTransitions: stats.assaultTransitions,
    secondaryObjectivesCompleted: secondary.filter((objective) => objective.completed === true)
      .length,
    secondaryObjectivesTotal: secondary.length,
    ux: stats.ux ?? createMissionUxTelemetry(),
    recordedAt: Date.now(),
  };
}

export function summarizeTelemetry(records: MissionTelemetry[] = []): {
  missions: number;
  wins: number;
  losses: number;
  timeouts: number;
  winRate: number;
  averageCasualties: number;
  commandRejectionRate: number;
  averageTimeToPressureTicks: number;
  averageTimeToHqThreatTicks: number;
} {
  const normalized = normalizeTelemetry(records);
  const commands = normalized.reduce((sum, record) => sum + record.commandsIssued, 0);
  const pressureRecords = normalized.filter((record) => record.firstPressureTick !== undefined);
  const hqThreatRecords = normalized.filter((record) => record.firstHqThreatTick !== undefined);
  return {
    missions: normalized.length,
    wins: normalized.filter((record) => record.result === "won").length,
    losses: normalized.filter((record) => record.result === "lost").length,
    timeouts: normalized.filter((record) => record.deadlineOutcome === "timedOut").length,
    winRate: normalized.length
      ? normalized.filter((record) => record.result === "won").length / normalized.length
      : 0,
    averageCasualties: normalized.length
      ? normalized.reduce((sum, record) => sum + record.casualties, 0) / normalized.length
      : 0,
    commandRejectionRate: commands
      ? normalized.reduce((sum, record) => sum + record.commandRejections, 0) / commands
      : 0,
    averageTimeToPressureTicks: pressureRecords.length
      ? pressureRecords.reduce((sum, record) => sum + (record.firstPressureTick ?? 0), 0) /
        pressureRecords.length
      : 0,
    averageTimeToHqThreatTicks: hqThreatRecords.length
      ? hqThreatRecords.reduce((sum, record) => sum + (record.firstHqThreatTick ?? 0), 0) /
        hqThreatRecords.length
      : 0,
  };
}
