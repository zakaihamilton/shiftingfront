import { BUILDING_STATS, footprintOf, isAirUnit } from "../../catalog";
import { isBuildingEntity, type Entity, type Owner, type SimState, type TileKind, type Vec2 } from "../../types";

type LivingCache = { tick: number; entities: SimState["entities"]; value: Entity[] };
const livingCache = new WeakMap<SimState, LivingCache>();
type UnitAtCache = { tick: number; entities: SimState["entities"]; value: Array<Entity | undefined> };
const unitAtCache = new WeakMap<SimState, UnitAtCache>();
type UnitOccupancyCache = { tick: number; entities: SimState["entities"]; value: Uint8Array };
const unitOccupancyCache = new WeakMap<SimState, UnitOccupancyCache>();
type PowerTotals = { produced: number; used: number; surplus: number };
type PowerCache = { tick: number; entities: SimState["entities"]; value: PowerTotals[] };
const powerCache = new WeakMap<SimState, PowerCache>();
type EntityIndexCache = { entities: SimState["entities"]; value: Map<number, Entity> };
const entityIndexCache = new WeakMap<SimState, EntityIndexCache>();

function entityIndexFor(state: SimState): Map<number, Entity> {
  const entities = state.entities;
  const cached = entityIndexCache.get(state);
  if (cached?.entities === entities) return cached.value;

  const index = new Map<number, Entity>();
  for (const entity of entities) {
    // Preserve the first match if an invalid state contains duplicate IDs.
    if (!index.has(entity.id)) index.set(entity.id, entity);
  }
  entityIndexCache.set(state, { entities, value: index });
  return index;
}

export function at(state: SimState, x: number, y: number): number {
  return y * state.width + x;
}

export function inBounds(state: SimState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

export function tileAt(state: SimState, x: number, y: number): TileKind {
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (!inBounds(state, rx, ry)) return 1;
  return state.tiles[at(state, rx, ry)] as TileKind;
}

export function heightAt(state: SimState, x: number, y: number): number {
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (!inBounds(state, rx, ry)) return 0;
  return state.heights[at(state, rx, ry)] ?? 1;
}

function heightAtClamped(state: SimState, x: number, y: number): number {
  const cx = Math.max(0, Math.min(state.width - 1, Math.floor(x)));
  const cy = Math.max(0, Math.min(state.height - 1, Math.floor(y)));
  return state.heights[cy * state.width + cx] ?? 1;
}

export function groundHeight(state: SimState, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const h00 = heightAtClamped(state, x0, y0);
  const h10 = heightAtClamped(state, x0 + 1, y0);
  const h01 = heightAtClamped(state, x0, y0 + 1);
  const h11 = heightAtClamped(state, x0 + 1, y0 + 1);
  return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
}

export function occupies(e: Entity, x: number, y: number): boolean {
  if (e.hp <= 0) return false;
  if (!isBuildingEntity(e)) {
    return Math.round(e.x) === x && Math.round(e.y) === y;
  }
  const fp = footprintOf(e.kind);
  return x >= e.x && x < e.x + fp.w && y >= e.y && y < e.y + fp.h;
}

export function unitAt(state: SimState, x: number, y: number): Entity | undefined {
  if (!inBounds(state, x, y)) return undefined;
  let cached = unitAtCache.get(state);
  if (!cached || cached.tick !== state.tick || cached.entities !== state.entities) {
    const value = cached?.value.length === state.width * state.height
      ? cached.value
      : new Array<Entity | undefined>(state.width * state.height);
    value.fill(undefined);
    for (const entity of state.entities) {
      if (entity.hp <= 0 || entity.class !== "unit" || isAirUnit(entity.kind)) continue;
      const ex = Math.round(entity.x);
      const ey = Math.round(entity.y);
      if (!inBounds(state, ex, ey)) continue;
      const key = ey * state.width + ex;
      if (!value[key]) value[key] = entity;
    }
    cached = { tick: state.tick, entities: state.entities, value };
    unitAtCache.set(state, cached);
  }
  return cached.value[y * state.width + x];
}

export function unitOccupied(state: SimState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  return unitOccupancyFor(state)[y * state.width + x] === 1;
}

export function unitOccupancyFor(state: SimState): Uint8Array {
  let cached = unitOccupancyCache.get(state);
  if (!cached || cached.tick !== state.tick || cached.entities !== state.entities) {
    const value = cached?.value.length === state.width * state.height ? cached.value : new Uint8Array(state.width * state.height);
    value.fill(0);
    for (const entity of state.entities) {
      if (entity.hp <= 0 || entity.class !== "unit" || isAirUnit(entity.kind)) continue;
      const ex = Math.round(entity.x);
      const ey = Math.round(entity.y);
      if (inBounds(state, ex, ey)) value[ey * state.width + ex] = 1;
    }
    cached = { tick: state.tick, entities: state.entities, value };
    unitOccupancyCache.set(state, cached);
  }
  return cached.value;
}

export function buildingAt(state: SimState, x: number, y: number): Entity | undefined {
  return state.entities.find((entity) => isBuildingEntity(entity) && occupies(entity, x, y));
}

/** Internal per-tick living view. Callers must not mutate the returned array. */
export function livingView(state: SimState): Entity[] {
  const cached = livingCache.get(state);
  if (cached?.tick === state.tick && cached.entities === state.entities) return cached.value;
  const value = cached?.value ?? [];
  value.length = 0;
  for (const entity of state.entities) {
    if (entity.hp > 0) value.push(entity);
  }
  livingCache.set(state, { tick: state.tick, entities: state.entities, value });
  return value;
}

/** Return a stable snapshot so external callers cannot mutate the query cache. */
export function living(state: SimState): Entity[] {
  return livingView(state).slice();
}

/**
 * Invalidate all entity-derived query caches after a structural or lethal
 * entity mutation. Callers that mutate positions only can use
 * invalidateUnitAtCache instead.
 */
export function invalidateEntityCaches(state: SimState): void {
  livingCache.delete(state);
  entityIndexCache.delete(state);
  powerCache.delete(state);
  invalidateUnitAtCache(state);
}

/** Backward-compatible name for structural entity mutations. */
export function invalidateLivingCache(state: SimState): void {
  invalidateEntityCaches(state);
}

export function invalidateUnitAtCache(state: SimState): void {
  const unitAt = unitAtCache.get(state);
  if (unitAt) unitAt.tick = -1;
  const occupancy = unitOccupancyCache.get(state);
  if (occupancy) occupancy.tick = -1;
}

export function invalidatePowerCache(state: SimState): void {
  powerCache.delete(state);
}

/** Compute both factions' power totals once for the current simulation tick. */
export function powerBreakdownFor(state: SimState, owner: Owner): PowerTotals {
  const cached = powerCache.get(state);
  if (cached?.tick === state.tick && cached.entities === state.entities) return cached.value[owner];

  const value: PowerTotals[] = state.factions.map(() => ({ produced: 0, used: 0, surplus: 0 }));
  for (const e of livingView(state)) {
    if (!isBuildingEntity(e) || e.constructing > 0) continue;
    const totals = value[e.owner];
    const crystalPower = state.biome === "crystal flats" && state.tutorialStage === undefined && e.kind === "power" ? 20 : 0;
    const watt = BUILDING_STATS[e.kind].power + crystalPower;
    if (watt >= 0) totals.produced += watt;
    else totals.used -= watt;
  }
  for (const totals of value) totals.surplus = totals.produced - totals.used;
  if (state.powerReserve && value[0]) {
    value[0].produced += state.powerReserve;
    value[0].surplus += state.powerReserve;
  }
  powerCache.set(state, { tick: state.tick, entities: state.entities, value });
  return value[owner];
}

export function byId(state: SimState, id: number): Entity | undefined {
  const entity = entityIndexFor(state).get(id);
  return entity && entity.hp > 0 ? entity : undefined;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Nearest occupied cell of a building, or the unit's own position. */
export function closestTargetPoint(from: Vec2, target: Entity): Vec2 {
  if (!isBuildingEntity(target)) return { x: target.x, y: target.y };
  const fp = footprintOf(target.kind);
  return {
    x: Math.max(target.x, Math.min(target.x + fp.w - 1, Math.round(from.x))),
    y: Math.max(target.y, Math.min(target.y + fp.h - 1, Math.round(from.y))),
  };
}

export function distToEntity(from: Vec2, e: Entity): number {
  const point = closestTargetPoint(from, e);
  return Math.hypot(from.x - point.x, from.y - point.y);
}
