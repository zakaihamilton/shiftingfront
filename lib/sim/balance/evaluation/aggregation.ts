import type { MissionDirectorPhase, MissionKind } from "../../../types";
import { missionFamilyFor } from "../../../gen/profile";
import type {
  BalanceKindSummary,
  BalanceRecord,
  BalanceStrategySummary,
  BalanceSummary,
} from "./types";

export function average(records: BalanceRecord[], value: (record: BalanceRecord) => number): number {
  return records.length ? records.reduce((sum, record) => sum + value(record), 0) / records.length : 0;
}

export function averageOptional(records: BalanceRecord[], value: (record: BalanceRecord) => number | undefined): number | null {
  const values = records.map(value).filter((item): item is number => item !== undefined);
  return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;
}

export function rate(records: BalanceRecord[], predicate: (record: BalanceRecord) => boolean): number {
  return records.length ? records.filter(predicate).length / records.length : 0;
}

export function commandRejectionRate(records: BalanceRecord[]): number {
  const commands = records.reduce((sum, record) => sum + record.commandsIssued, 0);
  const rejections = records.reduce((sum, record) => sum + record.commandRejections, 0);
  return commands ? rejections / commands : 0;
}

export function lossReasons(records: BalanceRecord[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(records.map((record) => record.lossReason).filter((reason): reason is string => !!reason))]
      .sort()
      .map((reason) => [reason, records.filter((record) => record.lossReason === reason).length]),
  );
}

export function averageDurationByPhase(records: BalanceRecord[]): Record<MissionDirectorPhase, number> {
  const phases: MissionDirectorPhase[] = ["opening", "pressure", "finale"];
  return Object.fromEntries(phases.map((phase) => [
    phase,
    average(records, (record) => record.durationByPhase?.[phase] ?? 0),
  ])) as Record<MissionDirectorPhase, number>;
}

export function summarizeKind(records: BalanceRecord[]): BalanceKindSummary {
  const wins = records.filter((record) => record.result === "won").length;
  const losses = records.filter((record) => record.result === "lost").length;
  return {
    samples: records.length,
    wins,
    losses,
    timeouts: records.length - wins - losses,
    winRate: rate(records, (record) => record.result === "won"),
    averageDuration: average(records, (record) => record.duration),
    averageCredits: average(records, (record) => record.credits),
    averageUnitsProduced: average(records, (record) => record.unitsProduced),
    averageCasualties: average(records, (record) => record.casualties),
    averageCommands: average(records, (record) => record.commandsIssued),
    averageCommandRejections: average(records, (record) => record.commandRejections),
    powerDeficitRate: rate(records, (record) => record.powerDeficit),
    commandRejectionRate: commandRejectionRate(records),
    averageFirstCombatTick: averageOptional(records, (record) => record.firstCombatTick),
    averageFirstPressureTick: averageOptional(records, (record) => record.firstPressureTick),
    averageFirstHqThreatTick: averageOptional(records, (record) => record.firstHqThreatTick),
    averageHqHealthAtPressure: averageOptional(records, (record) => record.hqHealthAtPressure),
    averageFirstFinaleTick: averageOptional(records, (record) => record.firstFinaleTick),
    averageHqHealthAtFinale: averageOptional(records, (record) => record.hqHealthAtFinale),
    averageHqHealthAtEnd: averageOptional(records, (record) => record.hqHealthAtEnd),
    averageAssaultTransitions: average(records, (record) => record.assaultTransitions ?? 0),
    averagePrimaryCompletedTick: averageOptional(records, (record) => record.primaryCompletedTick),
    averageDurationByPhase: averageDurationByPhase(records),
    averageRepairCommands: average(records, (record) => record.repairCommands ?? 0),
    averageSupportActions: averageOptional(records, (record) => record.supportActions),
    averageHealedHp: averageOptional(records, (record) => record.healedHp),
    averageRepairedHp: averageOptional(records, (record) => record.repairedHp),
    averageRepairCredits: averageOptional(records, (record) => record.repairCredits),
    averageHqThreatTicks: average(records, (record) => record.hqThreatTicks ?? 0),
    averageRescueFirstContactTick: averageOptional(records, (record) => record.rescueFirstContactTick),
    averageRescueAllContactedTick: averageOptional(records, (record) => record.rescueAllContactedTick),
    averageRescueFirstReturnedTick: averageOptional(records, (record) => record.rescueFirstReturnedTick),
    rescueExtractionRate: averageOptional(records, (record) => record.rescuePhaseAtEnd === undefined ? undefined : record.rescuePhaseAtEnd === "extraction" || record.rescuePhaseAtEnd === "complete" ? 1 : 0),
    averageOpeningCredits: averageOptional(records, (record) => record.openingCredits),
    averageBaselineRouteLength: averageOptional(records, (record) => record.baselineRouteLength),
    averageAlternateRouteLength: averageOptional(records, (record) => record.alternateRouteLength),
    averageReachableResourceValue: averageOptional(records, (record) => record.reachableResourceValue),
    averageNearestResourceDistance: averageOptional(records, (record) => record.nearestResourceDistance),
    averageLaneCount: averageOptional(records, (record) => record.laneCount),
    averageForwardResourceValue: averageOptional(records, (record) => record.forwardResourceValue),
    averageRouteSeparation: averageOptional(records, (record) => record.routeSeparation),
    averageTargetDepth: averageOptional(records, (record) => record.targetDepth),
    averageTargetRouteLength: averageOptional(records, (record) => record.targetRouteLength),
    averageMaxTargetDepth: averageOptional(records, (record) => record.maxTargetDepth),
    averageEffectiveRouteLength: averageOptional(records, (record) => record.effectiveRouteLength),
    averageRescueReturnRouteLength: averageOptional(records, (record) => record.rescueReturnRouteLength),
    targetReachabilityRate: averageOptional(records, (record) => {
      const reachable = record.allTargetsReachable ?? record.targetReachable;
      return reachable === undefined ? undefined : reachable ? 1 : 0;
    }),
    lossReasons: lossReasons(records),
  };
}

export function recordStrategy(record: BalanceRecord): string {
  return record.strategy ?? "competent";
}

export function recordFamily(record: BalanceRecord): string {
  return record.family ?? missionFamilyFor(record.kind as MissionKind);
}

export function summarizeStrategy(records: BalanceRecord[]): BalanceStrategySummary {
  const families = [...new Set(records.map(recordFamily))].sort();
  const kinds = [...new Set(records.map((record) => record.kind))].sort();
  return {
    ...summarizeKind(records),
    byFamily: Object.fromEntries(families.map((family) => [
      family,
      summarizeKind(records.filter((record) => recordFamily(record) === family)),
    ])),
    byMissionKind: Object.fromEntries(kinds.map((kind) => [
      kind,
      summarizeKind(records.filter((record) => record.kind === kind)),
    ])),
  };
}

export function summarizeBalance(records: BalanceRecord[]): BalanceSummary {
  const wins = records.filter((record) => record.result === "won").length;
  const losses = records.filter((record) => record.result === "lost").length;
  const byMissionKind = Object.fromEntries(
    [...new Set(records.map((record) => record.kind))].sort().map((kind) => [
      kind,
      summarizeKind(records.filter((record) => record.kind === kind)),
    ]),
  );
  const missionIndexes = [...new Set(records.map((record) => record.mission).filter((mission): mission is number => mission !== undefined))].sort((a, b) => a - b);
  const byMission = Object.fromEntries(missionIndexes.map((mission) => [
    String(mission),
    summarizeKind(records.filter((record) => record.mission === mission)),
  ]));
  const strategies = [...new Set(records.map(recordStrategy))].sort();
  return {
    samples: records.length,
    wins,
    losses,
    timeouts: records.length - wins - losses,
    winRate: rate(records, (record) => record.result === "won"),
    timeoutRate: rate(records, (record) => record.result === "playing"),
    truncatedRate: rate(records, (record) => record.truncated),
    mapFailureRate: rate(records, (record) => !record.mapValid),
    powerDeficitRate: rate(records, (record) => record.powerDeficit),
    commandRejectionRate: commandRejectionRate(records),
    nonFiniteStateRate: rate(records, (record) => record.nonFiniteState === true),
    averageDuration: average(records, (record) => record.duration),
    averageCredits: average(records, (record) => record.credits),
    averageCasualties: average(records, (record) => record.casualties),
    averageUnitsProduced: average(records, (record) => record.unitsProduced),
    averageCommands: average(records, (record) => record.commandsIssued),
    averageCommandRejections: average(records, (record) => record.commandRejections),
    byMissionKind,
    byMission,
    byStrategy: Object.fromEntries(strategies.map((strategy) => [
      strategy,
      summarizeStrategy(records.filter((record) => recordStrategy(record) === strategy)),
    ])),
  };
}
