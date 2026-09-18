import { describe, expect, it } from "vitest";
import { stableBalanceRecords } from "../../../lib/sim/balance";
import { runEdgeScenarios, assertEdgeScenarioRecords } from "./helpers";

describe("competent commander balance regressions partition 2", () => {
  it("replays the prepared edge scenarios deterministically", () => {
    const first = runEdgeScenarios(6, 9);
    const sample = runEdgeScenarios(6, 7);
    expect(stableBalanceRecords(sample)).toEqual(stableBalanceRecords([first[0]!]));
    assertEdgeScenarioRecords(first, [
      "0028 / M4", "0029 / M5", "0030 / M2",
    ]);
  }, 180_000);
});
