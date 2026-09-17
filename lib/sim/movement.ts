import { UNIT_STATS } from "../catalog";
import { toIsometricFacing } from "../iso";
import { isUnitEntity, type Entity, type SimState, type UnitEntity } from "../types";
import { tryFindPathDetailed } from "./pathBudget";
import { routePendingFor } from "./pathfinding";
import { prepareFlowFieldRoutes } from "./flowFieldRouting";
import { invalidateUnitAtCache, unitOccupancyFor } from "./world";

type MovementBuffers = {
  occupancy: Uint8Array;
  atTile: Map<number, Entity>;
  reserved: Map<number, number>;
  movers: UnitEntity[];
  previousCells: Map<number, number>;
  movementIntents: Map<number, string>;
  flowOrder: Map<number, number>;
  plannedVacates: Map<number, number>;
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
    };
    movementBuffers.set(state, buffers);
  } else {
    buffers.atTile.clear();
    buffers.reserved.clear();
    buffers.movers.length = 0;
    buffers.flowOrder.clear();
    buffers.plannedVacates.clear();
  }
  buffers.occupancy = unitOccupancyFor(state);
  return buffers;
}

import {
  advanceAlongPath,
  cellOf,
  giveWay,
  goalDistance,
  holdingDestination,
  reversesPreviousStep,
  tileFree,
  trySidestep,
} from "./navigation";

export function tickMovement(state: SimState): void {
  const { occupancy, atTile, reserved, movers, previousCells, movementIntents, flowOrder, plannedVacates } = buffersFor(state);
  resetPreviousCellsForNewOrders(state, previousCells, movementIntents);
  prepareFlowFieldRoutes(state, occupancy, reserved, previousCells, undefined, flowOrder, plannedVacates);
  for (const e of state.entities) {
    // Convoys are neutral so combat targeting ignores them, but they still
    // need the normal background repath when a bounded search returned only
    // a partial route. Other neutral scenario actors have no movement orders.
    if (e.hp <= 0 || e.class !== "unit" || (e.neutral && e.scenarioRole !== "convoy") || e.flowGoal || e.path.length || !e.orderDestination) continue;
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
    if (destOccupied) continue;
    if (cheb <= 1) {
      e.path = [{ x: destX, y: destY }];
      e.idle = false;
      e.routePending = undefined;
      continue;
    }
    if (!e.routePending && !e.idle) continue;
    const result = tryFindPathDetailed(state, e, dest);
    if (!result) continue;
    const first = result.path[0];
    if (first && e.owner === 0 && e.scenarioRole !== "convoy" && reversesPreviousStep(
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
  for (const e of state.entities) {
    if (e.hp <= 0 || e.class !== "unit") continue;
    atTile.set(cellOf(state, e.x, e.y), e);
  }

  for (const e of state.entities) {
    if (e.hp <= 0 || !isUnitEntity(e)) continue;
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

  for (const e of movers) {
    const speed = UNIT_STATS[e.kind].speed * (1 - Math.min(0.4, (e.suppression ?? 0) / 250));
    const current = cellOf(state, e.x, e.y);
    const next = e.path[0];
    const distance = next ? Math.hypot(next.x - e.x, next.y - e.y) : 0;
    const nx = next ? Math.round(next.x) : Math.round(e.x);
    const ny = next ? Math.round(next.y) : Math.round(e.y);
    let blockedX = nx;
    let blockedY = ny;
    let target = blockedY * state.width + blockedX;
    const claim = reserved.get(target);
    let blocked = !!next && target !== current && (occupancy[target] === 1 || (claim !== undefined && claim !== e.id));

    // A fractional diagonal step can round into a different cell before the
    // path waypoint itself is reached. Treat that proposed cell as the
    // blocker so steering can choose a side route instead of freezing or
    // entering an occupied rounded cell.
    if (!blocked && next && distance > speed) {
      const nextX = e.x + ((next.x - e.x) / distance) * speed;
      const nextY = e.y + ((next.y - e.y) / distance) * speed;
      const proposedCell = cellOf(state, nextX, nextY);
      if (proposedCell !== current) {
        const proposedX = proposedCell % state.width;
        const proposedY = Math.floor(proposedCell / state.width);
        if (!tileFree(state, occupancy, reserved, e, proposedX, proposedY)) {
          blockedX = proposedX;
          blockedY = proposedY;
          target = proposedCell;
          blocked = true;
        }
      }
    }

    if (blocked) {
      if (e.flowGoal && e.routePending === false) e.routePending = true;
      const blocker = atTile.get(target);
      const orderDest = e.orderDestination;
      if (
        orderDest &&
        blockedX === Math.round(orderDest.x) &&
        blockedY === Math.round(orderDest.y) &&
        blocker &&
        blocker.id !== e.id &&
        holdingDestination(blocker)
      ) {
        e.path = [];
        e.idle = true;
        e.blockedTicks = 0;
        continue;
      }
      if (trySidestep(state, occupancy, reserved, e, blockedX, blockedY, e.owner === 0 ? previousCells.get(e.id) : undefined)) {
        e.blockedTicks = 0;
      } else if (blocker && blocker.id !== e.id && giveWay(
        state,
        occupancy,
        reserved,
        blocker,
        blocker.owner === 0 ? previousCells.get(blocker.id) : undefined,
      )) {
        e.blockedTicks = 0;
        continue;
      } else {
        e.blockedTicks = (e.blockedTicks ?? 0) + 1;
        if (e.blockedTicks === 1 || e.blockedTicks % 6 === 0) {
          const destination = e.path[e.path.length - 1];
          if (destination) {
            const detourResult = tryFindPathDetailed(state, e, destination, {
              avoidUnits: true,
              ignoreId: e.id,
              occupancy,
            });
            if (!detourResult) continue;
            if (detourResult.status === "unreachable") {
              // A group can legitimately seal a unit's final tile after the
              // unit has arrived nearby. Do not keep walking into the same
              // occupied pocket forever; settle at the current cell.
              if (goalDistance(e) <= 2) {
                e.orderDestination = { x: Math.round(e.x), y: Math.round(e.y) };
                e.path = [];
                e.flowGoal = undefined;
                e.routePending = false;
                e.idle = true;
                e.blockedTicks = 0;
              }
              continue;
            }
            const detour = detourResult.path;
            const detourFirst = detour[0];
            if (detourFirst) {
              const dx = Math.round(detourFirst.x);
              const dy = Math.round(detourFirst.y);
              const sameBlocked = dx === blockedX && dy === blockedY;
              const reverses = e.owner === 0 && e.scenarioRole !== "convoy" && reversesPreviousStep(
                state.width,
                Math.round(e.x),
                Math.round(e.y),
                dx,
                dy,
                previousCells.get(e.id),
              );
              if (!sameBlocked && !reverses && tileFree(state, occupancy, reserved, e, dx, dy)) {
                e.path = detour;
              }
            }
          }
        }
        continue;
      }
    }

    const stepTarget = e.path[0];
    const stepX = stepTarget ? Math.round(stepTarget.x) : Math.round(e.x);
    const stepY = stepTarget ? Math.round(stepTarget.y) : Math.round(e.y);
    const stepCell = stepY * state.width + stepX;
    if (stepTarget && stepCell !== current && !tileFree(state, occupancy, reserved, e, stepX, stepY)) {
      e.blockedTicks = (e.blockedTicks ?? 0) + 1;
      continue;
    }
    if (stepTarget && stepCell !== current) reserved.set(stepCell, e.id);
    if (stepTarget) {
      const dx = stepTarget.x - e.x;
      const dy = stepTarget.y - e.y;
      if (Math.hypot(dx, dy) > 0.001) {
        e.facing = toIsometricFacing(dx, dy);
      }
    }
    const before = current;
    advanceAlongPath(state, occupancy, reserved, e, speed);
    const after = cellOf(state, e.x, e.y);
    if (after !== before) {
      previousCells.set(e.id, before);
      occupancy[before] = 0;
      occupancy[after] = 1;
      atTile.delete(before);
      atTile.set(after, e);
      plannedVacates.delete(before);
      e.blockedTicks = 0;
    }
    if (!e.path.length && e.flowGoal && !holdingDestination(e)) e.routePending = true;
    if (!e.path.length && stepTarget && reserved.get(stepCell) === e.id) reserved.delete(stepCell);
  }
  // Positions changed during this tick are not reflected in the O(1) unitAt
  // cache used by placement and closest-approach queries.
  invalidateUnitAtCache(state);
}

function resetPreviousCellsForNewOrders(
  state: SimState,
  previousCells: Map<number, number>,
  movementIntents: Map<number, string>,
): void {
  for (const entity of state.entities) {
    if (entity.class !== "unit") continue;
    const destination = entity.orderDestination;
    const flowGoal = entity.flowGoal;
    const intent = `${entity.orderMode ?? ""}:${destination?.x ?? ""},${destination?.y ?? ""}:${flowGoal?.x ?? ""},${flowGoal?.y ?? ""}`;
    if (movementIntents.get(entity.id) !== intent) previousCells.delete(entity.id);
    movementIntents.set(entity.id, intent);
  }
}
