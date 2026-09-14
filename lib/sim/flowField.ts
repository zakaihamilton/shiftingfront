import type { SimState, Vec2 } from "../types";
import { canClimb, inBounds, staticNavigationFor } from "./world";
import { PATH_DIRS, diagonalCornerBlocked, reversesPreviousStep } from "./pathfinding";

const UNREACHABLE = -1;
const UNREACHABLE_SORT = 1_000_000_000;

export type FlowStepOptions = {
  occupancy?: Uint8Array;
  reserved?: Map<number, number>;
  ignoreId?: number;
  state?: SimState;
  /** Prevent a crowded route from immediately stepping back into the cell it left. */
  previousCell?: number;
};

/**
 * A reverse-traversed distance field. Every cell points toward a lower
 * distance, so a whole group can share one terrain search.
 */
export type FlowField = {
  goal: Vec2;
  revision: number;
  width: number;
  height: number;
  distance: Int32Array;
};

const fieldsByState = new WeakMap<SimState, Map<string, FlowField>>();
const sharedFields = new Map<string, FlowField>();
const SHARED_FLOW_FIELD_LIMIT = 512;

export function flowFieldFor(state: SimState, requestedGoal: Vec2): FlowField {
  const revision = state.navigationRevision ?? 0;
  const goal = { x: Math.round(requestedGoal.x), y: Math.round(requestedGoal.y) };
  const navigation = staticNavigationFor(state);
  const key = `${navigation.geometryKey}:${goal.x}:${goal.y}`;
  let fields = fieldsByState.get(state);
  if (!fields) {
    fields = new Map();
    fieldsByState.set(state, fields);
  }
  const cached = fields.get(key);
  if (cached) return cached;

  const shared = sharedFields.get(key);
  if (shared) {
    fields.set(key, shared);
    return shared;
  }
  const field = buildFlowField(state, goal, revision);
  fields.set(key, field);
  sharedFields.set(key, field);
  while (sharedFields.size > SHARED_FLOW_FIELD_LIMIT) {
    const first = sharedFields.keys().next().value as string | undefined;
    if (first === undefined) break;
    sharedFields.delete(first);
  }
  return field;
}

export function flowFieldCacheSize(state: SimState): number {
  return fieldsByState.get(state)?.size ?? 0;
}

export function flowDistanceAt(field: FlowField, x: number, y: number): number {
  const cx = Math.round(x);
  const cy = Math.round(y);
  if (cx < 0 || cy < 0 || cx >= field.width || cy >= field.height) return UNREACHABLE_SORT;
  const distance = field.distance[cy * field.width + cx] ?? UNREACHABLE;
  return distance < 0 ? UNREACHABLE_SORT : distance;
}

export function flowCellTaken(
  occupancy: Uint8Array,
  reserved: Map<number, number> | undefined,
  width: number,
  x: number,
  y: number,
  ignoreId?: number,
): boolean {
  const key = y * width + x;
  if (occupancy[key]) return true;
  if (!reserved) return false;
  const claim = reserved.get(key);
  return claim !== undefined && claim !== ignoreId;
}

export function flowStep(field: FlowField, x: number, y: number, opts?: FlowStepOptions): Vec2 | undefined {
  if (opts?.occupancy) return occupancyAwareFlowStep(field, x, y, opts);
  return greedyFlowStep(field, x, y);
}

function greedyFlowStep(field: FlowField, x: number, y: number): Vec2 | undefined {
  const cx = Math.round(x);
  const cy = Math.round(y);
  if (cx < 0 || cy < 0 || cx >= field.width || cy >= field.height) return undefined;
  const currentDistance = field.distance[cy * field.width + cx] ?? UNREACHABLE;
  if (currentDistance <= 0) return undefined;

  let best: Vec2 | undefined;
  let bestDistance = currentDistance;
  for (const direction of PATH_DIRS) {
    const nx = cx + direction.x;
    const ny = cy + direction.y;
    if (nx < 0 || ny < 0 || nx >= field.width || ny >= field.height) continue;
    const distance = field.distance[ny * field.width + nx] ?? UNREACHABLE;
    if (distance >= 0 && distance < bestDistance) {
      bestDistance = distance;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

function occupancyAwareFlowStep(field: FlowField, x: number, y: number, opts: FlowStepOptions): Vec2 | undefined {
  const cx = Math.round(x);
  const cy = Math.round(y);
  if (cx < 0 || cy < 0 || cx >= field.width || cy >= field.height) return undefined;
  const currentDistance = field.distance[cy * field.width + cx] ?? UNREACHABLE;
  if (currentDistance <= 0) return undefined;

  const occupancy = opts.occupancy!;
  const reserved = opts.reserved;
  const ignoreId = opts.ignoreId;
  const state = opts.state;
  let best: Vec2 | undefined;
  let bestTier = 99;
  let bestDistance = currentDistance;

  for (const direction of PATH_DIRS) {
    const nx = cx + direction.x;
    const ny = cy + direction.y;
    if (nx < 0 || ny < 0 || nx >= field.width || ny >= field.height) continue;
    if (reversesPreviousStep(field.width, cx, cy, nx, ny, opts.previousCell)) continue;
    const distance = field.distance[ny * field.width + nx] ?? UNREACHABLE;
    if (distance < 0) continue;
    if (state && !flowTerrainStepOk(state, cx, cy, nx, ny)) continue;

    const free = !flowCellTaken(occupancy, reserved, field.width, nx, ny, ignoreId);
    let tier: number;
    if (free && distance < currentDistance) tier = 0;
    else if (free) tier = 1;
    else if (distance < currentDistance) tier = 2;
    else continue;

    if (tier < bestTier || (tier === bestTier && distance < bestDistance)) {
      bestTier = tier;
      bestDistance = distance;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

function flowTerrainStepOk(state: SimState, x0: number, y0: number, x1: number, y1: number): boolean {
  if (!inBounds(state, x1, y1)) return false;
  if (staticNavigationFor(state).walkable[y1 * state.width + x1] !== 1) return false;
  if (!canClimb(state, x0, y0, x1, y1)) return false;
  if (diagonalCornerBlocked(state, x0, y0, x1, y1)) return false;
  return true;
}

function buildFlowField(state: SimState, requestedGoal: Vec2, revision: number): FlowField {
  const width = state.width;
  const height = state.height;
  const distance = new Int32Array(width * height);
  distance.fill(UNREACHABLE);
  const navigation = staticNavigationFor(state);
  const walkable = navigation.walkable;
  const heights = navigation.heights;
  const passable = (x: number, y: number) => inBounds(state, x, y) && navigation.walkable[y * width + x] === 1;
  const origin = flowOrigin(state, requestedGoal, passable);
  if (!origin) return { goal: requestedGoal, revision, width, height, distance };

  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const originKey = origin.y * width + origin.x;
  distance[originKey] = 0;
  queue[tail++] = originKey;

  while (head < tail) {
    const currentKey = queue[head++]!;
    const currentX = currentKey % width;
    const currentY = Math.floor(currentKey / width);
    const currentHeight = heights[currentKey]!;
    const nextDistance = (distance[currentKey] ?? 0) + 1;
    for (const direction of PATH_DIRS) {
      const nx = currentX + direction.x;
      const ny = currentY + direction.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nextKey = ny * width + nx;
      if (walkable[nextKey] !== 1) continue;
      if (Math.abs(heights[nextKey]! - currentHeight) > 1) continue;
      if (direction.x !== 0 && direction.y !== 0) {
        const sideXKey = currentY * width + (currentX + direction.x);
        const sideYKey = (currentY + direction.y) * width + currentX;
        if (walkable[sideXKey] !== 1 || Math.abs(heights[sideXKey]! - currentHeight) > 1) continue;
        if (walkable[sideYKey] !== 1 || Math.abs(heights[sideYKey]! - currentHeight) > 1) continue;
      }
      if ((distance[nextKey] ?? UNREACHABLE) !== UNREACHABLE) continue;
      distance[nextKey] = nextDistance;
      queue[tail++] = nextKey;
    }
  }

  return { goal: origin, revision, width, height, distance };
}

function flowOrigin(state: SimState, requestedGoal: Vec2, passable: (x: number, y: number) => boolean): Vec2 | undefined {
  const x = Math.round(requestedGoal.x);
  const y = Math.round(requestedGoal.y);
  if (!inBounds(state, x, y)) return undefined;
  if (passable(x, y)) return { x, y };
  // Match A*'s blocked-goal contract: a neighboring walkable tile is a valid
  // destination, with stable direction ordering for deterministic replays.
  for (const direction of PATH_DIRS) {
    const nx = x + direction.x;
    const ny = y + direction.y;
    if (passable(nx, ny)) return { x: nx, y: ny };
  }
  return undefined;
}
