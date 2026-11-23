import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  ARCHETYPE_STRATEGIES,
  balanceScenarios,
  representativePlaytestManifest,
  runBalanceScenarios,
  runBalanceSweepScenarios,
  stableBalanceRecords,
} from "../../lib/sim/balance";

describe("balance runner", () => {
  it("keeps serial and worker-thread results deterministic and identically ordered", async () => {
    const options = { from: 0, to: 3, missions: [0], maxTicks: 24, strategy: "competent" as const };
    const serial = await runBalanceScenarios({ ...options, jobs: 1 });
    const parallel = await runBalanceScenarios({ ...options, jobs: 2 });
    expect(JSON.stringify(stableBalanceRecords(parallel))).toBe(
      JSON.stringify(stableBalanceRecords(serial)),
    );
    expect(parallel.map((record) => `${record.seed}:${record.mission}`)).toEqual([
      "0000:0",
      "0001:0",
      "0002:0",
      "0003:0",
    ]);
  });

  it.each(["rush", "turtle", "greed", "infantry", "vehicles"] as const)(
    "keeps %s serial and worker-thread results deterministic",
    async (strategy) => {
      const options = { from: 0, to: 1, missions: [0, 1], maxTicks: 24, strategy };
      const serial = await runBalanceScenarios({ ...options, jobs: 1 });
      const parallel = await runBalanceScenarios({ ...options, jobs: 2 });
      expect(JSON.stringify(stableBalanceRecords(parallel))).toBe(
        JSON.stringify(stableBalanceRecords(serial)),
      );
    },
  );

  it("reports progress while scenarios complete", async () => {
    const progress: Array<{ completed: number; total: number }> = [];
    await runBalanceScenarios({
      from: 0,
      to: 1,
      missions: [0],
      maxTicks: 12,
      jobs: 2,
      strategy: "competent",
      onProgress: ({ completed, total }) => progress.push({ completed, total }),
    });
    expect(progress).toHaveLength(2);
    expect(progress.map((entry) => entry.total)).toEqual([2, 2]);
    expect(progress.at(-1)?.completed).toBe(2);
  });

  it("stops worker execution when the elapsed budget has expired", async () => {
    await expect(
      runBalanceSweepScenarios({
        from: 0,
        to: 1,
        missions: [0],
        maxTicks: 24,
        strategies: [...ARCHETYPE_STRATEGIES],
        scenarioList: [
          { seed: 0, mission: 0 },
          { seed: 1, mission: 0 },
        ],
        jobs: 2,
        deadlineAt: performance.now() - 1,
      }),
    ).rejects.toThrow("Balance sweep exceeded its elapsed-time budget");
  });

  it("keeps the optimized archetype sweep equivalent and isolated", async () => {
    const scenarioList = balanceScenarios({ from: 0, to: 1, missions: [0, 1] });
    const options = {
      from: 0,
      to: 1,
      missions: [0, 1],
      maxTicks: 24,
      strategies: [...ARCHETYPE_STRATEGIES],
      scenarioList,
    };
    const expected = (
      await Promise.all(
        ARCHETYPE_STRATEGIES.map((strategy) =>
          runBalanceScenarios({
            from: options.from,
            to: options.to,
            missions: options.missions,
            maxTicks: options.maxTicks,
            strategy,
            scenarioList,
            jobs: 1,
          }),
        ),
      )
    ).flat();
    const progress: Array<{ completed: number; total: number }> = [];
    const serial = await runBalanceSweepScenarios({
      ...options,
      jobs: 1,
      onProgress: ({ completed, total }) => progress.push({ completed, total }),
    });
    const parallel = await runBalanceSweepScenarios({ ...options, jobs: 2 });
    const expectedStable = stableBalanceRecords(expected);
    expect(stableBalanceRecords(serial)).toEqual(expectedStable);
    expect(stableBalanceRecords(parallel)).toEqual(expectedStable);
    expect(progress).toHaveLength(scenarioList.length * ARCHETYPE_STRATEGIES.length);
    expect(progress.at(-1)).toEqual({
      completed: scenarioList.length * ARCHETYPE_STRATEGIES.length,
      total: scenarioList.length * ARCHETYPE_STRATEGIES.length,
    });
  });

  it("reports gameplay diagnostics and a complete deterministic playtest manifest", async () => {
    const [record] = await runBalanceScenarios({
      from: 0,
      to: 0,
      missions: [0],
      maxTicks: 24,
      jobs: 1,
      strategy: "rush",
    });
    expect(record).toMatchObject({
      strategy: "rush",
      family: expect.any(String),
      baselineRouteLength: expect.any(Number),
      alternateRouteLength: expect.any(Number),
      reachableResourceValue: expect.any(Number),
      nearestResourceDistance: expect.any(Number),
      laneCount: expect.any(Number),
      targetDepth: expect.any(Number),
      targetRouteLength: expect.any(Number),
      targetReachable: true,
      repairCommands: 0,
    });

    const manifest = representativePlaytestManifest();
    expect(manifest).toHaveLength(16);
    expect([...new Set(manifest.map((entry) => entry.variant))]).toHaveLength(8);
    const counts = new Map<string, number>();
    for (const entry of manifest) counts.set(entry.variant, (counts.get(entry.variant) ?? 0) + 1);
    expect([...counts.values()].every((count) => count === 2)).toBe(true);
  });
});
