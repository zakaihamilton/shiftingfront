import { describe, expect, it } from "vitest";
import { createCampaign } from "../../../lib/gen/campaign";
import { generateMap } from "../../../lib/gen/map";
import { MAX_OPERATION_TICKS } from "../../../lib/gen/pacing";
import { cloneMapForSimulation, runOne, stableBalanceRecords, validMap, type BalanceScenario, type SharedScenarioData } from "../../../lib/sim/balance";

const BALANCE_REPLAY_FIXTURES: BalanceScenario[] = [
  { seed: 2, mission: 4 },
  { seed: 4, mission: 5 },
  { seed: 17, mission: 2 },
  { seed: 23, mission: 5 },
  { seed: 25, mission: 5 },
  { seed: 26, mission: 1 },
  { seed: 26, mission: 2 },
  { seed: 27, mission: 0 },
  { seed: 30, mission: 2 },
];

function runReplayFixtures() {
  return BALANCE_REPLAY_FIXTURES.map(({ seed, mission }) => {
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
  });
}

describe("recovered competent-commander balance replays", () => {
  it("keeps the nine formerly non-winning scenarios successful and deterministic", () => {
    const first = runReplayFixtures();
    const second = runReplayFixtures();

    expect(stableBalanceRecords(second)).toEqual(stableBalanceRecords(first));
    expect(first.map((record) => `${record.seed} / M${record.mission}`)).toEqual([
      "0002 / M4",
      "0004 / M5",
      "0017 / M2",
      "0023 / M5",
      "0025 / M5",
      "0026 / M1",
      "0026 / M2",
      "0027 / M0",
      "0030 / M2",
    ]);

    for (const record of first) {
      expect(record.result).toBe("won");
      expect(record.mapValid).toBe(true);
      expect(record.targetReachable).toBe(true);
      expect(record.commandRejections).toBe(0);
      expect(record.powerDeficit).toBe(false);
      expect(record.nonFiniteState).toBe(false);
    }
  }, 180_000);
});
