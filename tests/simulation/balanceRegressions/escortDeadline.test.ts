import { describe, expect, it } from "vitest";
import { createCampaign } from "../../../lib/gen/campaign";
import { generateMap } from "../../../lib/gen/map";
import { MAX_OPERATION_TICKS } from "../../../lib/gen/pacing";
import { cloneMapForSimulation, runOne, validMap } from "../../../lib/sim/balance";

const ESCORT_DEADLINE_FIXTURES = [
  { seed: 6, mission: 4 },
  { seed: 9, mission: 3 },
  { seed: 20, mission: 2 },
] as const;

describe("escort deadline regressions", () => {
  it("completes the previously deadline-bound competent runs", () => {
    for (const { seed, mission } of ESCORT_DEADLINE_FIXTURES) {
      const campaign = createCampaign(seed);
      const definition = campaign.missions[mission]!;
      const map = generateMap(seed, definition);
      const record = runOne(
        seed,
        mission,
        "competent",
        MAX_OPERATION_TICKS,
        campaign,
        cloneMapForSimulation(map),
        { mapValid: validMap(map) },
      );

      expect(record.kind).toBe("escort");
      expect(record.result).toBe("won");
      expect(record.lossReason).toBeUndefined();
      expect(record.targetReachable).toBe(true);
      expect(record.commandRejections).toBe(0);
      expect(record.powerDeficit).toBe(false);
      expect(record.nonFiniteState).toBe(false);
    }
  }, 120_000);
});
