import type { BalanceStrategy, MissionKind } from "../../../types";
import type { BalanceCheck, BalanceRecord, BalanceSummary } from "./types";

export const OFFENSIVE_KINDS = new Set<MissionKind>([
  "destroyMarked",
  "razeAll",
  "decapitate",
  "annihilate",
  "sabotage",
]);

export const TIMED_OPERATION_KINDS = new Set<MissionKind>([
  "sabotage",
  "rescue",
  "extraction",
]);

export const ECONOMY_KINDS = new Set<MissionKind>(["harvestQuota", "forceQuota", "structureQuota"]);

export const ARCHETYPE_STRATEGIES: readonly BalanceStrategy[] = ["rush", "turtle", "greed", "infantry", "vehicles"];

export function cappedKindsForStrategy(strategy: BalanceStrategy): MissionKind[] {
  // Escort completion is driven by the neutral convoy's route after its
  // staging delay, so its win rate is not a useful measure of commander
  // overperformance. Keep it in the aggregate sweep, but do not classify the
  // autonomous convoy's success as an archetype anti-cheese failure.
  const kinds: MissionKind[] = strategy === "rush"
    ? [...ECONOMY_KINDS, "holdTheLine"]
    : [...OFFENSIVE_KINDS, ...TIMED_OPERATION_KINDS];
  return [...new Set(kinds)];
}

export function isArchetypeFailure(record: BalanceRecord): boolean {
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
