import type { Entity, SimState, Vec2 } from "../../types";
import { canClimb, inBounds, isStaticWalkable } from "../world";
import { diagonalCornerBlocked, PATH_DIRS, reversesPreviousStep } from "./grid";

export function cellOf(state: SimState, x: number, y: number): number {
  return Math.round(y) * state.width + Math.round(x);
}

export function tileFree(
  state: SimState,
  occupancy: Uint8Array,
  reserved: Map<number, number>,
  e: Entity,
  x: number,
  y: number,
): boolean {
  if (!inBounds(state, x, y) || !isStaticWalkable(state, x, y)) return false;
  const current = cellOf(state, e.x, e.y);
  const target = y * state.width + x;
  if (target === current) return true;
  if (occupancy[target]) return false;
  const claim = reserved.get(target);
  return claim === undefined || claim === e.id;
}

export function goalDistance(e: Entity): number {
  const dest = e.orderDestination;
  if (!dest) return Number.POSITIVE_INFINITY;
  return Math.max(Math.abs(Math.round(e.x) - Math.round(dest.x)), Math.abs(Math.round(e.y) - Math.round(dest.y)));
}

export function destinationOf(e: Entity): Vec2 | undefined {
  return e.orderDestination ?? e.path[e.path.length - 1];
}

export function holdingDestination(e: Entity): boolean {
  const dest = e.orderDestination;
  if (!dest) return false;
  return Math.round(e.x) === Math.round(dest.x) && Math.round(e.y) === Math.round(dest.y);
}

export function trySidestep(
  state: SimState,
  occupancy: Uint8Array,
  reserved: Map<number, number>,
  e: Entity,
  blockedX: number,
  blockedY: number,
  previousCell?: number,
): boolean {
  if (!e.path.length) return false;
  const cx = Math.round(e.x);
  const cy = Math.round(e.y);
  const dest = e.path.length > 1 ? e.path[1]! : destinationOf(e) ?? e.path[0]!;
  const stayD = Math.hypot(cx - dest.x, cy - dest.y);
  const allowFarther = (e.blockedTicks ?? 0) > 0;
  const waypoint = e.path[0];
  let best: { x: number; y: number; d: number; rank: number } | undefined;
  for (const d of PATH_DIRS) {
    const nx = cx + d.x;
    const ny = cy + d.y;
    const isWaypoint = waypoint && Math.round(waypoint.x) === nx && Math.round(waypoint.y) === ny;
    if (nx === blockedX && ny === blockedY) continue;
    if (e.owner === 0 && reversesPreviousStep(state.width, cx, cy, nx, ny, previousCell)) continue;
    if (!tileFree(state, occupancy, reserved, e, nx, ny)) continue;
    if (!canClimb(state, cx, cy, nx, ny)) continue;
    if (diagonalCornerBlocked(state, cx, cy, nx, ny)) continue;
    if (
      isWaypoint &&
      d.x !== 0 &&
      d.y !== 0 &&
      (!tileFree(state, occupancy, reserved, e, cx + d.x, cy) ||
        !tileFree(state, occupancy, reserved, e, cx, cy + d.y))
    ) continue;
    const dist = Math.hypot(nx - dest.x, ny - dest.y);
    const rank = dist < stayD - 1e-9 ? 0 : dist <= stayD + 1e-9 ? 1 : 2;
    if (rank >= 2 && !allowFarther) continue;
    if (!best || rank < best.rank || (rank === best.rank && dist < best.d)) {
      best = { x: nx, y: ny, d: dist, rank };
    }
  }
  if (!best) return false;
  const sidestep = { x: best.x, y: best.y };
  const follow = e.path[1];
  if (follow && sidestep.x === Math.round(follow.x) && sidestep.y === Math.round(follow.y)) {
    e.path.shift();
    return true;
  }
  const sameAsDest = sidestep.x === Math.round(dest.x) && sidestep.y === Math.round(dest.y);
  if (e.path.length === 1 && !sameAsDest) e.path.unshift(sidestep);
  else e.path[0] = sidestep;
  return true;
}

export function nudgeIdle(
  state: SimState,
  occupancy: Uint8Array,
  reserved: Map<number, number>,
  blocker: Entity,
  previousCell?: number,
): boolean {
  if (blocker.path.length || blocker.neutral) return false;
  if (blocker.orderDestination && !holdingDestination(blocker)) return false;
  return stepBlockerAside(state, occupancy, reserved, blocker, false, previousCell);
}

export function giveWay(
  state: SimState,
  occupancy: Uint8Array,
  reserved: Map<number, number>,
  blocker: Entity,
  previousCell?: number,
): boolean {
  if (blocker.neutral || holdingDestination(blocker)) return false;
  if (!blocker.path.length) return nudgeIdle(state, occupancy, reserved, blocker, previousCell);
  if ((blocker.blockedTicks ?? 0) === 0) return false;
  return stepBlockerAside(state, occupancy, reserved, blocker, true, previousCell);
}

export function stepBlockerAside(
  state: SimState,
  occupancy: Uint8Array,
  reserved: Map<number, number>,
  blocker: Entity,
  allowFarther: boolean,
  previousCell?: number,
): boolean {
  const cx = Math.round(blocker.x);
  const cy = Math.round(blocker.y);
  const dest = destinationOf(blocker);
  const stayD = dest ? Math.hypot(cx - dest.x, cy - dest.y) : 0;
  for (const d of PATH_DIRS) {
    const nx = cx + d.x;
    const ny = cy + d.y;
    if (blocker.owner === 0 && reversesPreviousStep(state.width, cx, cy, nx, ny, previousCell)) continue;
    if (!tileFree(state, occupancy, reserved, blocker, nx, ny)) continue;
    if (!canClimb(state, cx, cy, nx, ny)) continue;
    if (diagonalCornerBlocked(state, cx, cy, nx, ny)) continue;
    if (dest && !allowFarther && Math.hypot(nx - dest.x, ny - dest.y) > stayD + 1e-9) continue;
    const first = blocker.path[0];
    if (first && Math.round(first.x) === nx && Math.round(first.y) === ny) return true;
    if (blocker.path.length) blocker.path.unshift({ x: nx, y: ny });
    else blocker.path = [{ x: nx, y: ny }];
    return true;
  }
  return false;
}
