import { isAirUnit } from "../catalog";
import { isUnitEntity, type Entity, type SimEvent, type SimState, type UnitEntity } from "../types";
import { tryFindPathDetailed } from "./pathBudget";
import { routePendingFor } from "./pathfinding";
import { prepareFlowFieldRoutes } from "./flowFieldRouting";
import type { FlowField } from "./flowField";
import { invalidateUnitAtCache, unitOccupancyFor } from "./world";
import { tickAircraft } from "./aircraft";
import { entitiesFor } from "./entities";
import { isPlayerControlledOwner } from "./ownership";
import { cellOf, goalDistance, holdingDestination, reversesPreviousStep, stepFromPreviousCell } from "./navigation";
import { isRecoveryReturn, stepMover } from "./movementStep";

type MovementBuffers = {
  occupancy: Uint8Array;
  atTile: Map<number, Entity>;
  reserved: Map<number, number>;
  movers: UnitEntity[];
  previousCells: Map<number, number>;
  movementIntents: Map<number, string>;
  flowOrder: Map<number, number>;
  plannedVacates: Map<number, number>;
  flowFields: Map<number, FlowField>;
  edgeReservations: Map<number, number>;
};

const movementBuffers = new WeakMap<SimState, MovementBuffers>();

function buffersFor(state: SimState): MovementBuffers {
  const size = state.width * state.height;
  let buffers = movementBuffers.get(state);
  if (!buffers || buffers.occupancy.length !== size) {
    buffers = {
      occupancy: new Uint8Array(size),
      atTile: new Map<number, Entity>(),
      reserved: new Map<number, number>(),
      movers: [],
      previousCells: new Map<number, number>(),
      movementIntents: new Map<number, string>(),
      flowOrder: new Map<number, number>(),
      plannedVacates: new Map<number, number>(),
      flowFields: new Map<number, FlowField>(),
      edgeReservations: new Map<number, number>(),
    };
    movementBuffers.set(state, buffers);
  } else {
    buffers.atTile.clear();
    buffers.reserved.clear();
    buffers.movers.length = 0;
    buffers.flowOrder.clear();
    buffers.plannedVacates.clear();
    buffers.flowFields.clear();
    buffers.edgeReservations.clear();
  }
  buffers.occupancy = unitOccupancyFor(state);
  return buffers;
}

export function tickMovement(state: SimState, eventSink?: SimEvent[]): void {
  tickAircraft(state, eventSink);
  const { occupancy, atTile, reserved, movers, previousCells, movementIntents, flowOrder, plannedVacates, flowFields, edgeReservations } = buffersFor(state);
  resetPreviousCellsForNewOrders(state, previousCells, movementIntents);
  prepareFlowFieldRoutes(state, occupancy, reserved, previousCells, undefined, flowOrder, plannedVacates, flowFields, edgeReservations);
  for (const e of entitiesFor(state)) {
    // Convoys are neutral so combat targeting ignores them, but they still
    // need the normal background repath when a bounded search returned only
    // a partial route. Other neutral scenario actors have no movement orders.
    if (e.hp <= 0 || e.class !== "unit" || isAirUnit(e.kind) || (e.neutral && e.scenarioRole !== "convoy") || e.flowGoal || e.path.length || !e.orderDestination) continue;
    if (holdingDestination(e)) continue;
    const dest = e.orderDestination;
    const destX = Math.round(dest.x);
    const destY = Math.round(dest.y);
    const destCell = destY * state.width + destX;
    const destOccupied = occupancy[destCell] === 1 && destCell !== cellOf(state, e.x, e.y);
    const cheb = Math.max(
      Math.abs(Math.round(e.x) - destX),
      Math.abs(Math.round(e.y) - destY),
    );
    // A returned recovery actor can occupy the shared return destination.
    // Other actors must still extend their bounded routes while far away;
    // only stop for the occupied final cell once they reach its perimeter.
    const returningActor = isRecoveryReturn(e);
    if (destOccupied && (!returningActor || cheb <= 1)) continue;
    if (cheb <= 1) {
      e.path = [{ x: destX, y: destY }];
      e.idle = false;
      e.routePending = undefined;
      continue;
    }
    if (!e.routePending && !e.idle) continue;
    const result = tryFindPathDetailed(state, e, dest, {
      approach: stepFromPreviousCell(state.width, Math.round(e.x), Math.round(e.y), previousCells.get(e.id)),
    });
    if (!result) continue;
    const first = result.path[0];
    if (first && isPlayerControlledOwner(state, e.owner) && e.scenarioRole !== "convoy" && !returningActor && reversesPreviousStep(
      state.width,
      Math.round(e.x),
      Math.round(e.y),
      Math.round(first.x),
      Math.round(first.y),
      previousCells.get(e.id),
    )) {
      // A replan can end in a pocket with the only available route pointing
      // back through the tile the unit just left. Keep the unit settled until
      // the route can continue without visibly backtracking.
      e.path = [];
      e.routePending = false;
      e.idle = true;
      continue;
    }
    e.path = result.path;
    e.routePending = routePendingFor(result.status);
    e.idle = result.status === "unreachable";
  }
  for (const e of entitiesFor(state)) {
    if (e.hp <= 0 || e.class !== "unit" || isAirUnit(e.kind)) continue;
    atTile.set(cellOf(state, e.x, e.y), e);
  }

  for (const e of entitiesFor(state)) {
    if (e.hp <= 0 || !isUnitEntity(e) || isAirUnit(e.kind)) continue;
    movers.push(e);
  }
  movers.sort((a, b) => {
    const aOrder = flowOrder.get(a.id);
    const bOrder = flowOrder.get(b.id);
    if (aOrder !== undefined || bOrder !== undefined) {
      return (aOrder ?? Number.POSITIVE_INFINITY) - (bOrder ?? Number.POSITIVE_INFINITY) || a.id - b.id;
    }
    return goalDistance(a) - goalDistance(b) || a.id - b.id;
  });

  const step = { state, occupancy, atTile, reserved, previousCells, flowFields, edgeReservations, plannedVacates, movers };
  for (const e of movers) stepMover(e, step);
  // Positions changed during this tick are not reflected in the O(1) unitAt
  // cache used by placement and closest-approach queries.
  invalidateUnitAtCache(state);
}

function resetPreviousCellsForNewOrders(
  state: SimState,
  previousCells: Map<number, number>,
  movementIntents: Map<number, string>,
): void {
  for (const entity of entitiesFor(state)) {
    if (entity.class !== "unit") continue;
    const destination = entity.orderDestination;
    const flowGoal = entity.flowGoal;
    const intent = `${entity.orderMode ?? ""}:${destination?.x ?? ""},${destination?.y ?? ""}:${flowGoal?.x ?? ""},${flowGoal?.y ?? ""}`;
    if (movementIntents.get(entity.id) !== intent) previousCells.delete(entity.id);
    movementIntents.set(entity.id, intent);
  }
}

