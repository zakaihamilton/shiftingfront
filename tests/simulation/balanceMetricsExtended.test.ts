import { describe, expect, it } from "vitest";
import { archetypeFailureRecords, checkArchetypeBalance, checkBalance, DEFAULT_BALANCE_THRESHOLDS, summarizeBalance, type BalanceRecord } from "../../lib/sim/balance";

function makeRecord(overrides: Partial<BalanceRecord> = {}): BalanceRecord {
  return {
    kind: "escort",
    result: "won",
    truncated: false,
    duration: 100,
    credits: 500,
    unitsProduced: 2,
    aiUnitsProduced: 2,
    powerDeficit: false,
    casualties: 0,
    secondaryCompleted: 0,
    mapValid: true,
    commandsIssued: 3,
    commandRejections: 0,
    ...overrides,
  };
}

describe("summarizeBalance", () => {
  it("groups by mission index when present", () => {
    const records = [
      makeRecord({ mission: 0, result: "won" }),
      makeRecord({ mission: 0, result: "won" }),
      makeRecord({ mission: 1, result: "lost" }),
    ];
    const summary = summarizeBalance(records);
    expect(summary.byMission["0"]?.winRate).toBe(1);
    expect(summary.byMission["1"]?.winRate).toBe(0);
  });

  it("handles empty records", () => {
    const summary = summarizeBalance([]);
    expect(summary.samples).toBe(0);
    expect(summary.byMissionKind).toEqual({});
    expect(summary.byMission).toEqual({});
  });

  it("computes all average and rate fields", () => {
    const records = [
      makeRecord({ result: "won", duration: 100, credits: 200, casualties: 5, unitsProduced: 3, commandsIssued: 10, commandRejections: 1 }),
      makeRecord({ result: "lost", duration: 200, credits: 400, casualties: 10, unitsProduced: 5, commandsIssued: 20, commandRejections: 2 }),
    ];
    const summary = summarizeBalance(records);
    expect(summary.averageDuration).toBeCloseTo(150);
    expect(summary.averageCredits).toBeCloseTo(300);
    expect(summary.averageCasualties).toBeCloseTo(7.5);
    expect(summary.averageUnitsProduced).toBeCloseTo(4);
    expect(summary.averageCommands).toBeCloseTo(15);
    expect(summary.averageCommandRejections).toBeCloseTo(1.5);
    expect(summary.commandRejectionRate).toBeCloseTo(3 / 30);
    expect(summary.powerDeficitRate).toBe(0);
    expect(summary.nonFiniteStateRate).toBe(0);
  });

  it("counts non-finite state records", () => {
    const summary = summarizeBalance([
      makeRecord(),
      makeRecord({ nonFiniteState: true }),
    ]);

    expect(summary.nonFiniteStateRate).toBe(0.5);
  });

  it("summarizes gameplay diagnostics without requiring legacy fixtures to provide them", () => {
    const summary = summarizeBalance([
      makeRecord({
        firstCombatTick: 120,
        firstPressureTick: 360,
        primaryCompletedTick: 720,
        repairCommands: 2,
        openingCredits: 240,
        baselineRouteLength: 40,
        alternateRouteLength: 52,
        reachableResourceValue: 12_000,
        nearestResourceDistance: 7,
        laneCount: 2,
        targetDepth: 0.7,
        targetRouteLength: 55,
        targetReachable: true,
        supportActions: 3,
        healedHp: 36,
        repairedHp: 48,
        repairCredits: 24,
        hqThreatTicks: 12,
        rescueFirstContactTick: 240,
        rescueAllContactedTick: 300,
        rescueFirstReturnedTick: 420,
        rescuePhaseAtEnd: "extraction",
        forwardResourceValue: 8000,
        routeSeparation: 11,
      }),
    ]);
    expect(summary.byMissionKind.escort?.averageFirstCombatTick).toBe(120);
    expect(summary.byMissionKind.escort?.averageFirstPressureTick).toBe(360);
    expect(summary.byMissionKind.escort?.averagePrimaryCompletedTick).toBe(720);
    expect(summary.byMissionKind.escort?.averageRepairCommands).toBe(2);
    expect(summary.byMissionKind.escort?.averageSupportActions).toBe(3);
    expect(summary.byMissionKind.escort?.averageHealedHp).toBe(36);
    expect(summary.byMissionKind.escort?.averageRepairedHp).toBe(48);
    expect(summary.byMissionKind.escort?.averageHqThreatTicks).toBe(12);
    expect(summary.byMissionKind.escort?.averageRescueFirstContactTick).toBe(240);
    expect(summary.byMissionKind.escort?.rescueExtractionRate).toBe(1);
    expect(summary.byMissionKind.escort?.averageForwardResourceValue).toBe(8000);
    expect(summary.byMissionKind.escort?.averageRouteSeparation).toBe(11);
    expect(summary.byMissionKind.escort?.averageOpeningCredits).toBe(240);
    expect(summary.byMissionKind.escort?.averageAlternateRouteLength).toBe(52);
    expect(summary.byMissionKind.escort?.targetReachabilityRate).toBe(1);
  });

  it("keeps event telemetry unavailable when a strategy did not collect events", () => {
    const summary = summarizeBalance([makeRecord({ strategy: "rush" })]);
    expect(summary.byStrategy.rush?.averageSupportActions).toBeNull();
    expect(summary.byStrategy.rush?.averageHealedHp).toBeNull();
    expect(summary.byStrategy.rush?.averageRepairedHp).toBeNull();
    expect(summary.byStrategy.rush?.averageRepairCredits).toBeNull();
  });
});

describe("checkBalance", () => {
  it("enforces targeted mission-kind win-rate floors", () => {
    const records = Array.from({ length: 4 }, (_, index) => makeRecord({
      kind: "rescue",
      result: index < 2 ? "won" : "lost",
    }));
    const result = checkBalance(summarizeBalance(records), {
      minWinRate: 0,
      maxTimeoutRate: 1,
      minKindSamples: 4,
      minKindWinRate: 0,
      maxKindTimeoutRate: 1,
      maxTruncatedRate: 1,
      maxMapFailureRate: 1,
      maxPowerDeficitRate: 1,
      maxCommandRejectionRate: 1,
      maxAverageCasualties: 40,
      targetedKindWinRates: { rescue: 0.7 },
    });

    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("rescue targeted win rate");
  });

  it("enforces targeted mission-kind casualty ceilings", () => {
    const records = Array.from({ length: 4 }, () => makeRecord({ kind: "annihilate", casualties: 70 }));
    const result = checkBalance(summarizeBalance(records), {
      minWinRate: 0,
      maxTimeoutRate: 1,
      minKindSamples: 4,
      minKindWinRate: 0,
      maxKindTimeoutRate: 1,
      maxTruncatedRate: 1,
      maxMapFailureRate: 1,
      maxPowerDeficitRate: 1,
      maxCommandRejectionRate: 1,
      maxAverageCasualties: 100,
      maxKindAverageCasualties: { annihilate: 65 },
    });

    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("annihilate average casualties");
  });

  it("skips targeted casualty ceilings when below the minimum sample count", () => {
    const records = Array.from({ length: 3 }, () => makeRecord({ kind: "decapitate", casualties: 100 }));
    const result = checkBalance(summarizeBalance(records), {
      minWinRate: 0,
      maxTimeoutRate: 1,
      minKindSamples: 4,
      minKindWinRate: 0,
      maxKindTimeoutRate: 1,
      maxTruncatedRate: 1,
      maxMapFailureRate: 1,
      maxPowerDeficitRate: 1,
      maxCommandRejectionRate: 1,
      maxAverageCasualties: 100,
      maxKindAverageCasualties: { decapitate: 0 },
    });

    expect(result.passed).toBe(true);
  });

  it("passes with reasonable thresholds", () => {
    const records = Array.from({ length: 10 }, (_, i) => makeRecord({ result: i < 8 ? "won" : "lost" }));
    const result = checkBalance(summarizeBalance(records), {
      minWinRate: 0.5,
      maxWinRate: 0.95,
      maxTimeoutRate: 0.2,
      minKindSamples: 4,
      minKindWinRate: 0.4,
      maxKindTimeoutRate: 0.2,
      maxTruncatedRate: 0,
      maxMapFailureRate: 0,
      maxPowerDeficitRate: 0,
      maxCommandRejectionRate: 0,
      maxAverageCasualties: 40,
    });
    expect(result.passed).toBe(true);
  });

  it("does not require an artificial loss quota in the default gate", () => {
    const records = Array.from({ length: 10 }, () => makeRecord({ result: "won" }));
    const result = checkBalance(summarizeBalance(records), DEFAULT_BALANCE_THRESHOLDS);

    expect(DEFAULT_BALANCE_THRESHOLDS.maxWinRate).toBeUndefined();
    expect(DEFAULT_BALANCE_THRESHOLDS.targetedKindWinRates).toMatchObject({
      destroyMarked: 0.70,
      sabotage: 0.85,
      annihilate: 0.85,
      decapitate: 0.70,
      razeAll: 0.85,
      rescue: 0.80,
      extraction: 0.85,
    });
    expect(result.passed).toBe(true);
  });

  it("fails when win rate exceeds maxWinRate", () => {
    const records = Array.from({ length: 10 }, () => makeRecord({ result: "won" }));
    const result = checkBalance(summarizeBalance(records), {
      minWinRate: 0.5,
      maxWinRate: 0.8,
      maxTimeoutRate: 0.2,
      minKindSamples: 4,
      minKindWinRate: 0.4,
      maxKindTimeoutRate: 0.2,
      maxTruncatedRate: 0,
      maxMapFailureRate: 0,
      maxPowerDeficitRate: 0,
      maxCommandRejectionRate: 0,
      maxAverageCasualties: 40,
    });
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("win rate");
    expect(result.failures.join(" ")).toContain("exceeds");
  });

  it("rejects non-finite state records", () => {
    const result = checkBalance(summarizeBalance([makeRecord({ nonFiniteState: true })]), {
      minWinRate: 0,
      maxTimeoutRate: 1,
      minKindSamples: 1,
      minKindWinRate: 0,
      maxKindTimeoutRate: 1,
      maxTruncatedRate: 1,
      maxMapFailureRate: 1,
      maxPowerDeficitRate: 1,
      maxCommandRejectionRate: 1,
      maxAverageCasualties: 100,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("non-finite state rate");
  });

  it("skips kind-level checks when below minKindSamples", () => {
    const records = [makeRecord({ kind: "escort", result: "lost" })];
    const result = checkBalance(summarizeBalance(records), {
      minWinRate: 0,
      maxTimeoutRate: 1,
      minKindSamples: 4,
      minKindWinRate: 1.0,
      maxKindTimeoutRate: 0,
      maxTruncatedRate: 1,
      maxMapFailureRate: 1,
      maxPowerDeficitRate: 1,
      maxCommandRejectionRate: 1,
      maxAverageCasualties: 40,
    });
    expect(result.passed).toBe(true);
  });

  it("fails when mission-level win rate is below threshold", () => {
    const records = [
      makeRecord({ mission: 0, result: "lost" }),
      makeRecord({ mission: 0, result: "lost" }),
      makeRecord({ mission: 0, result: "lost" }),
      makeRecord({ mission: 0, result: "lost" }),
    ];
    const result = checkBalance(summarizeBalance(records), {
      minWinRate: 0,
      maxTimeoutRate: 1,
      minKindSamples: 4,
      minKindWinRate: 0.5,
      maxKindTimeoutRate: 1,
      maxTruncatedRate: 1,
      maxMapFailureRate: 1,
      maxPowerDeficitRate: 1,
      maxCommandRejectionRate: 1,
      maxAverageCasualties: 40,
    });
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("mission 1 win rate");
  });

  it("skips mission-level checks when below minKindSamples", () => {
    const records = [makeRecord({ mission: 0, result: "lost" })];
    const result = checkBalance(summarizeBalance(records), {
      minWinRate: 0,
      maxTimeoutRate: 1,
      minKindSamples: 4,
      minKindWinRate: 1.0,
      maxKindTimeoutRate: 1,
      maxTruncatedRate: 1,
      maxMapFailureRate: 1,
      maxPowerDeficitRate: 1,
      maxCommandRejectionRate: 1,
      maxAverageCasualties: 40,
    });
    expect(result.passed).toBe(true);
  });

  it("reports power deficit, map failure, and rejection rates", () => {
    const records = [
      makeRecord({ powerDeficit: true, mapValid: false, commandRejections: 5, commandsIssued: 10 }),
    ];
    const result = checkBalance(summarizeBalance(records), {
      minWinRate: 0,
      maxTimeoutRate: 1,
      minKindSamples: 4,
      minKindWinRate: 0,
      maxKindTimeoutRate: 1,
      maxTruncatedRate: 1,
      maxMapFailureRate: 0,
      maxPowerDeficitRate: 0,
      maxCommandRejectionRate: 0,
      maxAverageCasualties: 40,
    });
    expect(result.failures.join(" ")).toContain("power deficit");
    expect(result.failures.join(" ")).toContain("map failure");
    expect(result.failures.join(" ")).toContain("command rejection");
  });

  it("reports average casualties exceeding threshold", () => {
    const records = [makeRecord({ casualties: 50 })];
    const result = checkBalance(summarizeBalance(records), {
      minWinRate: 0,
      maxTimeoutRate: 1,
      minKindSamples: 4,
      minKindWinRate: 0,
      maxKindTimeoutRate: 1,
      maxTruncatedRate: 1,
      maxMapFailureRate: 1,
      maxPowerDeficitRate: 1,
      maxCommandRejectionRate: 1,
      maxAverageCasualties: 10,
    });
    expect(result.failures.join(" ")).toContain("average casualties");
  });

  it("reports truncated run rate exceeding threshold", () => {
    const records = [makeRecord({ truncated: true })];
    const result = checkBalance(summarizeBalance(records), {
      minWinRate: 0,
      maxTimeoutRate: 1,
      minKindSamples: 4,
      minKindWinRate: 0,
      maxKindTimeoutRate: 1,
      maxTruncatedRate: 0,
      maxMapFailureRate: 1,
      maxPowerDeficitRate: 1,
      maxCommandRejectionRate: 1,
      maxAverageCasualties: 40,
    });
    expect(result.failures.join(" ")).toContain("truncated");
  });
});

describe("checkArchetypeBalance", () => {
  it("groups records by strategy and family", () => {
    const summary = summarizeBalance([
      makeRecord({ strategy: "rush", family: "economy", kind: "harvestQuota" }),
      makeRecord({ strategy: "rush", family: "economy", kind: "forceQuota", result: "lost" }),
    ]);
    expect(summary.byStrategy.rush?.byFamily.economy?.samples).toBe(2);
    expect(summary.byStrategy.rush?.byMissionKind.harvestQuota?.wins).toBe(1);
  });

  it("rejects reliability failures and anti-cheese universal wins", () => {
    const records = ["rush", "turtle", "greed", "infantry", "vehicles"].flatMap((strategy) =>
      Array.from({ length: 8 }, (_, index): BalanceRecord => ({
        ...makeRecord({ strategy: strategy as BalanceRecord["strategy"], kind: strategy === "rush" ? "harvestQuota" : "decapitate" }),
        result: "won",
        commandRejections: strategy === "turtle" && index === 0 ? 1 : 0,
      })),
    );
    const result = checkArchetypeBalance(summarizeBalance(records), records);
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("rush harvestQuota");
    expect(result.failures.join(" ")).toContain("turtle has rejected commands");
  });

  it("reports successful records contributing to an anti-cheese violation", () => {
    const records = Array.from({ length: 8 }, () => makeRecord({
      strategy: "rush",
      family: "economy",
      kind: "harvestQuota",
      result: "won",
    }));
    const failures = archetypeFailureRecords(summarizeBalance(records), records, ["rush"]);
    expect(failures).toHaveLength(8);
  });

  it("does not cap an autonomous escort objective for an archetype", () => {
    const records = Array.from({ length: 8 }, () => makeRecord({
      strategy: "greed",
      kind: "escort",
      result: "won",
    }));
    const result = checkArchetypeBalance(summarizeBalance(records), records, ["greed"]);
    expect(result).toEqual({ passed: true, failures: [] });
  });
});
