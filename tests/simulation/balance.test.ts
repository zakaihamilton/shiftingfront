import { describe, expect, it } from "vitest";
import { createCampaign } from "../../lib/gen/campaign";
import { generateMap } from "../../lib/gen/map";
import { createMission } from "../../lib/sim/api";
import { createScenarioRunner } from "../../lib/sim/scenarioRunner";
import { TILE_BLOCKED, TILE_WATER } from "../../lib/types";

const SEEDS = [0, 421, 9999];

describe("campaign balance sweep", () => {
  it("keeps every sampled mission playable and economically stable through its opening", () => {
    for (const seed of SEEDS) {
      const campaign = createCampaign(seed);
      expect(campaign.missions).toHaveLength(6);
      for (const mission of campaign.missions) {
        const map = generateMap(seed, mission);
        const startTiles = [map.playerStart, map.enemyStart].map((point) => map.tiles[point.y * map.width + point.x]);
        expect(startTiles).not.toContain(TILE_BLOCKED);
        expect(startTiles).not.toContain(TILE_WATER);
        expect(map.resourceAmount.reduce((sum, amount) => sum + amount, 0)).toBeGreaterThanOrEqual(4_000);

        const state = createMission({ seed, missionIndex: mission.index });
        createScenarioRunner(state).run({ maxTicks: 180 });
        expect(state.tick).toBeGreaterThan(0);
        expect(state.credits.every(Number.isFinite)).toBe(true);
        expect(state.entities.every((entity) => Number.isFinite(entity.hp) && entity.maxHp > 0)).toBe(true);
      }
    }
  });
});
