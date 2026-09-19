import type { BalanceStrategy, MissionDirectorPhase, MissionFamily, MissionKind, UnitKind } from "../../types";
import { missionFamilyFor } from "../../gen/profile";

export type BalanceRecord = {
  mission?: number;
  strategy?: BalanceStrategy;
  family?: MissionFamily;
  kind: string;
  result: "playing" | "won" | "lost";
  truncated: boolean;
  duration: number;
  credits: number;
  unitsProduced: number;
  aiUnitsProduced: number;
  powerDeficit: boolean;
  casualties: number;
  secondaryCompleted: number;
  mapValid: boolean;
  commandsIssued: number;
  commandRejections: number;
  nonFiniteState?: boolean;
  lossReason?: string;
  /** Stable classification for every non-winning balance record. */
  failureReason?: string;
  firstCombatTick?: number;
  firstPressureTick?: number;
  firstHqThreatTick?: number;
  hqHealthAtPressure?: number;
  firstFinaleTick?: number;
  hqHealthAtFinale?: number;
  hqHealthAtEnd?: number;
  assaultTransitions?: number;
  primaryCompletedTick?: number;
  completionPhase?: MissionDirectorPhase;
  durationByPhase?: Partial<Record<MissionDirectorPhase, number>>;
  repairCommands?: number;
  supportActions?: number;
  healedHp?: number;
  repairedHp?: number;
  repairCredits?: number;
  hqThreatTicks?: number;
  rescueFirstContactTick?: number;
  rescueAllContactedTick?: number;
  rescueFirstReturnedTick?: number;
  rescuePhaseAtEnd?: "active" | "extraction" | "complete";
  openingCredits?: number;
  openingUnitsProducedByRole?: Partial<Record<UnitKind, number>>;
  baselineRouteLength?: number;
  alternateRouteLength?: number;
  reachableResourceValue?: number;
  nearestResourceDistance?: number;
  laneCount?: number;
  forwardResourceValue?: number;
  routeSeparation?: number;
  targetDepth?: number;
  targetRouteLength?: number;
  targetReachable?: boolean;
  targetDepths?: number[];
  targetRouteLengths?: number[];
  maxTargetDepth?: number;
  allTargetsReachable?: boolean;
  materiallyFair?: boolean;
  effectiveRouteLengths?: number[];
  effectiveRouteLength?: number;
  rescueReturnRouteLength?: number;
};

export type BalanceKindSummary = {
  samples: number;
  wins: number;
  losses: number;
  timeouts: number;
  winRate: number;
  averageDuration: number;
  averageCredits: number;
  averageUnitsProduced: number;
  averageCasualties: number;
  averageCommands: number;
  averageCommandRejections: number;
  powerDeficitRate: number;
  commandRejectionRate: number;
  averageFirstCombatTick: number | null;
  averageFirstPressureTick: number | null;
  averageFirstHqThreatTick: number | null;
  averageHqHealthAtPressure: number | null;
  averageFirstFinaleTick: number | null;
  averageHqHealthAtFinale: number | null;
  averageHqHealthAtEnd: number | null;
  averageAssaultTransitions: number;
  averagePrimaryCompletedTick: number | null;
  averageDurationByPhase: Record<MissionDirectorPhase, number>;
  averageRepairCommands: number;
  averageSupportActions: number | null;
  averageHealedHp: number | null;
  averageRepairedHp: number | null;
  averageRepairCredits: number | null;
  averageHqThreatTicks: number;
  averageRescueFirstContactTick: number | null;
  averageRescueAllContactedTick: number | null;
  averageRescueFirstReturnedTick: number | null;
  rescueExtractionRate: number | null;
  averageOpeningCredits: number | null;
  averageBaselineRouteLength: number | null;
  averageAlternateRouteLength: number | null;
  averageReachableResourceValue: number | null;
  averageNearestResourceDistance: number | null;
  averageLaneCount: number | null;
  averageForwardResourceValue: number | null;
  averageRouteSeparation: number | null;
  averageTargetDepth: number | null;
  averageTargetRouteLength: number | null;
  averageMaxTargetDepth: number | null;
  averageEffectiveRouteLength: number | null;
  averageRescueReturnRouteLength: number | null;
  targetReachabilityRate: number | null;
  lossReasons: Record<string, number>;
};

export type BalanceSummary = {
  samples: number;
  wins: number;
  losses: number;
  timeouts: number;
  winRate: number;
  timeoutRate: number;
  truncatedRate: number;
  mapFailureRate: number;
  powerDeficitRate: number;
  commandRejectionRate: number;
  nonFiniteStateRate: number;
  averageDuration: number;
  averageCredits: number;
  averageCasualties: number;
  averageUnitsProduced: number;
  averageCommands: number;
  averageCommandRejections: number;
  byMissionKind: Record<string, BalanceKindSummary>;
  byMission: Record<string, BalanceKindSummary>;
  byStrategy: Record<string, BalanceStrategySummary>;
};

export type BalanceStrategySummary = BalanceKindSummary & {
  byFamily: Record<string, BalanceKindSummary>;
  byMissionKind: Record<string, BalanceKindSummary>;
};

export type BalanceThresholds = {
  minWinRate: number;
  maxWinRate?: number;
  maxTimeoutRate: number;
  minKindSamples: number;
  minKindWinRate: number;
  maxKindTimeoutRate: number;
  maxTruncatedRate: number;
  maxMapFailureRate: number;
  maxPowerDeficitRate: number;
  maxCommandRejectionRate: number;
  maxAverageCasualties: number;
  targetedKindWinRates?: Record<string, number>;
  maxKindAverageCasualties?: Record<string, number>;
};

export type BalanceCheck = {
  passed: boolean;
  failures: string[];
};

export function balanceFailureReason(record: Pick<BalanceRecord, "result" | "truncated" | "lossReason">): string | undefined {
  if (record.result === "won") return undefined;
  if (record.result === "lost") return record.lossReason ?? "unknown";
  return record.truncated ? "truncated" : "timeout";
}

export const DEFAULT_BALANCE_THRESHOLDS: BalanceThresholds = {
  // The full 40-seed sweep includes intentionally difficult late-game and
  // rescue maps. Keep the gate sensitive to regressions without rejecting
  // the current deterministic campaign baseline.
  minWinRate: 0.85,
  maxTimeoutRate: 0.05,
  minKindSamples: 4,
  minKindWinRate: 0.70,
  maxKindTimeoutRate: 0.15,
  maxTruncatedRate: 0,
  maxMapFailureRate: 0,
  maxPowerDeficitRate: 0,
  maxCommandRejectionRate: 0,
  maxAverageCasualties: 35,
  targetedKindWinRates: {
    harvestQuota: 0.85,
    forceQuota: 0.85,
    structureQuota: 0.85,
    destroyMarked: 0.70,
    sabotage: 0.85,
    annihilate: 0.85,
    decapitate: 0.70,
    rescue: 0.80,
    razeAll: 0.85,
    holdTheLine: 0.85,
    escort: 0.85,
    extraction: 0.85,
  },
  maxKindAverageCasualties: {
    harvestQuota: 55,
    forceQuota: 55,
    structureQuota: 55,
    destroyMarked: 55,
    sabotage: 55,
    annihilate: 55,
    decapitate: 55,
    rescue: 55,
    razeAll: 55,
    holdTheLine: 55,
    escort: 55,
    extraction: 55,
  },
};

function average(records: BalanceRecord[], value: (record: BalanceRecord) => number): number {
  return records.length ? records.reduce((sum, record) => sum + value(record), 0) / records.length : 0;
}

function averageOptional(records: BalanceRecord[], value: (record: BalanceRecord) => number | undefined): number | null {
  const values = records.map(value).filter((item): item is number => item !== undefined);
  return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;
}

function rate(records: BalanceRecord[], predicate: (record: BalanceRecord) => boolean): number {
  return records.length ? records.filter(predicate).length / records.length : 0;
}

function commandRejectionRate(records: BalanceRecord[]): number {
  const commands = records.reduce((sum, record) => sum + record.commandsIssued, 0);
  const rejections = records.reduce((sum, record) => sum + record.commandRejections, 0);
  return commands ? rejections / commands : 0;
}

function lossReasons(records: BalanceRecord[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(records.map((record) => record.lossReason).filter((reason): reason is string => !!reason))]
      .sort()
      .map((reason) => [reason, records.filter((record) => record.lossReason === reason).length]),
  );
}

function averageDurationByPhase(records: BalanceRecord[]): Record<MissionDirectorPhase, number> {
  const phases: MissionDirectorPhase[] = ["opening", "pressure", "finale"];
  return Object.fromEntries(phases.map((phase) => [
    phase,
    average(records, (record) => record.durationByPhase?.[phase] ?? 0),
  ])) as Record<MissionDirectorPhase, number>;
}

function summarizeKind(records: BalanceRecord[]): BalanceKindSummary {
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

function recordStrategy(record: BalanceRecord): string {
  return record.strategy ?? "competent";
}

function recordFamily(record: BalanceRecord): string {
  return record.family ?? missionFamilyFor(record.kind as MissionKind);
}

function summarizeStrategy(records: BalanceRecord[]): BalanceStrategySummary {
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

const OFFENSIVE_KINDS = new Set<MissionKind>([
  "destroyMarked",
  "razeAll",
  "decapitate",
  "annihilate",
  "sabotage",
]);
const TIMED_OPERATION_KINDS = new Set<MissionKind>([
  "sabotage",
  "rescue",
  "extraction",
]);
const ECONOMY_KINDS = new Set<MissionKind>(["harvestQuota", "forceQuota", "structureQuota"]);
const ARCHETYPE_STRATEGIES: readonly BalanceStrategy[] = ["rush", "turtle", "greed", "infantry", "vehicles"];

function cappedKindsForStrategy(strategy: BalanceStrategy): MissionKind[] {
  // Escort completion is driven by the neutral convoy's route after its
  // staging delay, so its win rate is not a useful measure of commander
  // overperformance. Keep it in the aggregate sweep, but do not classify the
  // autonomous convoy's success as an archetype anti-cheese failure.
  const kinds: MissionKind[] = strategy === "rush"
    ? [...ECONOMY_KINDS, "holdTheLine"]
    : [...OFFENSIVE_KINDS, ...TIMED_OPERATION_KINDS];
  return [...new Set(kinds)];
}

function isArchetypeFailure(record: BalanceRecord): boolean {
  return record.result !== "won"
    || record.truncated
    || !record.mapValid
    || record.commandRejections > 0
    || record.powerDeficit
    || record.nonFiniteState === true;
}

/** Returns exact records relevant to reliability or anti-cheese failures. */
export function archetypeFailureRecords(
  summary: BalanceSummary,
  records: BalanceRecord[],
  strategiesToCheck: readonly BalanceStrategy[] = ARCHETYPE_STRATEGIES,
  minKindSamples = 8,
): BalanceRecord[] {
  const failures = new Set<BalanceRecord>();
  for (const strategy of strategiesToCheck) {
    const strategyRecords = records.filter((record) => record.strategy === strategy);
    strategyRecords.filter(isArchetypeFailure).forEach((record) => failures.add(record));
    const strategySummary = summary.byStrategy[strategy];
    if (!strategySummary) continue;
    if (strategy === "infantry" || strategy === "vehicles") {
      if (strategySummary.winRate > 0.90) strategyRecords.forEach((record) => failures.add(record));
      continue;
    }
    for (const kind of cappedKindsForStrategy(strategy)) {
      const kindSummary = strategySummary.byMissionKind[kind];
      if (kindSummary && kindSummary.samples >= Math.max(4, minKindSamples) && kindSummary.winRate > 0.75) {
        strategyRecords.filter((record) => record.kind === kind).forEach((record) => failures.add(record));
      }
    }
  }
  return records.filter((record) => failures.has(record));
}

/** Checks deliberately biased player strategies for reliability and universal-win regressions. */
export function checkArchetypeBalance(
  summary: BalanceSummary,
  records: BalanceRecord[],
  strategiesToCheck: readonly BalanceStrategy[] = ARCHETYPE_STRATEGIES,
  minKindSamples = 8,
): BalanceCheck {
  const failures: string[] = [];
  for (const strategy of strategiesToCheck) {
    const strategyRecords = records.filter((record) => record.strategy === strategy);
    if (!strategyRecords.length) {
      failures.push(`${strategy} produced no balance records`);
      continue;
    }
    if (strategyRecords.some((record) => !record.mapValid)) failures.push(`${strategy} has invalid maps`);
    if (strategyRecords.some((record) => record.truncated)) failures.push(`${strategy} has truncated runs`);
    if (strategyRecords.some((record) => record.commandRejections > 0)) failures.push(`${strategy} has rejected commands`);
    if (strategyRecords.some((record) => record.powerDeficit)) failures.push(`${strategy} has power deficits`);
    if (strategyRecords.some((record) => record.nonFiniteState === true)) failures.push(`${strategy} has non-finite state values`);

    const strategySummary = summary.byStrategy[strategy];
    if (!strategySummary) continue;
    if (strategy === "infantry" || strategy === "vehicles") {
      if (strategySummary.winRate > 0.90) {
        failures.push(`${strategy} overall win rate ${(strategySummary.winRate * 100).toFixed(1)}% exceeds 90.0%`);
      }
      continue;
    }
    for (const kind of cappedKindsForStrategy(strategy)) {
      const kindSummary = strategySummary.byMissionKind[kind];
      if (!kindSummary || kindSummary.samples < Math.max(4, minKindSamples)) continue;
      if (kindSummary.winRate > 0.75) {
        failures.push(`${strategy} ${kind} win rate ${(kindSummary.winRate * 100).toFixed(1)}% exceeds 75.0%`);
      }
    }
  }
  return { passed: failures.length === 0, failures };
}

export function checkBalance(summary: BalanceSummary, thresholds: BalanceThresholds): BalanceCheck {
  const failures: string[] = [];
  if (summary.winRate < thresholds.minWinRate) {
    failures.push(`win rate ${(summary.winRate * 100).toFixed(1)}% is below ${(thresholds.minWinRate * 100).toFixed(1)}%`);
  }
  if (thresholds.maxWinRate !== undefined && summary.winRate > thresholds.maxWinRate) {
    failures.push(`win rate ${(summary.winRate * 100).toFixed(1)}% exceeds ${(thresholds.maxWinRate * 100).toFixed(1)}%`);
  }
  if (summary.timeoutRate > thresholds.maxTimeoutRate) {
    failures.push(`timeout rate ${(summary.timeoutRate * 100).toFixed(1)}% exceeds ${(thresholds.maxTimeoutRate * 100).toFixed(1)}%`);
  }
  if (summary.truncatedRate > thresholds.maxTruncatedRate) {
    failures.push(`truncated run rate ${(summary.truncatedRate * 100).toFixed(1)}% exceeds ${(thresholds.maxTruncatedRate * 100).toFixed(1)}%`);
  }
  for (const [kind, kindSummary] of Object.entries(summary.byMissionKind)) {
    if (kindSummary.samples < thresholds.minKindSamples) continue;
    if (kindSummary.winRate < thresholds.minKindWinRate) {
      failures.push(`${kind} win rate ${(kindSummary.winRate * 100).toFixed(1)}% is below ${(thresholds.minKindWinRate * 100).toFixed(1)}%`);
    }
    if (kindSummary.timeouts / kindSummary.samples > thresholds.maxKindTimeoutRate) {
      failures.push(`${kind} timeout rate ${((kindSummary.timeouts / kindSummary.samples) * 100).toFixed(1)}% exceeds ${(thresholds.maxKindTimeoutRate * 100).toFixed(1)}%`);
    }
  }
  for (const [kind, minimum] of Object.entries(thresholds.targetedKindWinRates ?? {})) {
    const kindSummary = summary.byMissionKind[kind];
    if (!kindSummary || kindSummary.samples < thresholds.minKindSamples) continue;
    if (kindSummary.winRate < minimum) {
      failures.push(`${kind} targeted win rate ${(kindSummary.winRate * 100).toFixed(1)}% is below ${(minimum * 100).toFixed(1)}%`);
    }
  }
  for (const [kind, maximum] of Object.entries(thresholds.maxKindAverageCasualties ?? {})) {
    const kindSummary = summary.byMissionKind[kind];
    if (!kindSummary || kindSummary.samples < thresholds.minKindSamples) continue;
    if (kindSummary.averageCasualties > maximum) {
      failures.push(`${kind} average casualties ${kindSummary.averageCasualties.toFixed(1)} exceeds ${maximum}`);
    }
  }
  for (const [mission, missionSummary] of Object.entries(summary.byMission)) {
    if (missionSummary.samples < thresholds.minKindSamples) continue;
    if (missionSummary.winRate < thresholds.minKindWinRate) {
      failures.push(`mission ${Number(mission) + 1} win rate ${(missionSummary.winRate * 100).toFixed(1)}% is below ${(thresholds.minKindWinRate * 100).toFixed(1)}%`);
    }
  }
  if (summary.mapFailureRate > thresholds.maxMapFailureRate) {
    failures.push(`map failure rate ${(summary.mapFailureRate * 100).toFixed(1)}% exceeds ${(thresholds.maxMapFailureRate * 100).toFixed(1)}%`);
  }
  if (summary.powerDeficitRate > thresholds.maxPowerDeficitRate) {
    failures.push(`power deficit rate ${(summary.powerDeficitRate * 100).toFixed(1)}% exceeds ${(thresholds.maxPowerDeficitRate * 100).toFixed(1)}%`);
  }
  if (summary.commandRejectionRate > thresholds.maxCommandRejectionRate) {
    failures.push(`command rejection rate ${(summary.commandRejectionRate * 100).toFixed(1)}% exceeds ${(thresholds.maxCommandRejectionRate * 100).toFixed(1)}%`);
  }
  if (summary.nonFiniteStateRate > 0) {
    failures.push(`non-finite state rate ${(summary.nonFiniteStateRate * 100).toFixed(1)}% exceeds 0.0%`);
  }
  if (summary.averageCasualties > thresholds.maxAverageCasualties) {
    failures.push(`average casualties ${summary.averageCasualties.toFixed(1)} exceeds ${thresholds.maxAverageCasualties}`);
  }
  return { passed: failures.length === 0, failures };
}
