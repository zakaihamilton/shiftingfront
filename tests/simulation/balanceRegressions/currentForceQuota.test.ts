import { describe, expect, it } from "vitest";
import { createCampaign } from "../../../lib/gen/campaign";
import { generateMap } from "../../../lib/gen/map";
import { MAX_OPERATION_TICKS } from "../../../lib/gen/pacing";
import { cloneMapForSimulation, runOne, validMap, type SharedScenarioData } from "../../../lib/sim/balance";

function runCurrentScenario(seed: number, mission: number) {
  const campaign = createCampaign(seed, 2);
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

describe("current force-quota balance regressions", () => {
  it("sustains production through seed 0004 mission 5's 21-tank quota", () => {
    const seed = 4;
    const mission = 4;
    const campaign = createCampaign(seed, 2);
    const definition = campaign.missions[mission];
    if (!definition) throw new Error(`No mission ${mission} for seed ${seed}`);
    const record = runCurrentScenario(seed, mission);

    expect(definition.win).toMatchObject({ kind: "forceQuota", role: "tank", target: 21 });
    expect(record.result).toBe("won");
    expect(record.unitsProducedByRole?.tank).toBeGreaterThanOrEqual(21);
    expect(record.commandRejections).toBe(0);
    expect(record.powerDeficit).toBe(false);
  }, 60_000);

  it("keeps seed 0040 mission 1's opening force quota above the five-minute floor", () => {
    const record = runCurrentScenario(40, 0);

    expect(record.kind).toBe("forceQuota");
    expect(record.result).toBe("won");
    expect(record.duration).toBeGreaterThanOrEqual(3600);
    expect(record.duration).toBeLessThanOrEqual(8640);
  }, 60_000);
});
