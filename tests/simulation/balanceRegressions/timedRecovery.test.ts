import { describe, expect, it } from "vitest";
import { createCampaign } from "../../../lib/gen/campaign";
import { generateMap } from "../../../lib/gen/map";
import { MAX_OPERATION_TICKS } from "../../../lib/gen/pacing";
import { cloneMapForSimulation, runOne, validMap, type BalanceScenario, type SharedScenarioData } from "../../../lib/sim/balance";

const TIMED_RECOVERY_FIXTURES: BalanceScenario[] = [
  { seed: 15, mission: 2 },
  { seed: 11, mission: 1 },
  { seed: 12, mission: 1 },
  { seed: 24, mission: 1 },
  { seed: 33, mission: 2 },
  { seed: 34, mission: 2 },
  { seed: 35, mission: 3 },
  { seed: 39, mission: 2 },
];

function runFixture({ seed, mission }: BalanceScenario) {
  const campaign = createCampaign(seed);
  const definition = campaign.missions[mission];
  if (!definition) throw new Error(`No mission ${mission} for seed ${seed}`);
  const map = generateMap(seed, definition);
  const sharedScenario: SharedScenarioData = { mapValid: validMap(map) };
  return runOne(
    seed,
    mission,
    "competent",
    MAX_OPERATION_TICKS,
    campaign,
    cloneMapForSimulation(map),
    sharedScenario,
  );
}

describe("timed recovery balance regressions", () => {
  it("completes the formerly stranded contact and return scenarios", () => {
    for (const fixture of TIMED_RECOVERY_FIXTURES) {
      const record = runFixture(fixture);
      expect(record.result, `${record.seed} / M${fixture.mission}`).toBe("won");
      expect(record.mapValid).toBe(true);
      expect(record.targetReachable).toBe(true);
      expect(record.commandRejections).toBe(0);
      expect(record.powerDeficit).toBe(false);
      expect(record.nonFiniteState).toBe(false);
    }
  }, 180_000);
});
