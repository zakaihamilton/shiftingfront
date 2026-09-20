import { footprintOf, isAirUnit } from "../../catalog";
import { isBuildingEntity, type SimState } from "../../types";
import { TILE_BLOCKED, TILE_RESOURCE, TILE_WATER } from "../../types";
import { heightAt, inBounds, tileAt, unitOccupied } from "./queries";

export type TerrainAccess = {
  traversable: boolean;
  buildable: boolean;
  label: "Open ground" | "Water" | "Ore field" | "Hard blocker" | "Outside map";
};

/**
 * Static terrain and building occupancy for one navigation revision. Unit
 * occupancy stays separate because it changes every tick.
 */
export type StaticNavigation = {
  revision: number;
  width: number;
  height: number;
  tiles: number[];
  heights: number[];
  entities: SimState["entities"];
  traversable: Uint8Array;
  walkable: Uint8Array;
  /** Content key for sharing geometry-only path/flow caches across strategies. */
  geometryKey: string;
};

const navigationCache = new WeakMap<SimState, StaticNavigation>();
const invalidatedBuildingIds = new WeakMap<SimState, Set<number>>();

function geometryKey(width: number, height: number, walkable: Uint8Array, heights: number[]): string {
  let hash = 2166136261;
  for (let index = 0; index < walkable.length; index++) {
    hash = Math.imul(hash ^ walkable[index]!, 16777619);
    hash = Math.imul(hash ^ Math.round(heights[index] ?? 0), 16777619);
  }
  return `${width}x${height}:${hash >>> 0}`;
}

/** Mark a building footprint change before the next navigation query. */
export function invalidateNavigation(state: SimState, buildingId?: number): void {
  state.navigationRevision = (state.navigationRevision ?? 0) + 1;
  if (buildingId === undefined) return;
  const ids = invalidatedBuildingIds.get(state) ?? new Set<number>();
  ids.add(buildingId);
  invalidatedBuildingIds.set(state, ids);
}

/** Apply the revision bump for externally-mutated dead buildings exactly once. */
export function ensureDeadBuildingInvalidation(state: SimState, buildingId: number): void {
  const ids = invalidatedBuildingIds.get(state);
  if (ids?.has(buildingId)) return;
  invalidateNavigation(state, buildingId);
}

export function staticNavigationFor(state: SimState): StaticNavigation {
  const revision = state.navigationRevision ?? 0;
  const cached = navigationCache.get(state);
  if (
    cached &&
    cached.revision === revision &&
    cached.width === state.width &&
    cached.height === state.height &&
    cached.tiles === state.tiles &&
    cached.heights === state.heights &&
    cached.entities === state.entities
  ) {
    return cached;
  }

  const size = state.width * state.height;
  const traversable = new Uint8Array(size);
  const walkable = new Uint8Array(size);
  for (let index = 0; index < size; index++) {
    const tile = state.tiles[index];
    const canTraverse = tile !== TILE_WATER && tile !== TILE_BLOCKED;
    traversable[index] = canTraverse ? 1 : 0;
    walkable[index] = canTraverse ? 1 : 0;
  }

  for (const entity of state.entities) {
    if (entity.hp <= 0 || !isBuildingEntity(entity)) continue;
    const footprint = footprintOf(entity.kind);
    for (let y = entity.y; y < entity.y + footprint.h; y++) {
      for (let x = entity.x; x < entity.x + footprint.w; x++) {
        if (inBounds(state, x, y)) walkable[y * state.width + x] = 0;
      }
    }
  }

  const navigation: StaticNavigation = {
    revision,
    width: state.width,
    height: state.height,
    tiles: state.tiles,
    heights: state.heights,
    entities: state.entities,
    traversable,
    walkable,
    geometryKey: geometryKey(state.width, state.height, walkable, state.heights),
  };
  navigationCache.set(state, navigation);
  return navigation;
}

export function terrainAccess(state: SimState, x: number, y: number): TerrainAccess {
  if (!inBounds(state, x, y)) return { traversable: false, buildable: false, label: "Outside map" };
  const tile = tileAt(state, x, y);
  if (tile === TILE_WATER) return { traversable: false, buildable: false, label: "Water" };
  if (tile === TILE_BLOCKED) return { traversable: false, buildable: false, label: "Hard blocker" };
  if (tile === TILE_RESOURCE) return { traversable: true, buildable: false, label: "Ore field" };
  return { traversable: true, buildable: true, label: "Open ground" };
}

export function isStaticWalkable(state: SimState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  return staticNavigationFor(state).walkable[y * state.width + x] === 1;
}

export function isWalkable(state: SimState, x: number, y: number): boolean {
  if (!inBounds(state, x, y) || staticNavigationFor(state).walkable[y * state.width + x] !== 1) return false;
  if (unitOccupied(state, x, y)) return false;
  return true;
}

export function makeUnitOccupancy(state: SimState, ignoreId?: number): Uint8Array {
  const occupancy = new Uint8Array(state.width * state.height);
  return fillUnitOccupancy(state, occupancy, ignoreId);
}

/** Fill a caller-owned occupancy buffer so movement can reuse it every tick. */
export function fillUnitOccupancy(state: SimState, occupancy: Uint8Array, ignoreId?: number): Uint8Array {
  occupancy.fill(0);
  for (const e of state.entities) {
    if (e.hp <= 0 || e.class !== "unit" || isAirUnit(e.kind) || e.id === ignoreId) continue;
    const x = Math.round(e.x);
    const y = Math.round(e.y);
    if (!inBounds(state, x, y)) continue;
    occupancy[y * state.width + x] = 1;
  }
  return occupancy;
}

export function canClimb(state: SimState, x0: number, y0: number, x1: number, y1: number): boolean {
  return Math.abs(heightAt(state, x1, y1) - heightAt(state, x0, y0)) <= 1;
}

export function canStep(state: SimState, x0: number, y0: number, x1: number, y1: number): boolean {
  return isWalkable(state, x1, y1) && canClimb(state, x0, y0, x1, y1);
}
