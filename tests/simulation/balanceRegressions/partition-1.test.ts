import { describe, expect, it } from "vitest";
import { stableBalanceRecords } from "../../../lib/sim/balance";
import { runEdgeScenarios, assertEdgeScenarioRecords } from "./helpers";

describe("competent commander balance regressions partition 1", () => {
  it("replays the prepared edge scenarios deterministically", () => {
    const first = runEdgeScenarios(3, 6);
    const second = runEdgeScenarios(3, 6);
    expect(stableBalanceRecords(second)).toEqual(stableBalanceRecords(first));
    assertEdgeScenarioRecords(first, [
      "0016 / M5", "0022 / M4", "0026 / M3",
    ]);
  }, 180_000);
});
