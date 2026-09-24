import type { BalanceCheck, BalanceSummary, BalanceThresholds } from "./types";

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
