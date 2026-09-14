import { UNIT_STATS } from "../catalog";
import { toIsometricFacing } from "../iso";
import { isUnitEntity, type Entity, type SimState, type UnitEntity, type Vec2 } from "../types";
import { tryFindPathDetailed } from "./pathBudget";
import { routePendingFor } from "./pathfinding";
import { prepareFlowFieldRoutes } from "./flowFieldRouting";
import { invalidateUnitAtCache, unitOccupancyFor } from "./world";

type MovementBuffers = {
  occupancy: Uint8Array;
  atTile: Map<number, Entity>;
  reserved: Map<number, number>;
  swapped: Set<number>;
  movers: UnitEntity[];
  previousCells: Map<number, number>;
  movementIntents: Map<number, string>;
  pendingSwaps: Map<number, PendingSwap>;
};

type PendingSwap = {
  partnerId: number;
  target: Vec2;
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
      swapped: new Set<number>(),
      movers: [],
      previousCells: new Map<number, number>(),
      movementIntents: new Map<number, string>(),
      pendingSwaps: new Map<number, PendingSwap>(),
    };
    movementBuffers.set(state, buffers);
  } else {
    buffers.atTile.clear();
    buffers.reserved.clear();
    buffers.swapped.clear();
    buffers.movers.length = 0;
  }
  buffers.occupancy = unitOccupancyFor(state);
  return buffers;
}

import {
  advanceAlongPath,
  cellOf,
  exchangePositions,
  releaseHeadOnSwap,
  giveWay,
  goalDistance,
  holdingDestination,
  reversesPreviousStep,
  tileFree,
  tryCooperativeSwap,
  trySidestep,
} from "./navigation";

export function tickMovement(state: SimState): void {
  const { occupancy, atTile, reserved, swapped, movers, previousCells, movementIntents, pendingSwaps } = buffersFor(state);
  advancePendingSwaps(state, occupancy, pendingSwaps, swapped, previousCells);
  resetPreviousCellsForNewOrders(state, previousCells, movementIntents);
  prepareFlowFieldRoutes(state, occupancy, reserved, undefined, pendingSwaps);
  for (const e of state.entities) {
    // Convoys are neutral so combat targeting ignores them, but they still
    // need the normal background repath when a bounded search returned only
    // a partial route. Other neutral scenario actors have no movement orders.
    if (e.hp <= 0 || e.class !== "unit" || pendingSwaps.has(e.id) || (e.neutral && e.scenarioRole !== "convoy") || e.flowGoal || e.path.length || !e.orderDestination) continue;
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
    if (first && e.owner === 0 && reversesPreviousStep(
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
  movers.sort((a, b) => goalDistance(a) - goalDistance(b) || a.id - b.id);

  for (const e of movers) {
    if (swapped.has(e.id)) continue;
    const speed = UNIT_STATS[e.kind].speed * (1 - Math.min(0.4, (e.suppression ?? 0) / 250));
    const current = cellOf(state, e.x, e.y);
    const next = e.path[0];
    const nx = next ? Math.round(next.x) : Math.round(e.x);
    const ny = next ? Math.round(next.y) : Math.round(e.y);
    const target = ny * state.width + nx;
    const claim = reserved.get(target);
    const blocked = !!next && target !== current && (occupancy[target] === 1 || (claim !== undefined && claim !== e.id));

    if (blocked) {
      const blocker = atTile.get(target);
      const orderDest = e.orderDestination;
      if (
        orderDest &&
        nx === Math.round(orderDest.x) &&
        ny === Math.round(orderDest.y) &&
        blocker &&
        blocker.id !== e.id &&
        holdingDestination(blocker)
      ) {
        e.path = [];
        e.idle = true;
        e.blockedTicks = 0;
        continue;
      }
      if (blocker && blocker.id !== e.id && !swapped.has(blocker.id)) {
        const bNext = blocker.path[0];
        if (bNext && Math.round(bNext.x) === Math.round(e.x) && Math.round(bNext.y) === Math.round(e.y)) {
          if (smoothSwapFor(state, e, blocker)) {
            const eStart = { x: e.x, y: e.y };
            const blockerStart = { x: blocker.x, y: blocker.y };
            releaseHeadOnSwap(swapped, e, blocker);
            e.path.shift();
            blocker.path.shift();
            if (isUnitEntity(blocker)) queuePendingSwap(pendingSwaps, e, blocker, eStart, blockerStart);
          } else {
            exchangePositions(state, occupancy, atTile, swapped, e, blocker);
            e.path.shift();
            blocker.path.shift();
          }
          continue;
        }
      }

      if (trySidestep(state, occupancy, reserved, e, nx, ny, e.owner === 0 ? previousCells.get(e.id) : undefined)) {
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
      } else if (blocker && blocker.id !== e.id && tryCooperativeSwap(state, occupancy, atTile, swapped, e, blocker, smoothSwapFor(state, e, blocker))) {
        if (smoothSwapFor(state, e, blocker) && !e.path.length && isUnitEntity(blocker)) {
          queuePendingSwap(
            pendingSwaps,
            e,
            blocker,
            { x: e.x, y: e.y },
            { x: blocker.x, y: blocker.y },
          );
        }
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
              const sameBlocked = dx === nx && dy === ny;
              const reverses = e.owner === 0 && reversesPreviousStep(
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
      e.blockedTicks = 0;
    }
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

function smoothSwapFor(state: SimState, e: Entity, blocker: Entity): boolean {
  // Coordinate exchanges are visible teleports; keep them smooth for either
  // faction when two non-neutral units from the same side need to cross.
  return e.owner === blocker.owner && !e.neutral && !blocker.neutral
    && !state.entities.some((entity) => entity.neutral);
}

function queuePendingSwap(
  pendingSwaps: Map<number, PendingSwap>,
  e: UnitEntity,
  blocker: UnitEntity,
  eStart: Vec2,
  blockerStart: Vec2,
): void {
  if (e.path.length || blocker.path.length) return;
  pendingSwaps.set(e.id, {
    partnerId: blocker.id,
    target: { ...blockerStart },
  });
  pendingSwaps.set(blocker.id, {
    partnerId: e.id,
    target: { ...eStart },
  });
}

function advancePendingSwaps(
  state: SimState,
  occupancy: Uint8Array,
  pendingSwaps: Map<number, PendingSwap>,
  swapped: Set<number>,
  previousCells: Map<number, number>,
): void {
  if (!pendingSwaps.size) return;
  const entities = new Map<number, UnitEntity>();
  for (const entity of state.entities) {
    if (entity.hp > 0 && isUnitEntity(entity)) entities.set(entity.id, entity);
  }

  for (const [id, pending] of pendingSwaps) {
    if (id > pending.partnerId) continue;
    const e = entities.get(id);
    const blocker = entities.get(pending.partnerId);
    const blockerPending = pendingSwaps.get(pending.partnerId);
    if (!e || !blocker || !blockerPending || blockerPending.partnerId !== e.id) {
      pendingSwaps.delete(id);
      pendingSwaps.delete(pending.partnerId);
      continue;
    }
    swapped.add(e.id);
    swapped.add(blocker.id);
    advancePendingUnit(state, e, pending.target, previousCells);
    advancePendingUnit(state, blocker, blockerPending.target, previousCells);

    if (atPendingTarget(e, pending.target) && atPendingTarget(blocker, blockerPending.target)) {
      pendingSwaps.delete(e.id);
      pendingSwaps.delete(blocker.id);
    }
  }

  // The occupancy cache was built before the smooth crossing advanced. Keep
  // the movement-local copy in sync before the rest of the tick routes units.
  occupancy.fill(0);
  for (const entity of entities.values()) {
    const cell = cellOf(state, entity.x, entity.y);
    if (cell >= 0 && cell < occupancy.length) occupancy[cell] = 1;
  }
}

function advancePendingUnit(state: SimState, e: UnitEntity, target: Vec2, previousCells: Map<number, number>): void {
  const before = cellOf(state, e.x, e.y);
  const speed = UNIT_STATS[e.kind].speed * (1 - Math.min(0.4, (e.suppression ?? 0) / 250));
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= speed || distance < 0.001) {
    e.x = target.x;
    e.y = target.y;
  } else {
    e.x += (dx / distance) * speed;
    e.y += (dy / distance) * speed;
    e.facing = toIsometricFacing(dx, dy);
  }
  const after = cellOf(state, e.x, e.y);
  if (after !== before) previousCells.set(e.id, before);
}

function atPendingTarget(e: UnitEntity, target: Vec2): boolean {
  return Math.hypot(target.x - e.x, target.y - e.y) < 0.001;
}
