import { isAirUnit, UNIT_STATS } from "../catalog";
import { ACTIVE_TERRAIN_RULE_INTENSITY, terrainFeatureSamplerFor, type TerrainFeatureSample } from "../gen/map/features";
import type { BiomeName, Entity, SimState, UnitKind } from "../types";

export const TERRAIN_RULE_INTENSITY = ACTIVE_TERRAIN_RULE_INTENSITY;

export type TerrainRuleTile = TerrainFeatureSample & { active: boolean };
export type NavigationMobility = "foot" | "vehicle";

type CachedTerrainRules = {
  mapKey: string;
  seed: number;
  missionIndex: number;
  biome: BiomeName;
  width: number;
  height: number;
  samples: Array<TerrainRuleTile | undefined>;
  vehicleMovementCosts: Float32Array;
  activeByEntity: WeakMap<object, { x: number; y: number; active: boolean }>;
  sampleFeature: (x: number, y: number) => TerrainFeatureSample;
};

const rulesByState = new WeakMap<SimState, CachedTerrainRules>();
const rulesByMap = new Map<string, CachedTerrainRules>();
const MAP_RULE_CACHE_LIMIT = 32;

function mapKeyFor(state: SimState): string {
  return `${state.seed}:${state.missionIndex}:${state.biome}:${state.width}x${state.height}`;
}

function rulesFor(state: SimState): CachedTerrainRules {
  const cached = rulesByState.get(state);
  if (
    cached && cached.seed === state.seed && cached.missionIndex === state.missionIndex && cached.biome === state.biome &&
    cached.width === state.width && cached.height === state.height
  ) return cached;

  const mapKey = mapKeyFor(state);
  const shared = rulesByMap.get(mapKey);
  if (shared) {
    rulesByMap.delete(mapKey);
    rulesByMap.set(mapKey, shared);
    rulesByState.set(state, shared);
    return shared;
  }

  const size = Math.max(0, state.width * state.height);
  const created: CachedTerrainRules = {
    mapKey,
    seed: state.seed,
    missionIndex: state.missionIndex,
    biome: state.biome,
    width: state.width,
    height: state.height,
    samples: new Array(size),
    vehicleMovementCosts: new Float32Array(size).fill(1),
    activeByEntity: new WeakMap(),
    sampleFeature: terrainFeatureSamplerFor({
      seed: state.seed,
      missionIndex: state.missionIndex,
      biome: state.biome,
      width: state.width,
      height: state.height,
    }),
  };
  rulesByMap.set(mapKey, created);
  while (rulesByMap.size > MAP_RULE_CACHE_LIMIT) {
    const oldestKey = rulesByMap.keys().next().value;
    if (oldestKey === undefined) break;
    rulesByMap.delete(oldestKey);
  }
  rulesByState.set(state, created);
  return created;
}

function inBounds(state: SimState, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < state.width && y < state.height;
}

/**
 * Return the seeded feature classification for one tile. Samples are derived
 * lazily and kept outside SimState, so saves contain no terrain-rule fields.
 */
export function terrainRuleAt(state: SimState, x: number, y: number): TerrainRuleTile | undefined {
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (!inBounds(state, tx, ty)) return undefined;
  const rules = rulesFor(state);
  const index = ty * state.width + tx;
  const cached = rules.samples[index];
  if (cached) return cached;

  const sample = rules.sampleFeature(tx, ty);
  const active = sample.intensity >= ACTIVE_TERRAIN_RULE_INTENSITY;
  const tile = { ...sample, active };
  rules.samples[index] = tile;
  if (active && state.biome === "salt marshes") rules.vehicleMovementCosts[index] = 1.2;
  else if (active && state.biome === "tundra grid") rules.vehicleMovementCosts[index] = 0.85;
  return tile;
}

export function terrainRuleActiveAt(state: SimState, x: number, y: number): boolean {
  return terrainRuleAt(state, x, y)?.active ?? false;
}

function entityInActiveRegion(state: SimState, entity: object, x: number, y: number): boolean {
  const rules = rulesFor(state);
  const cached = rules.activeByEntity.get(entity);
  if (cached && cached.x === x && cached.y === y) return cached.active;
  const active = terrainRuleActiveAt(state, x, y);
  rules.activeByEntity.set(entity, { x, y, active });
  return active;
}

export function terrainMovementCostAt(state: SimState, mobility: NavigationMobility, x: number, y: number): number {
  if (mobility !== "vehicle" || (state.biome !== "salt marshes" && state.biome !== "tundra grid")) return 1;
  terrainRuleAt(state, x, y);
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (!inBounds(state, tx, ty)) return 1;
  return rulesFor(state).vehicleMovementCosts[ty * state.width + tx] ?? 1;
}

export function navigationMobilityFor(entity: Pick<Entity, "class" | "kind">): NavigationMobility {
  if (entity.class === "unit" && !isAirUnit(entity.kind as UnitKind) && UNIT_STATS[entity.kind as UnitKind].domain === "vehicle") {
    return "vehicle";
  }
  return "foot";
}

export function groundUnitSightAt(state: SimState, entity: Pick<Entity, "class" | "kind" | "x" | "y">, baseSight: number): number {
  if (
    (state.biome !== "ash plains" && state.biome !== "crystal flats") ||
    entity.class !== "unit" ||
    isAirUnit(entity.kind as UnitKind) ||
    !entityInActiveRegion(state, entity, entity.x, entity.y)
  ) return baseSight;
  if (state.biome === "ash plains") return Math.max(1, baseSight - 1);
  if (state.biome === "crystal flats") return baseSight + 1;
  return baseSight;
}

export function incomingDamageMultiplier(state: SimState, target: Entity): number {
  if (
    (state.biome !== "rust canyons" && state.biome !== "jungle wreckage") ||
    target.class !== "unit" ||
    isAirUnit(target.kind as UnitKind) ||
    !entityInActiveRegion(state, target, target.x, target.y)
  ) return 1;
  if (state.biome === "rust canyons") return 0.85;
  if (state.biome === "jungle wreckage" && target.kind === "infantry") return 0.85;
  return 1;
}

export function directFireRangeBonusAt(state: SimState, attacker: Entity): number {
  if (attacker.class === "unit" && isAirUnit(attacker.kind as UnitKind)) return 0;
  return state.biome === "glass desert" && entityInActiveRegion(state, attacker, attacker.x, attacker.y) ? 0.5 : 0;
}

export function downhillDamageMultiplier(state: SimState, attacker: Entity): number {
  if (attacker.class === "unit" && isAirUnit(attacker.kind as UnitKind)) return 1.15;
  return state.biome === "volcanic shelf" && entityInActiveRegion(state, attacker, attacker.x, attacker.y) ? 1.25 : 1.15;
}

export function vehicleMovementCostsFor(state: SimState): Float32Array {
  const rules = rulesFor(state);
  if (state.biome === "salt marshes" || state.biome === "tundra grid") {
    for (let index = 0; index < rules.vehicleMovementCosts.length; index++) {
      if (rules.samples[index]) continue;
      terrainRuleAt(state, index % state.width, Math.floor(index / state.width));
    }
  }
  return rules.vehicleMovementCosts;
}
