import { describe, expect, it } from "vitest";
import { percentile, summarizeTimings } from "../../lib/perf/metrics";

describe("performance timing metrics", () => {
  it("calculates bounded percentile values", () => {
    const samples = [1, 2, 3, 4, 5];
    expect(percentile(samples, 0.5)).toBe(3);
    expect(percentile(samples, 0.95)).toBe(5);
    expect(percentile(samples, 0.99)).toBe(5);
    expect(percentile(samples, -1)).toBe(1);
    expect(percentile(samples, 2)).toBe(5);
    expect(percentile([], 0.99)).toBe(0);
  });

  it("reports p99 separately from rare maximum spikes", () => {
    const summary = summarizeTimings([...Array(100).fill(1), 100]);
    expect(summary).toEqual({ p50Ms: 1, p95Ms: 1, p99Ms: 1, maxMs: 100 });
  });
});
