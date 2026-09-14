import { describe, expect, it } from "vitest";
import { createCampaign } from "../../lib/gen/campaign";
import { NEW_MISSION_KINDS } from "../../lib/catalog";
import { generateMap } from "../../lib/gen/map";
import { MAX_MISSION_TICKS, MIN_MISSION_TICKS } from "../../lib/gen/pacing";
import { createMission, inspect, tick } from "../../lib/sim/api";
import { TILE_WATER } from "../../lib/types";

describe("determinism", () => {
  it("seed 0000 yields the same campaign twice", () => {
    const a = createCampaign(0);
    const b = createCampaign(0);
    expect(a).toEqual(b);
    expect(a.seed).toBe("0000");
    expect(a.missions).toHaveLength(6);
    const kinds = a.missions.map((m) => m.win.kind);
    expect(kinds.filter((kind) => NEW_MISSION_KINDS.includes(kind as typeof NEW_MISSION_KINDS[number]))).toHaveLength(3);
    expect(new Set(kinds).size).toBe(6);
    const biomes = a.missions.map((m) => m.biome);
    expect(new Set(biomes)).toEqual(new Set([a.world.biome]));
  });

  it("assigns the campaign biome to every mission from the seed", () => {
    for (const seed of [0, 42, 421, 9999]) {
      const campaign = createCampaign(seed);
      const biomes = campaign.missions.map((m) => m.biome);
      expect(biomes).toHaveLength(6);
      expect(biomes.every((biome) => biome === campaign.world.biome)).toBe(true);
      expect(createCampaign(seed).missions.map((m) => m.biome)).toEqual(biomes);
      const maps = campaign.missions.map((mission) => generateMap(seed, mission));
      expect(maps.map((map) => map.biome)).toEqual(biomes);
      expect(maps.every((map) => map.biome === campaign.world.biome)).toBe(true);
    }
  });

  it("applies biome tuning so campaigns differ by mission biome", () => {
    const stub = { index: 0, win: { kind: "annihilate" as const }, mapSize: 48 };
    const marshes = generateMap(42, { ...stub, biome: "salt marshes" });
    const desert = generateMap(42, { ...stub, biome: "glass desert" });
    expect(marshes.biome).not.toBe(desert.biome);
    const waterOf = (tiles: number[]) => tiles.filter((tile) => tile === TILE_WATER).length;
    expect(waterOf(marshes.tiles)).toBeGreaterThan(waterOf(desert.tiles));
  });

  it("mission objectives are paced for 5–20 minute runs", () => {
    for (const seed of [0, 42, 421, 9999]) {
      const campaign = createCampaign(seed);
      for (const mission of campaign.missions) {
        if (mission.win.kind === "holdTheLine") {
          expect(mission.win.ticks).toBeGreaterThanOrEqual(MIN_MISSION_TICKS);
          expect(mission.win.ticks).toBeLessThanOrEqual(MAX_MISSION_TICKS);
        }
        if (mission.win.kind === "harvestQuota") {
          expect(mission.win.target).toBeGreaterThanOrEqual(4000);
          expect(mission.win.target! % 500).toBe(0);
        }
        if (mission.win.kind === "forceQuota") {
          expect(mission.win.target).toBeGreaterThanOrEqual(6);
        }
        if (mission.win.kind === "structureQuota") {
          expect(mission.win.target).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it("same seed and ticks produce identical inspect reports", () => {
    const a = createMission({ seed: 0, missionIndex: 0 });
    const b = createMission({ seed: 0, missionIndex: 0 });
    for (let i = 0; i < 24; i++) {
      tick(a);
      tick(b);
    }
    expect(inspect(a)).toEqual(inspect(b));
  });

  it("replays 400 ticks identically for seeds 0 and 421", () => {
    for (const seed of [0, 421]) {
      const a = createMission({ seed, missionIndex: 0 });
      const b = createMission({ seed, missionIndex: 0 });
      for (let i = 0; i < 400 && a.result === "playing"; i++) {
        tick(a);
        tick(b);
      }
      expect(inspect(a)).toEqual(inspect(b));
      expect(a.tick).toBeGreaterThan(24);
    }
  });

  it("different seeds diverge", () => {
    const a = createCampaign(1);
    const b = createCampaign(2);
    expect(a.world.name + a.factions[0].name).not.toEqual(b.world.name + b.factions[0].name);
  });
});
