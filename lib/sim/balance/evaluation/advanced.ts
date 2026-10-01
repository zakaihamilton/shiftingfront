import type { BalanceRecord } from "./types";
import { ADVANCED_STRATEGIES } from "../../commander/advanced";
import { summarizeBalance } from "./aggregation";

/** Require matching, adequately sampled mission families before proposing a nerf. */
export function advancedDominance(records: BalanceRecord[], minFamilySamples = 8) {
  const summary = summarizeBalance(records);
  const baseline = summary.byStrategy.competent;
  if (!baseline) return [];
  return ADVANCED_STRATEGIES.flatMap(strategy => {
    const diagnostic = summary.byStrategy[strategy];
    if (!diagnostic) return [];
    return Object.entries(diagnostic.byFamily).flatMap(([family, result]) => {
      const reference = baseline.byFamily[family];
      if (!reference || reference.samples < minFamilySamples || result.samples < minFamilySamples) return [];
      return result.winRate > 0.9 && result.winRate >= reference.winRate + 0.1
        ? [{ strategy, family, winRate: result.winRate, baselineWinRate: reference.winRate, samples: result.samples }]
        : [];
    });
  });
}
