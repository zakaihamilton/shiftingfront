import { describe, expect, it } from "vitest";
import { stableBalanceRecords } from "../../../lib/sim/balance";
import { runEdgeScenarios, assertEdgeScenarioRecords } from "./helpers";

describe("competent commander balance regressions partition 0", () => {
  it("replays the first prepared edge scenarios deterministically", () => {
    const first = runEdgeScenarios(0, 3);
    const second = runEdgeScenarios(0, 3);
    expect(stableBalanceRecords(second)).toEqual(stableBalanceRecords(first));
    assertEdgeScenarioRecords(first, [
      "0001 / M5", "0002 / M4", "0012 / M5",
    ]);
  }, 180_000);
});
