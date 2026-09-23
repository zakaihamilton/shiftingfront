import type { SimState, Vec2 } from "../types";
import { inBounds, staticNavigationFor, type StaticNavigation } from "./world";
import {
  navigationEdgeReserved,
  navigationStepAllowed,
  navigationStepCost,
  PATH_DIRS,
  reversesPreviousStep,
} from "./navigation/grid";
import { MinHeap } from "./navigation/heap";
import { vehicleMovementCostsFor, type NavigationMobility } from "./terrainRules";

const UNREACHABLE = -1;
const UNREACHABLE_SORT = 1_000_000_000;

export type FlowStepOptions = {
  occupancy?: Uint8Array;
  reserved?: Map<number, number>;
  /** Cells whose occupants have an accepted forward move this tick. */
  vacating?: Map<number, number>;
  ignoreId?: number;
  state?: SimState;
  /** Prevent a crowded route from immediately stepping back into the cell it left. */
  previousCell?: number;
  /** Reservations for directed movement edges in the current tick. */
  edgeReservations?: Map<number, number>;
  /** Permit a free non-improving step only after a unit is genuinely blocked. */
  allowNonImproving?: boolean;
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
  distance: Float64Array;
};

const fieldsByState = new WeakMap<SimState, Map<string, FlowField>>();
const componentIdsByNavigation = new WeakMap<StaticNavigation, Int32Array>();
const sharedFields = new Map<string, FlowField>();
const SHARED_FLOW_FIELD_LIMIT = 512;
const STATE_FLOW_FIELD_LIMIT = 128;

function fieldsFor(state: SimState): Map<string, FlowField> {
  let fields = fieldsByState.get(state);
  if (!fields) {
    fields = new Map();
    fieldsByState.set(state, fields);
  }
  return fields;
}

function cachedField(fields: Map<string, FlowField>, key: string): FlowField | undefined {
  const field = fields.get(key);
  if (!field) return undefined;
  // Keep frequently reused destinations resident without affecting routing
  // order or any simulation state.
  fields.delete(key);
  fields.set(key, field);
  return field;
}

function rememberField(fields: Map<string, FlowField>, key: string, field: FlowField): void {
  fields.delete(key);
  fields.set(key, field);
  while (fields.size > STATE_FLOW_FIELD_LIMIT) {
    const first = fields.keys().next().value as string | undefined;
    if (first === undefined) break;
    fields.delete(first);
  }
}

export function flowFieldFor(state: SimState, requestedGoal: Vec2, mobility: NavigationMobility = "foot"): FlowField {
  const revision = state.navigationRevision ?? 0;
  const goal = { x: Math.round(requestedGoal.x), y: Math.round(requestedGoal.y) };
  const navigation = staticNavigationFor(state);
  const key = `${navigation.geometryKey}:${mobility === "vehicle" ? `${navigation.featureKey}:vehicle` : "foot"}:${goal.x}:${goal.y}`;
  const fields = fieldsFor(state);
  const cached = cachedField(fields, key);
  if (cached) return cached;

  const shared = sharedFields.get(key);
  if (shared) {
    rememberField(fields, key, shared);
    return shared;
  }
  const field = buildFlowField(state, goal, revision, mobility);
  rememberField(fields, key, field);
  sharedFields.set(key, field);
  while (sharedFields.size > SHARED_FLOW_FIELD_LIMIT) {
    const first = sharedFields.keys().next().value as string | undefined;
    if (first === undefined) break;
    sharedFields.delete(first);
  }
  return field;
}

/**
 * Build one reverse distance field for a set of valid landing cells. A group
 * can therefore fan out across its arrival area instead of funneling through
 * the single cell that was clicked.
 */
export function flowFieldForGoals(state: SimState, requestedGoals: readonly Vec2[], mobility: NavigationMobility = "foot"): FlowField {
  const revision = state.navigationRevision ?? 0;
  const goals = requestedGoals
    .map((goal) => ({ x: Math.round(goal.x), y: Math.round(goal.y) }))
    .filter((goal) => inBounds(state, goal.x, goal.y))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .filter((goal, index, all) => index === 0 || goal.x !== all[index - 1]!.x || goal.y !== all[index - 1]!.y);
  const goal = goals[0] ?? { x: 0, y: 0 };
  const navigation = staticNavigationFor(state);
  const key = `${navigation.geometryKey}:${mobility === "vehicle" ? `${navigation.featureKey}:vehicle` : "foot"}:${goals.length === 1
    ? `${goal.x}:${goal.y}`
    : `goals:${goals.map((candidate) => `${candidate.x},${candidate.y}`).sort().join(";")}`}`;
  const fields = fieldsFor(state);
  const cached = cachedField(fields, key);
  if (cached) return cached;

  const shared = sharedFields.get(key);
  if (shared) {
    rememberField(fields, key, shared);
    return shared;
  }
  const field = buildMultiGoalFlowField(state, goals.length > 0 ? goals : [goal], revision, mobility);
  rememberField(fields, key, field);
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

/**
 * Return the static terrain component for every cell. Components are cached
 * with the navigation geometry, so a group order pays for one connectivity
 * search instead of one full-map search per selected unit.
 */
export function terrainComponentIdsFor(state: SimState): Int32Array {
  const navigation = staticNavigationFor(state);
  const cached = componentIdsByNavigation.get(navigation);
  if (cached) return cached;

  const components = new Int32Array(state.width * state.height);
  components.fill(UNREACHABLE);
  const queue = new Int32Array(components.length);
  let component = 0;
  for (let startKey = 0; startKey < components.length; startKey++) {
    if (navigation.walkable[startKey] !== 1 || components[startKey] !== UNREACHABLE) continue;
    let head = 0;
    let tail = 0;
    components[startKey] = component;
    queue[tail++] = startKey;
    while (head < tail) {
      const currentKey = queue[head++]!;
      const currentX = currentKey % state.width;
      const currentY = Math.floor(currentKey / state.width);
      for (const direction of PATH_DIRS) {
        const nextX = currentX + direction.x;
        const nextY = currentY + direction.y;
        if (!navigationStepAllowed(navigation, currentX, currentY, nextX, nextY)) continue;
        const nextKey = nextY * state.width + nextX;
        if (components[nextKey] !== UNREACHABLE) continue;
        components[nextKey] = component;
        queue[tail++] = nextKey;
      }
    }
    component += 1;
  }
  componentIdsByNavigation.set(navigation, components);
  return components;
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
  vacating?: Map<number, number>,
): boolean {
  const key = y * width + x;
  if (occupancy[key] && !vacating?.has(key)) return true;
  if (!reserved) return false;
  const claim = reserved.get(key);
  return claim !== undefined && claim !== ignoreId;
}

/** Static terrain reachability from one or more currently occupied unit cells. */
export function terrainReachabilityForSources(state: SimState, sources: readonly Vec2[]): Int32Array {
  const navigation = staticNavigationFor(state);
  const distances = new Int32Array(state.width * state.height);
  distances.fill(UNREACHABLE);
  const queue = new Int32Array(distances.length);
  let head = 0;
  let tail = 0;
  for (const source of sources) {
    const x = Math.round(source.x);
    const y = Math.round(source.y);
    if (!inBounds(state, x, y)) continue;
    const key = y * state.width + x;
    if (distances[key] !== UNREACHABLE) continue;
    if (navigation.walkable[key] !== 1) continue;
    distances[key] = 0;
    queue[tail++] = key;
  }
  while (head < tail) {
    const currentKey = queue[head++]!;
    const currentX = currentKey % state.width;
    const currentY = Math.floor(currentKey / state.width);
    const nextDistance = distances[currentKey]! + 1;
    for (const direction of PATH_DIRS) {
      const nextX = currentX + direction.x;
      const nextY = currentY + direction.y;
      if (!navigationStepAllowed(navigation, currentX, currentY, nextX, nextY)) continue;
      const nextKey = nextY * state.width + nextX;
      if (distances[nextKey] !== UNREACHABLE) continue;
      distances[nextKey] = nextDistance;
      queue[tail++] = nextKey;
    }
  }
  return distances;
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
  const edgeReservations = opts.edgeReservations;
  const allowNonImproving = opts.allowNonImproving ?? true;
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
    if (state && navigationEdgeReserved(edgeReservations, state.width, state.height, cx, cy, nx, ny, ignoreId)) continue;
    if (distance >= 0 && direction.x !== 0 && direction.y !== 0 &&
      (flowCellTaken(occupancy, reserved, field.width, cx + direction.x, cy, ignoreId, opts.vacating) ||
        flowCellTaken(occupancy, reserved, field.width, cx, cy + direction.y, ignoreId, opts.vacating))) continue;
    const free = !flowCellTaken(occupancy, reserved, field.width, nx, ny, ignoreId, opts.vacating);
    let tier: number;
    if (free && distance < currentDistance) tier = 0;
    else if (free && allowNonImproving) tier = 1;
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
  return navigationStepAllowed(staticNavigationFor(state), x0, y0, x1, y1);
}

function buildFlowField(state: SimState, requestedGoal: Vec2, revision: number, mobility: NavigationMobility): FlowField {
  const width = state.width;
  const height = state.height;
  const navigation = staticNavigationFor(state);
  const passable = (x: number, y: number) => inBounds(state, x, y) && navigation.walkable[y * width + x] === 1;
  const origin = flowOrigin(state, requestedGoal, passable);
  if (!origin) {
    const distance = new Float64Array(width * height);
    distance.fill(UNREACHABLE);
    return { goal: requestedGoal, revision, width, height, distance };
  }
  return buildWeightedFlowField(state, [origin], revision, mobility);
}

function buildMultiGoalFlowField(state: SimState, requestedGoals: readonly Vec2[], revision: number, mobility: NavigationMobility): FlowField {
  const width = state.width;
  const height = state.height;
  const navigation = staticNavigationFor(state);
  const passable = (x: number, y: number) => inBounds(state, x, y) && navigation.walkable[y * width + x] === 1;
  const origins = uniqueFlowOrigins(state, requestedGoals, passable);
  if (origins.length === 0) {
    const distance = new Float64Array(width * height);
    distance.fill(UNREACHABLE);
    return { goal: requestedGoals[0] ?? { x: 0, y: 0 }, revision, width, height, distance };
  }
  return buildWeightedFlowField(state, origins, revision, mobility);
}

function buildWeightedFlowField(state: SimState, origins: readonly Vec2[], revision: number, mobility: NavigationMobility): FlowField {
  const width = state.width;
  const height = state.height;
  const distance = new Float64Array(width * height);
  distance.fill(UNREACHABLE);
  const navigation = staticNavigationFor(state);
  const vehicleMovementCosts = mobility === "vehicle" ? vehicleMovementCostsFor(state) : undefined;
  const open = new MinHeap();
  let sequence = 0;
  for (const origin of origins) {
    const key = origin.y * width + origin.x;
    if (distance[key] === 0) continue;
    distance[key] = 0;
    open.push(origin.x, origin.y, 0, 0, sequence++);
  }

  while (open.length > 0) {
    open.pop();
    const currentX = Math.round(open.x);
    const currentY = Math.round(open.y);
    const currentKey = currentY * width + currentX;
    if (open.g > distance[currentKey]! + 1e-9) continue;
    for (const direction of PATH_DIRS) {
      const nextX = currentX + direction.x;
      const nextY = currentY + direction.y;
      if (!navigationStepAllowed(navigation, currentX, currentY, nextX, nextY)) continue;
      const nextKey = nextY * width + nextX;
      // Flow search runs from the goal backward, so the forward-route
      // destination for this reversed edge is the current cell.
      const movementCost = mobility === "vehicle" ? vehicleMovementCosts?.[currentKey] ?? 1 : 1;
      const nextDistance = open.g + navigationStepCost(currentX, currentY, nextX, nextY, movementCost);
      if (distance[nextKey] >= 0 && nextDistance >= distance[nextKey]! - 1e-9) continue;
      distance[nextKey] = nextDistance;
      open.push(nextX, nextY, nextDistance, nextDistance, sequence++);
    }
  }

  return { goal: origins[0]!, revision, width, height, distance };
}

function uniqueFlowOrigins(
  state: SimState,
  requestedGoals: readonly Vec2[],
  passable: (x: number, y: number) => boolean,
): Vec2[] {
  const origins: Vec2[] = [];
  const seen = new Set<number>();
  for (const requestedGoal of requestedGoals) {
    const origin = flowOrigin(state, requestedGoal, passable);
    if (!origin) continue;
    const key = origin.y * state.width + origin.x;
    if (seen.has(key)) continue;
    seen.add(key);
    origins.push(origin);
  }
  return origins;
}

function flowOrigin(state: SimState, requestedGoal: Vec2, passable: (x: number, y: number) => boolean): Vec2 | undefined {
  if (state.width <= 0 || state.height <= 0) return undefined;
  const x = Math.max(0, Math.min(state.width - 1, Math.round(requestedGoal.x)));
  const y = Math.max(0, Math.min(state.height - 1, Math.round(requestedGoal.y)));
  if (passable(x, y)) return { x, y };

  // A group target can be inside a solid blocker, water pocket, or just beyond
  // the map edge. Search outward for the nearest static landing cell instead
  // of returning an empty field that would make every fallback slot invalid.
  const seen = new Uint8Array(state.width * state.height);
  const queue = new Int32Array(state.width * state.height);
  let head = 0;
  let tail = 0;
  const startKey = y * state.width + x;
  seen[startKey] = 1;
  queue[tail++] = startKey;
  while (head < tail) {
    const currentKey = queue[head++]!;
    const currentX = currentKey % state.width;
    const currentY = Math.floor(currentKey / state.width);
    for (const direction of PATH_DIRS) {
      const nx = currentX + direction.x;
      const ny = currentY + direction.y;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      const nextKey = ny * state.width + nx;
      if (seen[nextKey]) continue;
      seen[nextKey] = 1;
      if (passable(nx, ny)) return { x: nx, y: ny };
      queue[tail++] = nextKey;
    }
  }
  return undefined;
}
