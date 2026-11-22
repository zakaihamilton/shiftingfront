import { describe, expect, it } from "vitest";
import { type BalanceRecord, checkBalance, summarizeBalance } from "../../lib/sim/balance";

const records: BalanceRecord[] = [
  {
    kind: "rescue",
    result: "won",
    truncated: false,
    duration: 100,
    credits: 900,
    unitsProduced: 2,
    aiUnitsProduced: 3,
    powerDeficit: false,
    casualties: 0,
    secondaryCompleted: 2,
    mapValid: true,
    commandsIssued: 4,
    commandRejections: 0,
  },
  {
    kind: "rescue",
    result: "lost",
    truncated: false,
    duration: 200,
    credits: 200,
    unitsProduced: 4,
    aiUnitsProduced: 5,
    powerDeficit: false,
    casualties: 3,
    secondaryCompleted: 0,
    mapValid: true,
    commandsIssued: 5,
    commandRejections: 1,
    lossReason: "yardDestroyed",
  },
  {
    kind: "sabotage",
    result: "playing",
    truncated: true,
    duration: 300,
    credits: 100,
    unitsProduced: 6,
    aiUnitsProduced: 8,
    powerDeficit: true,
    casualties: 4,
    secondaryCompleted: 0,
    mapValid: false,
    commandsIssued: 6,
    commandRejections: 0,
  },
];

describe("balance metrics", () => {
  it("summarizes completion and reliability by mission kind", () => {
    const summary = summarizeBalance(records);

    expect(summary.samples).toBe(3);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(1);
    expect(summary.timeouts).toBe(1);
    expect(summary.mapFailureRate).toBeCloseTo(1 / 3);
    expect(summary.byMissionKind.rescue?.winRate).toBe(0.5);
    expect(summary.byMissionKind.rescue?.lossReasons).toEqual({ yardDestroyed: 1 });
    expect(summary.byMissionKind.rescue?.commandRejectionRate).toBeCloseTo(1 / 9);
  });

  it("reports acceptance threshold failures without hiding the measured data", () => {
    const summary = summarizeBalance(records);
    const result = checkBalance(summary, {
      minWinRate: 0.5,
      maxTimeoutRate: 0.2,
      minKindSamples: 4,
      minKindWinRate: 0.1,
      maxKindTimeoutRate: 0.8,
      maxTruncatedRate: 0,
      maxMapFailureRate: 0,
      maxPowerDeficitRate: 0,
      maxCommandRejectionRate: 0,
      maxAverageCasualties: 2,
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(7);
    expect(result.failures.join(" ")).toContain("timeout rate");
    expect(result.failures.join(" ")).toContain("truncated run rate");
    expect(result.failures.join(" ")).toContain("map failure rate");
  });

  it("checks mission kinds once enough samples are available", () => {
    const kindRecords = Array.from(
      { length: 4 },
      (_, index): BalanceRecord => ({
        kind: "sabotage",
        result: index === 0 ? "won" : "playing",
        truncated: false,
        duration: 100,
        credits: 900,
        unitsProduced: 2,
        aiUnitsProduced: 3,
        powerDeficit: false,
        casualties: 0,
        secondaryCompleted: 0,
        mapValid: true,
        commandsIssued: 1,
        commandRejections: 0,
      }),
    );
    const result = checkBalance(summarizeBalance(kindRecords), {
      minWinRate: 0,
      maxTimeoutRate: 1,
      minKindSamples: 4,
      minKindWinRate: 0.5,
      maxKindTimeoutRate: 0.5,
      maxTruncatedRate: 0,
      maxMapFailureRate: 0,
      maxPowerDeficitRate: 0,
      maxCommandRejectionRate: 0,
      maxAverageCasualties: 40,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("sabotage win rate");
    expect(result.failures.join(" ")).toContain("sabotage timeout rate");
  });
});
