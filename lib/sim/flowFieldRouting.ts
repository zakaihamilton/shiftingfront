import type { Entity, SimState } from "../types";
import { flowCellTaken, flowDistanceAt, flowFieldForGoals, flowStep, type FlowField } from "./flowField";
import { navigationEdgeKey, navigationEdgeReserved } from "./navigation/grid";
import { reversesPreviousStep } from "./pathfinding";
import { tryFindPathDetailed } from "./pathBudget";
import { entitiesFor } from "./entities";
import { navigationMobilityFor } from "./terrainRules";

const FLOW_PATH_PREFIX_LENGTH = 2;
const MIN_CONGESTION_GROUP_SIZE = 16;
const ARRIVAL_DISTANCE = 2;
const ARRIVAL_SWITCH_DISTANCE = 12;

type RankedFollower = { entity: Entity; field: FlowField; dist: number };
type CongestedGroup = {
  size: number;
  formed: boolean;
  arrivalGoals: { x: number; y: number }[];
};
type FlowRoutingBuffers = {
  fields: Map<string, FlowField>;
  followers: Entity[];
  ranked: RankedFollower[];
  congestedGroups: Map<string, CongestedGroup>;
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
  const buffers = { fields: new Map<string, FlowField>(), followers: [], ranked: [], congestedGroups: new Map<string, CongestedGroup>() };
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
  flowOrder?: Map<number, number>,
  plannedVacates?: Map<number, number>,
  flowFields?: Map<number, FlowField>,
  edgeReservations?: Map<number, number>,
): void {
  const { fields, followers, ranked, congestedGroups } = buffersFor(state);
  flowOrder?.clear();
  plannedVacates?.clear();
  flowFields?.clear();
  edgeReservations?.clear();

  const groups = new Map<string, Entity[]>();
  for (const entity of entitiesFor(state)) {
    if (entity.hp <= 0 || entity.class !== "unit" || skipIds?.has(entity.id) || !entity.flowGoal || !entity.orderDestination) continue;
    const goal = entity.flowGoal;
    const key = `${Math.round(goal.x)}:${Math.round(goal.y)}:${navigationMobilityFor(entity)}`;
    const members = groups.get(key) ?? [];
    members.push(entity);
    groups.set(key, members);
  }

  // Keep the large-group mode alive while the leading units are peeling into
  // their final cells. Without this small tail groups would switch back to a
  // single-goal field and recreate the funnel they just escaped.
  const activeGroupKeys = new Set<string>();
  for (const [groupKey, members] of groups) {
    activeGroupKeys.add(groupKey);
    if (members.length < MIN_CONGESTION_GROUP_SIZE && !congestedGroups.has(groupKey)) continue;
    const previous = congestedGroups.get(groupKey);
    if (previous && members.length < MIN_CONGESTION_GROUP_SIZE) continue;
    const arrivalGoals = members.map((entity) => ({ ...entity.orderDestination! }));
    const sameOrder = previous && previous.size === members.length && sameGoalSet(previous.arrivalGoals, arrivalGoals);
    congestedGroups.set(groupKey, previous && (members.length < previous.size || sameOrder) ? previous : {
      size: members.length,
      formed: members.some((entity) => entity.formation !== undefined),
      arrivalGoals,
    });
  }
  for (const groupKey of congestedGroups.keys()) {
    if (!activeGroupKeys.has(groupKey)) congestedGroups.delete(groupKey);
  }

  if (congestedGroups.size === 0) {
    prepareSmallGroupRoutes(state, occupancy, reserved, previousCells, fields, followers, ranked, skipIds, flowFields, edgeReservations);
    return;
  }

  let order = 0;
  for (const members of groups.values()) {
    const goal = members[0]!.flowGoal!;
    const mobility = navigationMobilityFor(members[0]!);
    const groupKey = `${Math.round(goal.x)}:${Math.round(goal.y)}:${mobility}`;
    const goals = members.map((entity) => ({ ...entity.orderDestination! }));
    const congested = congestedGroups.get(groupKey);
    const fieldGoals = congested?.arrivalGoals ?? goals;
    const key = `${state.navigationRevision ?? 0}:${groupKey}:${goalSetKey(fieldGoals)}`;
    const approachField = fields.get(key) ?? flowFieldForGoals(state, fieldGoals, mobility);
    fields.set(key, approachField);
    const arrivalField = congested ? approachField : undefined;
    const arrivalSwitchDistance = congested?.formed
      ? Math.max(ARRIVAL_SWITCH_DISTANCE, Math.ceil(congested.size / 4))
      : congested
        ? Math.max(ARRIVAL_SWITCH_DISTANCE, Math.ceil(Math.sqrt(congested.size) * 3))
        : ARRIVAL_SWITCH_DISTANCE;
    const ordered = members.slice().sort((a, b) =>
      flowDistanceAt(approachField, a.x, a.y) - flowDistanceAt(approachField, b.x, b.y) || a.id - b.id,
    );

    for (const entity of ordered) {
      // A bounded arrival search may leave a useful partial path. Let it run
      // for this tick; movement re-enters flow planning if it is blocked or
      // exhausted.
      if (entity.path.length > 0 && entity.routePending === false) continue;
      const destination = entity.orderDestination!;
      const personalCheb = Math.max(
        Math.abs(Math.round(entity.x) - Math.round(destination.x)),
        Math.abs(Math.round(entity.y) - Math.round(destination.y)),
      );
      const routeDistance = flowDistanceAt(approachField, entity.x, entity.y);
      const arrivalDistance = arrivalField ? routeDistance : Number.POSITIVE_INFINITY;
      if (arrivalDistance <= ARRIVAL_DISTANCE && congested && !congested.formed) {
        // Unformed groups only promise a compact, unique arrival area. Once a
        // unit reaches one of those reachable slots, claim that slot instead
        // of making it cross the settled group to preserve its initial pair.
        settleAtArrivalSlot(entity);
        continue;
      }
      if ((personalCheb <= ARRIVAL_DISTANCE || routeDistance <= arrivalSwitchDistance) &&
        finishFlowFieldRoute(state, occupancy, entity, entity.owner === 0 ? previousCells?.get(entity.id) : undefined)) {
        flowOrder?.set(entity.id, order++);
        continue;
      }

      // The shared approach field carries the group until it reaches the
      // arrival envelope. Thereafter the multi-goal field lets units peel
      // toward their own cells without paying for one A* search per unit.
      const fallbackField = approachField;

      // A bounded arrival search can be deferred. Keep the unit on the
      // shared field so it continues approaching while the path budget is
      // temporarily exhausted.
      followers.push(entity);
      flowOrder?.set(entity.id, order++);
      flowFields?.set(entity.id, fallbackField);
      ranked.push({ entity, field: fallbackField, dist: flowDistanceAt(fallbackField, entity.x, entity.y) });
    }
  }

  ranked.sort((a, b) => a.dist - b.dist || a.entity.id - b.entity.id);
  for (const { entity, field } of ranked) {
    assignFlowPrefix(state, occupancy, reserved, previousCells, entity, field, plannedVacates, flowFields, edgeReservations);
  }
}

function settleAtArrivalSlot(entity: Entity): void {
  entity.orderDestination = { x: Math.round(entity.x), y: Math.round(entity.y) };
  entity.flowGoal = undefined;
  entity.path = [];
  entity.routePending = false;
  entity.idle = true;
}

function sameGoalSet(a: readonly { x: number; y: number }[], b: readonly { x: number; y: number }[]): boolean {
  if (a.length !== b.length) return false;
  const normalize = (goals: readonly { x: number; y: number }[]) =>
    goals.map((goal) => `${Math.round(goal.x)},${Math.round(goal.y)}`).sort().join(";");
  return normalize(a) === normalize(b);
}

function goalSetKey(goals: readonly { x: number; y: number }[]): string {
  return goals.map((goal) => `${Math.round(goal.x)},${Math.round(goal.y)}`).sort().join(";");
}

function prepareSmallGroupRoutes(
  state: SimState,
  occupancy: Uint8Array,
  reserved: Map<number, number>,
  previousCells: Map<number, number> | undefined,
  fields: Map<string, FlowField>,
  followers: Entity[],
  ranked: RankedFollower[],
  skipIds?: { has(id: number): boolean },
  flowFields?: Map<number, FlowField>,
  edgeReservations?: Map<number, number>,
): void {
  for (const entity of entitiesFor(state)) {
    if (entity.hp <= 0 || entity.class !== "unit" || skipIds?.has(entity.id) || !entity.flowGoal || !entity.orderDestination) continue;
    if (entity.path.length > 0 && entity.routePending === false) continue;
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
    if (personalCheb <= ARRIVAL_DISTANCE || sharedCheb <= ARRIVAL_DISTANCE) {
      if (finishFlowFieldRoute(state, occupancy, entity)) continue;
      entity.routePending = true;
      continue;
    }
    followers.push(entity);
  }

  for (const entity of followers) {
    const mobility = navigationMobilityFor(entity);
    const sameMobilityFollowers = followers.filter((follower) => navigationMobilityFor(follower) === mobility);
    const goals = sameMobilityFollowers.map((follower) => ({ ...follower.orderDestination! }));
    const goal = entity.flowGoal!;
    const key = `${state.navigationRevision ?? 0}:${mobility}:${Math.round(goal.x)}:${Math.round(goal.y)}:${goalSetKey(goals)}`;
    const field = fields.get(key) ?? flowFieldForGoals(state, goals, mobility);
    fields.set(key, field);
    ranked.push({ entity, field, dist: flowDistanceAt(field, entity.x, entity.y) });
  }
  ranked.sort((a, b) => a.dist - b.dist || a.entity.id - b.entity.id);
  for (const { entity, field } of ranked) {
    assignFlowPrefix(state, occupancy, reserved, previousCells, entity, field, undefined, flowFields, edgeReservations);
  }
}

function assignFlowPrefix(
  state: SimState,
  occupancy: Uint8Array,
  reserved: Map<number, number>,
  previousCells: Map<number, number> | undefined,
  entity: Entity,
  field: FlowField,
  plannedVacates: Map<number, number> | undefined,
  flowFields?: Map<number, FlowField>,
  edgeReservations?: Map<number, number>,
): void {
  let cursorX = Math.round(entity.x);
  let cursorY = Math.round(entity.y);
  const previousCell = entity.owner === 0 ? previousCells?.get(entity.id) : undefined;
  const existing = entity.path[0];
  const existingIsCurrent = existing && Math.round(existing.x) === cursorX && Math.round(existing.y) === cursorY;
  const existingDistance = existing
    ? field.distance[Math.round(existing.y) * field.width + Math.round(existing.x)] ?? -1
    : -1;
  const currentDistance = field.distance[cursorY * field.width + cursorX] ?? -1;
  const existingFree = existing
    ? !existingIsCurrent && existingDistance >= 0 && existingDistance < currentDistance &&
      prefixCellOpen(state, occupancy, reserved, entity.id, existing.x, existing.y, plannedVacates) &&
      !edgeBlocked(state, edgeReservations, entity.id, cursorX, cursorY, Math.round(existing.x), Math.round(existing.y))
    : false;
  const prefix: { x: number; y: number }[] = [];
  let priorCell = previousCell;
  for (let i = 0; i < (plannedVacates ? 1 : FLOW_PATH_PREFIX_LENGTH); i++) {
    const candidate = i === 0 && existingFree && existing
      ? existing
      : flowStep(field, cursorX, cursorY, {
        occupancy,
        reserved,
        ignoreId: entity.id,
        state,
        previousCell: priorCell,
        vacating: plannedVacates,
        edgeReservations,
        allowNonImproving: (entity.blockedTicks ?? 0) >= 3,
      });
    if (!candidate || !prefixCellOpen(state, occupancy, reserved, entity.id, candidate.x, candidate.y, plannedVacates)) break;
    if (edgeBlocked(state, edgeReservations, entity.id, cursorX, cursorY, Math.round(candidate.x), Math.round(candidate.y))) break;
    prefix.push(candidate);
    reserved.set(Math.round(candidate.y) * state.width + Math.round(candidate.x), entity.id);
    edgeReservations?.set(navigationEdgeKey(state.width, state.height, cursorX, cursorY, Math.round(candidate.x), Math.round(candidate.y)), entity.id);
    priorCell = cursorY * state.width + cursorX;
    cursorX = Math.round(candidate.x);
    cursorY = Math.round(candidate.y);
  }

  if (prefix.length > 0) {
    entity.path = prefix;
    entity.routePending = true;
    flowFields?.set(entity.id, field);
    if (plannedVacates) {
      const current = Math.round(entity.y) * state.width + Math.round(entity.x);
      const first = prefix[0]!;
      plannedVacates.set(current, Math.round(first.y) * state.width + Math.round(first.x));
    }
    return;
  }
  if (currentDistance > 0) {
    entity.path = [];
    entity.routePending = true;
    entity.blockedTicks = (entity.blockedTicks ?? 0) + 1;
    return;
  }
  if (finishFlowFieldRoute(state, occupancy, entity, previousCell)) return;
  entity.routePending = true;
}

function edgeBlocked(
  state: SimState,
  edgeReservations: Map<number, number> | undefined,
  ignoreId: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  return navigationEdgeReserved(edgeReservations, state.width, state.height, x0, y0, x1, y1, ignoreId);
}

function prefixCellOpen(
  state: SimState,
  occupancy: Uint8Array,
  reserved: Map<number, number>,
  ignoreId: number,
  x: number,
  y: number,
  plannedVacates?: Map<number, number>,
): boolean {
  return !flowCellTaken(occupancy, reserved, state.width, Math.round(x), Math.round(y), ignoreId, plannedVacates);
}

function finishFlowFieldRoute(state: SimState, occupancy: Uint8Array, entity: Entity, previousCell?: number): boolean {
  const destination = entity.orderDestination!;
  if (Math.round(entity.x) === Math.round(destination.x) && Math.round(entity.y) === Math.round(destination.y)) {
    entity.flowGoal = undefined;
    entity.path = [];
    entity.routePending = false;
    entity.idle = true;
    return true;
  }
  const result = tryFindPathDetailed(state, entity, entity.orderDestination!, {
    avoidUnits: true,
    ignoreId: entity.id,
    occupancy,
  });
  if (!result) return false;
  // A temporary unit blockade must not consume the shared flow route. A
  // useful partial path gets one tick to run while the flow goal remains
  // attached; a blocked or exhausted partial path rejoins the field.
  if (result.status === "partial") {
    if (result.path.length === 0) return false;
    entity.path = result.path;
    entity.routePending = false;
    entity.idle = false;
    return true;
  }
  if (result.status === "unreachable") return false;
  const last = result.path[result.path.length - 1];
  if (last && (Math.round(last.x) !== Math.round(destination.x) || Math.round(last.y) !== Math.round(destination.y))) {
    return false;
  }
  const first = result.path[0];
  if (first && entity.owner === 0 && entity.scenarioRole !== "convoy" && reversesPreviousStep(
    state.width,
    Math.round(entity.x),
    Math.round(entity.y),
    Math.round(first.x),
    Math.round(first.y),
    previousCell,
  )) return false;
  // Keep the shared goal attached until the unit actually reaches its slot.
  // This makes a complete static path a temporary handoff, so a newly
  // occupied waypoint can return the unit to the flow field instead of
  // leaving it with an unbounded stale path.
  entity.path = result.path;
  entity.routePending = false;
  entity.idle = false;
  return true;
}
