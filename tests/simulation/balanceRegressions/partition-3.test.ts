import { describe, expect, it } from "vitest";
import { stableBalanceRecords } from "../../../lib/sim/balance";
import { runEdgeScenarios, assertEdgeScenarioRecords } from "./helpers";

describe("competent commander balance regressions partition 3", () => {
  it("replays the final prepared edge scenarios deterministically", () => {
    const first = runEdgeScenarios(9, 12);
    const sample = runEdgeScenarios(9, 10);
    expect(stableBalanceRecords(sample)).toEqual(stableBalanceRecords([first[0]!]));
    assertEdgeScenarioRecords(first, [
      "0033 / M5", "0038 / M5", "0039 / M5",
    ]);
  }, 180_000);
});
