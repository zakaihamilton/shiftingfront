import type { Entity, SimState } from "../types";
import { flowCellTaken, flowDistanceAt, flowFieldFor, flowStep, type FlowField } from "./flowField";
import { routePendingFor } from "./pathfinding";
import { tryFindPathDetailed } from "./pathBudget";

const FLOW_PATH_PREFIX_LENGTH = 2;

type RankedFollower = { entity: Entity; field: FlowField; dist: number };
type FlowRoutingBuffers = {
  fields: Map<string, FlowField>;
  followers: Entity[];
  ranked: RankedFollower[];
};

const flowRoutingBuffers = new WeakMap<SimState, FlowRoutingBuffers>();

function buffersFor(state: SimState): FlowRoutingBuffers {
  const cached = flowRoutingBuffers.get(state);
  if (cached) {
    cached.fields.clear();
    cached.followers.length = 0;
    cached.ranked.length = 0;
    return cached;
  }
  const buffers = { fields: new Map<string, FlowField>(), followers: [], ranked: [] };
  flowRoutingBuffers.set(state, buffers);
  return buffers;
}

/** Prepare a short shared-field path prefix for each active group follower. */
export function prepareFlowFieldRoutes(
  state: SimState,
  occupancy: Uint8Array,
  reserved: Map<number, number>,
  previousCells?: Map<number, number>,
  skipIds?: { has(id: number): boolean },
): void {
  const { fields, followers, ranked } = buffersFor(state);
  for (const entity of state.entities) {
    if (entity.hp <= 0 || entity.class !== "unit" || skipIds?.has(entity.id) || !entity.flowGoal || !entity.orderDestination) continue;
    const destination = entity.orderDestination;
    const personalCheb = Math.max(
      Math.abs(Math.round(entity.x) - Math.round(destination.x)),
      Math.abs(Math.round(entity.y) - Math.round(destination.y)),
    );
    const goal = entity.flowGoal;
    const sharedCheb = Math.max(
      Math.abs(Math.round(entity.x) - Math.round(goal.x)),
      Math.abs(Math.round(entity.y) - Math.round(goal.y)),
    );
    // A group shares an approach field, but every unit still owns its
    // personal landing cell. Once either the personal slot or the shared
    // approach area is near, peel off to the unit's individual A* route.
    if (personalCheb <= 2 || sharedCheb <= 2) {
      if (finishFlowFieldRoute(state, entity)) continue;
      entity.routePending = true;
      continue;
    }
    followers.push(entity);
  }

  for (let i = 0; i < followers.length; i++) {
    const entity = followers[i]!;
    const goal = entity.flowGoal!;
    const key = `${state.navigationRevision ?? 0}:${Math.round(goal.x)}:${Math.round(goal.y)}`;
    const field = fields.get(key) ?? flowFieldFor(state, goal);
    fields.set(key, field);
    const entry = ranked[i] ?? { entity, field, dist: 0 };
    entry.entity = entity;
    entry.field = field;
    entry.dist = flowDistanceAt(field, entity.x, entity.y);
    ranked[i] = entry;
  }
  ranked.length = followers.length;
  ranked.sort((a, b) => a.dist - b.dist || a.entity.id - b.entity.id);

  for (const { entity, field } of ranked) {
    assignFlowPrefix(state, occupancy, reserved, previousCells, entity, field);
  }
}

function assignFlowPrefix(
  state: SimState,
  occupancy: Uint8Array,
  reserved: Map<number, number>,
  previousCells: Map<number, number> | undefined,
  entity: Entity,
  field: FlowField,
): void {
  let cursorX = Math.round(entity.x);
  let cursorY = Math.round(entity.y);
  const previousCell = entity.owner === 0 ? previousCells?.get(entity.id) : undefined;
  const existing = entity.path[0];
  const existingIsCurrent = existing && Math.round(existing.x) === cursorX && Math.round(existing.y) === cursorY;
  const existingFree = existing
    ? existingIsCurrent || prefixCellOpen(state, occupancy, reserved, entity.id, existing.x, existing.y)
    : false;

  const prefix: { x: number; y: number }[] = [];
  let priorCell = previousCell;
  for (let i = 0; i < FLOW_PATH_PREFIX_LENGTH; i++) {
    const candidate = i === 0 && existingFree && existing
      ? existing
      : flowStep(field, cursorX, cursorY, {
        occupancy,
        reserved,
        ignoreId: entity.id,
        state,
        previousCell: priorCell,
      });
    if (!candidate || !prefixCellOpen(state, occupancy, reserved, entity.id, candidate.x, candidate.y)) break;
    prefix.push(candidate);
    reserveCell(state, reserved, entity.id, candidate.x, candidate.y);
    priorCell = cursorY * state.width + cursorX;
    cursorX = Math.round(candidate.x);
    cursorY = Math.round(candidate.y);
  }

  if (prefix.length > 0) {
    // Reserve several cells ahead for each follower. Ranked units claim the
    // forward lanes first, so trailing units choose a free lane instead of
    // walking into the unit immediately ahead and waiting for a detour.
    entity.path = prefix;
    entity.routePending = true;
    return;
  }
  const currentDistance = field.distance[cursorY * field.width + cursorX] ?? -1;
  if (currentDistance > 0) {
    // A temporary occupancy conflict can remove every non-reversing prefix.
    // Wait for the lane to open instead of falling back to a static route that
    // sends the unit back through the cell it just left.
    entity.path = [];
    entity.routePending = true;
    return;
  }
  if (finishFlowFieldRoute(state, entity)) return;
  entity.routePending = true;
}

function prefixCellOpen(
  state: SimState,
  occupancy: Uint8Array,
  reserved: Map<number, number>,
  ignoreId: number,
  x: number,
  y: number,
): boolean {
  return !flowCellTaken(occupancy, reserved, state.width, Math.round(x), Math.round(y), ignoreId);
}

function reserveCell(state: SimState, reserved: Map<number, number>, id: number, x: number, y: number): void {
  reserved.set(Math.round(y) * state.width + Math.round(x), id);
}

function finishFlowFieldRoute(state: SimState, entity: Entity): boolean {
  const result = tryFindPathDetailed(state, entity, entity.orderDestination!);
  if (!result) return false;
  entity.flowGoal = undefined;
  entity.path = result.path;
  entity.routePending = routePendingFor(result.status);
  entity.idle = result.status === "unreachable";
  return true;
}
