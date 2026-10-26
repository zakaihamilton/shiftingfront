import { UNIT_STATS } from "../catalog";
import { toIsometricFacing } from "../iso";
import type { Entity, SimState, UnitEntity } from "../types";
import { tryFindPathDetailed } from "./pathBudget";
import { flowDistanceAt, type FlowField } from "./flowField";
import { navigationEdgeKey, navigationEdgeReserved, navigationStepAllowed } from "./navigation/grid";
import { staticNavigationFor } from "./world";
import { navigationMobilityFor, terrainMovementCostAt } from "./terrainRules";
import { isPlayerControlledOwner } from "./ownership";
import {
  advanceAlongPath,
  cellOf,
  giveWay,
  goalDistance,
  holdingDestination,
  reversesPreviousStep,
  stepFromPreviousCell,
  tileFree,
  trySidestep,
} from "./navigation";

// Large formations already have flow-field coordination; preserve their
// established tie-break so local passing does not split the formation.
const INDIVIDUAL_PASSING_GROUP_LIMIT = 16;

/** Recovery actors may back out of a pocket while following their return route. */
export function isRecoveryReturn(entity: Entity): boolean {
  return !entity.neutral && entity.orderMode === "move" &&
    (entity.scenarioRole === "cargo" || entity.scenarioRole === "stranded");
}

export type MoverStep = {
  state: SimState;
  occupancy: Uint8Array;
  atTile: Map<number, Entity>;
  reserved: Map<number, number>;
  previousCells: Map<number, number>;
  flowFields: Map<number, FlowField>;
  edgeReservations: Map<number, number>;
  plannedVacates: Map<number, number>;
  movers: UnitEntity[];
};

export function stepMover(e: UnitEntity, step: MoverStep): void {
  const { state, occupancy, atTile, reserved, previousCells, flowFields, edgeReservations, plannedVacates, movers } = step;
  const current = cellOf(state, e.x, e.y);
  const next = e.path[0];
  if (next) {
    const currentX = current % state.width;
    const currentY = Math.floor(current / state.width);
    const nextX = Math.round(next.x);
    const nextY = Math.round(next.y);
    // A sidestep can drop the waypoint after the blocked cell, leaving a
    // jump the unit is not allowed to take. Drop that path and replan
    // instead of standing on it until the deadline.
    if ((currentX !== nextX || currentY !== nextY) && !navigationStepAllowed(staticNavigationFor(state), currentX, currentY, nextX, nextY)) {
      e.path = [];
      e.routePending = true;
      e.idle = false;
      return;
    }
  }
  const movementCost = next ? terrainMovementCostAt(state, navigationMobilityFor(e), next.x, next.y) : 1;
  const planted = e.bombard ? 0 : e.braced ? 0.45 : 1;
  const speed = UNIT_STATS[e.kind].speed / movementCost * (1 - Math.min(0.4, (e.suppression ?? 0) / 250)) * planted;
  const distance = next ? Math.hypot(next.x - e.x, next.y - e.y) : 0;
  const nx = next ? Math.round(next.x) : Math.round(e.x);
  const ny = next ? Math.round(next.y) : Math.round(e.y);
  let blockedX = nx;
  let blockedY = ny;
  let target = blockedY * state.width + blockedX;
  const claim = reserved.get(target);
  let blocked = !!next && target !== current && (
    occupancy[target] === 1 ||
    (claim !== undefined && claim !== e.id) ||
    navigationEdgeReserved(edgeReservations, state.width, state.height, current % state.width, Math.floor(current / state.width), nx, ny, e.id)
  );

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
      if (!tileFree(state, occupancy, reserved, e, proposedX, proposedY) || navigationEdgeReserved(
        edgeReservations,
        state.width,
        state.height,
        current % state.width,
        Math.floor(current / state.width),
        proposedX,
        proposedY,
        e.id,
      )) {
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
      return;
    }
    const progressField = flowFields.get(e.id);
    const progressDistance = progressField ? (x: number, y: number) => flowDistanceAt(progressField, x, y) : undefined;
    if (trySidestep(
      state,
      occupancy,
      reserved,
      e,
      blockedX,
      blockedY,
      isPlayerControlledOwner(state, e.owner) ? previousCells.get(e.id) : undefined,
      progressDistance,
      edgeReservations,
      movers.length < INDIVIDUAL_PASSING_GROUP_LIMIT,
    )) {
      e.blockedTicks = 0;
    } else if (blocker && blocker.id !== e.id && giveWay(
      state,
      occupancy,
      reserved,
      blocker,
      isPlayerControlledOwner(state, blocker.owner) ? previousCells.get(blocker.id) : undefined,
      edgeReservations,
    )) {
      e.blockedTicks = 0;
      return;
    } else {
      e.blockedTicks = (e.blockedTicks ?? 0) + 1;
      if (e.blockedTicks === 1 || e.blockedTicks % 6 === 0) {
        const destination = e.path[e.path.length - 1];
        let rerouted = false;
        if (destination) {
          const detourResult = tryFindPathDetailed(state, e, destination, {
            avoidUnits: true,
            ignoreId: e.id,
            occupancy,
            approach: stepFromPreviousCell(state.width, Math.round(e.x), Math.round(e.y), previousCells.get(e.id)),
          });
          if (!detourResult) {
            if (e.flowGoal) e.path = [];
            return;
          }
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
            return;
          }
          const detour = detourResult.path;
          const detourFirst = detour[0];
          if (detourFirst) {
            const dx = Math.round(detourFirst.x);
            const dy = Math.round(detourFirst.y);
            const sameBlocked = dx === blockedX && dy === blockedY;
            const reverses = isPlayerControlledOwner(state, e.owner) && e.scenarioRole !== "convoy" && !isRecoveryReturn(e) && reversesPreviousStep(
              state.width,
              Math.round(e.x),
              Math.round(e.y),
              dx,
              dy,
              previousCells.get(e.id),
            );
            if (!sameBlocked && !reverses && tileFree(state, occupancy, reserved, e, dx, dy) && !navigationEdgeReserved(
              edgeReservations,
              state.width,
              state.height,
              current % state.width,
              Math.floor(current / state.width),
              dx,
              dy,
              e.id,
            )) {
              e.path = detour;
              rerouted = true;
            }
          }
        }
        if (!rerouted && e.flowGoal) {
          // A stale prefix can retain a reservation that is no longer
          // compatible with the current group order. Return control to the
          // shared field so the next tick can select a different lane.
          e.path = [];
          e.routePending = true;
        }
      }
      return;
    }
  }

  const stepTarget = e.path[0];
  const stepX = stepTarget ? Math.round(stepTarget.x) : Math.round(e.x);
  const stepY = stepTarget ? Math.round(stepTarget.y) : Math.round(e.y);
  const stepCell = stepY * state.width + stepX;
  if (stepTarget && stepCell !== current && (!tileFree(state, occupancy, reserved, e, stepX, stepY) || navigationEdgeReserved(
    edgeReservations,
    state.width,
    state.height,
    current % state.width,
    Math.floor(current / state.width),
    stepX,
    stepY,
    e.id,
  ))) {
    e.blockedTicks = (e.blockedTicks ?? 0) + 1;
    return;
  }
  if (stepTarget && stepCell !== current) reserved.set(stepCell, e.id);
  if (stepTarget && stepCell !== current) {
    edgeReservations.set(navigationEdgeKey(
      state.width,
      state.height,
      current % state.width,
      Math.floor(current / state.width),
      stepX,
      stepY,
    ), e.id);
  }
  if (stepTarget) {
    const dx = stepTarget.x - e.x;
    const dy = stepTarget.y - e.y;
    if (Math.hypot(dx, dy) > 0.001) {
      e.facing = toIsometricFacing(dx, dy);
    }
  }
  const before = current;
  advanceAlongPath(state, occupancy, reserved, e, speed, edgeReservations);
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
