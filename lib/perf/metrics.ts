export type TimingSummary = {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

export function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const boundedRatio = Math.max(0, Math.min(1, ratio));
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * boundedRatio))] ?? 0;
}

export function summarizeTimings(values: readonly number[]): TimingSummary {
  return {
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: Math.max(...values, 0),
  };
}
