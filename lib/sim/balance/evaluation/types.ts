import type {
  BalanceStrategy,
  MissionDirectorPhase,
  MissionFamily,
  UnitKind,
} from "../../../types";

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

export type BalanceStrategySummary = BalanceKindSummary & {
  byFamily: Record<string, BalanceKindSummary>;
  byMissionKind: Record<string, BalanceKindSummary>;
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
