import { describe, expect, it } from "vitest";
import { UNIT_STATS } from "../../lib/catalog";
import { deserializeState, serializeState } from "../../lib/persist/save";
import { flowFieldForGoals } from "../../lib/sim/flowField";
import { addUnit, makeFixture } from "../../lib/sim/fixtures";
import { heightMultiplier } from "../../lib/sim/combat/targeting";
import {
  directFireRangeBonusAt,
  groundUnitSightAt,
  incomingDamageMultiplier,
  terrainMovementCostAt,
  terrainRuleAt,
} from "../../lib/sim/terrainRules";
import type { BiomeName, SimState } from "../../lib/types";

const BIOMES: readonly BiomeName[] = [
  "ash plains", "crystal flats", "rust canyons", "salt marshes", "glass desert", "tundra grid", "jungle wreckage", "volcanic shelf",
];
const states = new Map<BiomeName, SimState>();

function stateFor(biome: BiomeName): SimState {
  const cached = states.get(biome);
  if (cached) return cached;
  const state = makeFixture({ width: 80, height: 80, seed: 711, win: { kind: "annihilate" } });
  state.biome = biome;
  state.missionIndex = 3;
  states.set(biome, state);
  return state;
}

function activeTile(state: SimState): { x: number; y: number } {
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (terrainRuleAt(state, x, y)?.active) return { x, y };
    }
  }
  throw new Error(`No active feature region in ${state.biome}`);
}

function boundaryPair(state: SimState): { active: { x: number; y: number }; outside: { x: number; y: number } } {
  for (let y = 1; y < state.height - 1; y++) {
    for (let x = 1; x < state.width - 1; x++) {
      if (!terrainRuleAt(state, x, y)?.active) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!terrainRuleAt(state, x + dx, y + dy)?.active) {
          return { active: { x, y }, outside: { x: x + dx, y: y + dy } };
        }
      }
    }
  }
  throw new Error(`No feature boundary in ${state.biome}`);
}

describe("seeded tactical terrain rules", () => {
  it("classifies every biome deterministically from the same seeded feature sample", () => {
    for (const biome of BIOMES) {
      const state = stateFor(biome);
      const other = makeFixture({ width: state.width, height: state.height, seed: state.seed, win: { kind: "annihilate" } });
      other.biome = state.biome;
      other.missionIndex = state.missionIndex;
      const { x, y } = activeTile(state);
      expect(terrainRuleAt(state, x, y)).toEqual(terrainRuleAt(other, x, y));
      expect(terrainRuleAt(state, x, y)?.intensity).toBeGreaterThanOrEqual(0.55);
    }
  });

  it("changes Ash and Crystal ground vision by one tile, symmetrically for both owners", () => {
    for (const [biome, delta] of [["ash plains", -1], ["crystal flats", 1]] as const) {
      const state = stateFor(biome);
      const tile = activeTile(state);
      const player = addUnit(state, 0, "infantry", tile.x, tile.y);
      const enemy = addUnit(state, 1, "infantry", tile.x, tile.y);
      player.x = tile.x;
      player.y = tile.y;
      enemy.x = tile.x;
      enemy.y = tile.y;
      expect(groundUnitSightAt(state, player, UNIT_STATS.infantry.sight)).toBe(UNIT_STATS.infantry.sight + delta);
      expect(groundUnitSightAt(state, enemy, UNIT_STATS.infantry.sight)).toBe(UNIT_STATS.infantry.sight + delta);
      const plane = addUnit(state, 0, "strikePlane", tile.x, tile.y);
      expect(groundUnitSightAt(state, plane, UNIT_STATS.strikePlane.sight)).toBe(UNIT_STATS.strikePlane.sight);
    }
  });

  it("reduces incoming damage for Rust units and Jungle infantry only", () => {
    const rust = stateFor("rust canyons");
    const rustTile = activeTile(rust);
    const rustPlayer = addUnit(rust, 0, "tank", rustTile.x, rustTile.y);
    const rustEnemy = addUnit(rust, 1, "tank", rustTile.x, rustTile.y);
    expect(incomingDamageMultiplier(rust, rustPlayer)).toBe(0.85);
    expect(incomingDamageMultiplier(rust, rustEnemy)).toBe(0.85);

    const jungle = stateFor("jungle wreckage");
    const jungleTile = activeTile(jungle);
    const infantry = addUnit(jungle, 0, "infantry", jungleTile.x, jungleTile.y);
    const vehicle = addUnit(jungle, 0, "tank", jungleTile.x, jungleTile.y);
    expect(incomingDamageMultiplier(jungle, infantry)).toBe(0.85);
    expect(incomingDamageMultiplier(jungle, vehicle)).toBe(1);
  });

  it("applies Salt Marsh and Tundra vehicle movement cost in active regions", () => {
    for (const [biome, expected] of [["salt marshes", 1.2], ["tundra grid", 0.85]] as const) {
      const state = stateFor(biome);
      const tile = activeTile(state);
      expect(terrainMovementCostAt(state, "vehicle", tile.x, tile.y)).toBeCloseTo(expected);
      expect(terrainMovementCostAt(state, "foot", tile.x, tile.y)).toBe(1);
      const { active, outside } = boundaryPair(state);
      const foot = flowFieldForGoals(state, [active], "foot");
      const vehicle = flowFieldForGoals(state, [active], "vehicle");
      const index = outside.y * state.width + outside.x;
      expect(foot.distance[index]).toBeCloseTo(1);
      expect(vehicle.distance[index]).toBeCloseTo(expected);
    }
  });

  it("extends Glass Desert ground direct-fire range only from active regions", () => {
    const state = stateFor("glass desert");
    const tile = activeTile(state);
    const player = addUnit(state, 0, "antiArmor", tile.x, tile.y);
    const enemy = addUnit(state, 1, "antiArmor", tile.x, tile.y);
    player.x = tile.x;
    player.y = tile.y;
    enemy.x = tile.x;
    enemy.y = tile.y;
    expect(directFireRangeBonusAt(state, player)).toBe(0.5);
    expect(directFireRangeBonusAt(state, enemy)).toBe(0.5);
    const plane = addUnit(state, 0, "strikePlane", tile.x, tile.y);
    expect(directFireRangeBonusAt(state, plane)).toBe(0);
  });

  it("raises Volcanic Shelf downhill damage from active regions", () => {
    const state = stateFor("volcanic shelf");
    const tile = activeTile(state);
    const attacker = addUnit(state, 0, "tank", tile.x, tile.y);
    const target = addUnit(state, 1, "infantry", tile.x + 1, tile.y);
    state.heights[tile.y * state.width + tile.x] = 3;
    state.heights[target.y * state.width + target.x] = 1;
    expect(heightMultiplier(state, attacker, target)).toBe(1.25);
  });

  it("rebuilds the same derived classification after save and reload without storing rule data", () => {
    const state = stateFor("tundra grid");
    const { x, y } = activeTile(state);
    const expected = terrainRuleAt(state, x, y);
    const raw = serializeState(state);
    expect(JSON.parse(raw)).not.toHaveProperty("terrainRules");
    const restored = deserializeState(raw);
    expect(terrainRuleAt(restored, x, y)).toEqual(expected);
    expect(terrainMovementCostAt(restored, "vehicle", x, y)).toBeCloseTo(0.85);
  });
});
