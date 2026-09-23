import { footprintOf } from "../../catalog";
import { isBuildingEntity, type Entity, type SimState, type Vec2 } from "../../types";
import { inBounds, makeUnitOccupancy, staticNavigationFor } from "../world";
import { inBoundsNavigation, navigationStepCost, PATH_DIRS, PATH_MAX_NODES } from "./grid";
import { MinHeap } from "./heap";
import { navigationMobilityFor, vehicleMovementCostsFor, type NavigationMobility } from "../terrainRules";

export type PathSearchStatus = "complete" | "partial" | "unreachable";

export type PathSearchResult = {
  path: Vec2[];
  status: PathSearchStatus;
};

export type FindPathOptions = {
  maxNodes?: number;
  avoidUnits?: boolean;
  ignoreId?: number;
  occupancy?: Uint8Array;
  mobility?: NavigationMobility;
};

type SearchBuffers = {
  stamps: Uint32Array;
  gScore: Float64Array;
  parent: Int32Array;
  generation: number;
  open: MinHeap;
};

type StaticPathCache = {
  revision: number;
  paths: Map<string, PathSearchResult>;
};

const searchBuffers = new WeakMap<SimState, SearchBuffers>();
const staticPathCache = new WeakMap<SimState, StaticPathCache>();
const sharedStaticPaths = new Map<string, PathSearchResult>();
const SHARED_STATIC_PATH_LIMIT = 4096;

export function routePendingFor(status: PathSearchStatus): boolean | undefined {
  if (status === "partial") return true;
  if (status === "unreachable") return false;
  return undefined;
}

function ignoreIdOf(from: Vec2, opts?: FindPathOptions): number | undefined {
  if (opts?.ignoreId !== undefined) return opts.ignoreId;
  const maybe = from as Vec2 & Partial<Entity>;
  return typeof maybe.id === "number" ? maybe.id : undefined;
}

function buildingApproachCells(
  navigation: ReturnType<typeof staticNavigationFor>,
  x: number,
  y: number,
  footprint: { w: number; h: number },
): Vec2[] {
  const cells: Vec2[] = [];
  for (let cy = y - 1; cy <= y + footprint.h; cy += 1) {
    for (let cx = x - 1; cx <= x + footprint.w; cx += 1) {
      const inside = cx >= x && cx < x + footprint.w && cy >= y && cy < y + footprint.h;
      if (inside || !inBoundsNavigation(navigation, cx, cy)) continue;
      if (navigation.walkable[cy * navigation.width + cx] !== 1) continue;
      cells.push({ x: cx, y: cy });
    }
  }
  return cells;
}

function occupancyAt(occupancy: Uint8Array, w: number, x: number, y: number): boolean {
  return occupancy[y * w + x] === 1;
}

function heuristic(x: number, y: number, gx: number, gy: number): number {
  const dx = Math.abs(x - gx);
  const dy = Math.abs(y - gy);
  return dx + dy + (1.414 - 2) * Math.min(dx, dy);
}

function buffersFor(state: SimState, size: number): SearchBuffers {
  const existing = searchBuffers.get(state);
  if (existing && existing.stamps.length === size) return existing;
  const created: SearchBuffers = {
    stamps: new Uint32Array(size),
    gScore: new Float64Array(size),
    parent: new Int32Array(size),
    generation: 0,
    open: new MinHeap(),
  };
  searchBuffers.set(state, created);
  return created;
}

function nextGeneration(buffers: SearchBuffers): number {
  buffers.generation += 1;
  if (buffers.generation === 0xffffffff) {
    buffers.stamps.fill(0);
    buffers.generation = 1;
  }
  return buffers.generation;
}

function reconstruct(parent: Int32Array, endKey: number, startKey: number, w: number): Vec2[] {
  const path: Vec2[] = [];
  let cur = endKey;
  while (cur !== startKey && cur >= 0) {
    const x = cur % w;
    const y = Math.floor(cur / w);
    path.push({ x, y });
    cur = parent[cur] ?? -1;
  }
  path.reverse();
  return path;
}

function cacheStaticResult(
  state: SimState,
  revision: number,
  key: string | undefined,
  result: PathSearchResult,
): PathSearchResult {
  if (!key) return result;
  const navigation = staticNavigationFor(state);
  const sharedKey = pathCacheKey(navigation, key);
  if (sharedStaticPaths.size >= SHARED_STATIC_PATH_LIMIT) {
    const oldestKey = sharedStaticPaths.keys().next().value;
    if (oldestKey) sharedStaticPaths.delete(oldestKey);
  }
  sharedStaticPaths.set(sharedKey, { path: result.path.slice(), status: result.status });
  let cache = staticPathCache.get(state);
  if (!cache || cache.revision !== revision) {
    cache = { revision, paths: new Map() };
    staticPathCache.set(state, cache);
  }
  cache.paths.set(key, { path: result.path.slice(), status: result.status });
  return result;
}

function pathCacheKey(navigation: ReturnType<typeof staticNavigationFor>, key: string): string {
  return key.startsWith("vehicle:")
    ? `${navigation.geometryKey}:${navigation.featureKey}:${key}`
    : `${navigation.geometryKey}:${key}`;
}

export function findPathDetailed(
  state: SimState,
  from: Vec2,
  to: Vec2,
  opts?: FindPathOptions,
): PathSearchResult {
  const sx = Math.round(from.x);
  const sy = Math.round(from.y);
  const gx = Math.round(to.x);
  const gy = Math.round(to.y);
  const w = state.width;
  if (sx === gx && sy === gy) return { path: [], status: "complete" };
  if (!inBounds(state, gx, gy)) return { path: [], status: "unreachable" };

  const ignoreId = ignoreIdOf(from, opts);
  const avoidUnits = opts?.avoidUnits === true;
  const maxNodes = Math.min(opts?.maxNodes ?? PATH_MAX_NODES, PATH_MAX_NODES, w * state.height);
  const navigationRevision = state.navigationRevision ?? 0;
  const target = to as Entity;
  const targetFootprint = isBuildingEntity(target) ? footprintOf(target.kind) : undefined;
  const source = from as Entity;
  const sourceFootprint = isBuildingEntity(source) ? footprintOf(source.kind) : undefined;
  const navigation = staticNavigationFor(state);
  const walkable = navigation.walkable;
  const heights = navigation.heights;
  const mobility = opts?.mobility ?? navigationMobilityFor(source);
  const vehicleMovementCosts = mobility === "vehicle" ? vehicleMovementCostsFor(state) : undefined;
  const cacheKey = !avoidUnits
    ? `${mobility}:${sx},${sy}:${gx},${gy}:${maxNodes}:${sourceFootprint?.w ?? 0},${sourceFootprint?.h ?? 0}:${targetFootprint?.w ?? 0},${targetFootprint?.h ?? 0}`
    : undefined;
  if (cacheKey) {
    const sharedKey = pathCacheKey(navigation, cacheKey);
    const shared = sharedStaticPaths.get(sharedKey);
    if (shared) {
      sharedStaticPaths.delete(sharedKey);
      sharedStaticPaths.set(sharedKey, shared);
      return { path: shared.path.slice(), status: shared.status };
    }
    const cache = staticPathCache.get(state);
    if (cache?.revision === navigationRevision) {
      const cached = cache.paths.get(cacheKey);
      if (cached) return { path: cached.path.slice(), status: cached.status };
    }
  }
  const occupancy = avoidUnits
    ? (opts?.occupancy ?? makeUnitOccupancy(state, ignoreId))
    : undefined;
  const startKey = sy * w + sx;
  const starts = sourceFootprint
    ? buildingApproachCells(navigation, sx, sy, sourceFootprint)
    : [{ x: sx, y: sy }];
  if (starts.length === 0) {
    return cacheStaticResult(state, navigationRevision, cacheKey, { path: [], status: "unreachable" });
  }
  const unitBlocked = (x: number, y: number) => {
    if (!occupancy) return false;
    const index = y * w + x;
    return index !== startKey && occupancyAt(occupancy, w, x, y);
  };
  const goalWalkable = navigation.walkable[gy * w + gx] === 1;
  const goalBlocked = !goalWalkable || unitBlocked(gx, gy);
  const goalMatches = (x: number, y: number) => {
    if (!goalBlocked) return x === gx && y === gy;
    if (targetFootprint) {
      return (
        x >= gx - 1 &&
        x <= gx + targetFootprint.w &&
        y >= gy - 1 &&
        y <= gy + targetFootprint.h &&
        navigation.walkable[y * w + x] === 1 &&
        !unitBlocked(x, y)
      );
    }
    return Math.abs(x - gx) <= 1 && Math.abs(y - gy) <= 1 && navigation.walkable[y * w + x] === 1 && !unitBlocked(x, y);
  };

  const buffers = buffersFor(state, w * state.height);
  const generation = nextGeneration(buffers);
  const { stamps, gScore, parent, open } = buffers;
  open.clear();

  let pushSeq = 0;
  for (const start of starts) {
    const key = start.y * w + start.x;
    gScore[key] = 0;
    stamps[key] = generation;
    parent[key] = -1;
    open.push(start.x, start.y, 0, heuristic(start.x, start.y, gx, gy), pushSeq++);
  }

  let bestKey = -1;
  let bestH = Infinity;
  let nodes = 0;

  while (open.length > 0 && nodes < maxNodes) {
    open.pop();
    const cx = Math.round(open.x);
    const cy = Math.round(open.y);
    const currentKey = cy * w + cx;
    if (open.g > gScore[currentKey]!) continue;
    nodes++;

    const currentH = heuristic(cx, cy, gx, gy);
    if (currentH < bestH && !(cx === sx && cy === sy)) {
      bestH = currentH;
      bestKey = currentKey;
    }

    if (goalMatches(cx, cy)) {
      return cacheStaticResult(state, navigationRevision, cacheKey, {
        path: reconstruct(parent, currentKey, startKey, w),
        status: "complete",
      });
    }

    if (cx < 0 || cy < 0 || cx >= w || cy >= state.height || walkable[currentKey] !== 1) continue;
    const currentHeight = heights[currentKey] ?? 0;
    for (const dir of PATH_DIRS) {
      const nx = cx + dir.x;
      const ny = cy + dir.y;
      if (nx < 0 || ny < 0 || nx >= w || ny >= state.height) continue;
      const neighborKey = ny * w + nx;
      if (walkable[neighborKey] !== 1) continue;
      if (Math.abs((heights[neighborKey] ?? 0) - currentHeight) > 1) continue;
      if (dir.x !== 0 && dir.y !== 0) {
        const horizontalKey = cy * w + nx;
        const verticalKey = ny * w + cx;
        if (walkable[horizontalKey] !== 1 || Math.abs((heights[horizontalKey] ?? 0) - currentHeight) > 1) continue;
        if (walkable[verticalKey] !== 1 || Math.abs((heights[verticalKey] ?? 0) - currentHeight) > 1) continue;
      }
      if (unitBlocked(nx, ny)) continue;

      const movementCost = mobility === "vehicle" ? vehicleMovementCosts?.[neighborKey] ?? 1 : 1;
      const tentG = gScore[currentKey]! + navigationStepCost(cx, cy, nx, ny, movementCost);
      if (stamps[neighborKey] !== generation || tentG < gScore[neighborKey]!) {
        parent[neighborKey] = currentKey;
        gScore[neighborKey] = tentG;
        stamps[neighborKey] = generation;
        open.push(nx, ny, tentG, tentG + heuristic(nx, ny, gx, gy) * (mobility === "vehicle" ? 0.85 : 1), pushSeq++);
      }
    }
  }

  const capped = nodes >= maxNodes && open.length > 0;
  if (capped && bestKey < 0) {
    return cacheStaticResult(state, navigationRevision, cacheKey, { path: [], status: "partial" });
  }
  if (bestKey >= 0) {
    return cacheStaticResult(state, navigationRevision, cacheKey, {
      path: reconstruct(parent, bestKey, startKey, w),
      status: capped ? "partial" : "unreachable",
    });
  }

  return cacheStaticResult(state, navigationRevision, cacheKey, { path: [], status: "unreachable" });
}

export function findPath(
  state: SimState,
  from: Vec2,
  to: Vec2,
  opts?: FindPathOptions,
): Vec2[] {
  return findPathDetailed(state, from, to, opts).path;
}

export function stepAlongPath(
  e: { x: number; y: number; path: Vec2[] },
  speed: number,
  canEnter?: (x: number, y: number) => boolean,
): void {
  if (!e.path.length) return;
  const target = e.path[0]!;
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d <= speed || d < 0.05) {
    if (canEnter && !canEnter(target.x, target.y)) return;
    e.x = target.x;
    e.y = target.y;
    e.path.shift();
    return;
  }
  e.x += (dx / d) * speed;
  e.y += (dy / d) * speed;
}
