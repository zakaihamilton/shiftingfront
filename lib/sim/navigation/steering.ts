import { toIsometricFacing } from "../../iso";
import type { SimState, UnitEntity } from "../../types";
import { staticNavigationFor } from "../world";
import { cellOf, tileFree } from "./avoidance";
import { navigationEdgeReserved, navigationStepAllowed } from "./grid";

export function advanceAlongPath(
  state: SimState,
  occupancy: Uint8Array,
  reserved: Map<number, number>,
  e: UnitEntity,
  speed: number,
  edgeReservations?: Map<number, number>,
): void {
  if (!e.path.length) return;
  const navigation = staticNavigationFor(state);
  const currentCell = cellOf(state, e.x, e.y);
  const currentX = currentCell % state.width;
  const currentY = Math.floor(currentCell / state.width);
  const waypoint = e.path[0]!;
  const waypointX = Math.round(waypoint.x);
  const waypointY = Math.round(waypoint.y);
  // Screen up, down, left, and right are diagonal tile steps. Walk those
  // directly when the straight line stays inside the two tiles. An off-center
  // line that would round into a third tile steps onto an open cardinal
  // neighbor instead of clipping that tile.
  let target = waypoint;
  let splitDiagonal = false;
  const diagonal = resolveDiagonalStep(
    state,
    occupancy,
    reserved,
    edgeReservations,
    navigation,
    e,
    currentX,
    currentY,
    waypoint,
    waypointX,
    waypointY,
  );
  if (diagonal.kind === "split") {
    target = diagonal.target;
    splitDiagonal = true;
  }
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const distance = Math.hypot(dx, dy);
  if (distance > 0.001) e.facing = toIsometricFacing(dx, dy);
  if (distance <= speed || distance < 0.05) {
    const currentX = Math.round(e.x);
    const currentY = Math.round(e.y);
    const targetX = Math.round(target.x);
    const targetY = Math.round(target.y);
    if (
      (currentX !== targetX || currentY !== targetY) &&
      !navigationStepAllowed(navigation, currentX, currentY, targetX, targetY)
    ) return;
    if (!tileFree(state, occupancy, reserved, e, target.x, target.y)) return;
    e.x = target.x;
    e.y = target.y;
    if (!splitDiagonal) e.path.shift();
    return;
  }
  const nextX = e.x + (dx / distance) * speed;
  const nextY = e.y + (dy / distance) * speed;
  const nextCell = cellOf(state, nextX, nextY);
  if (nextCell !== currentCell) {
    const currentX = currentCell % state.width;
    const currentY = Math.floor(currentCell / state.width);
    const nextCellX = nextCell % state.width;
    const nextCellY = Math.floor(nextCell / state.width);
    if (!navigationStepAllowed(navigation, currentX, currentY, nextCellX, nextCellY)) return;
    if (!tileFree(state, occupancy, reserved, e, nextCellX, nextCellY)) return;
  }
  e.x = nextX;
  e.y = nextY;
}

type DiagonalResolution =
  | { kind: "direct" }
  | { kind: "split"; target: { x: number; y: number } };

function resolveDiagonalStep(
  state: SimState,
  occupancy: Uint8Array,
  reserved: Map<number, number>,
  edgeReservations: Map<number, number> | undefined,
  navigation: ReturnType<typeof staticNavigationFor>,
  e: UnitEntity,
  currentX: number,
  currentY: number,
  waypoint: { x: number; y: number },
  waypointX: number,
  waypointY: number,
): DiagonalResolution {
  if (Math.abs(waypointX - currentX) !== 1 || Math.abs(waypointY - currentY) !== 1) return { kind: "direct" };
  const laneClear = diagonalSegmentStaysInLane(
    e.x,
    e.y,
    waypoint.x,
    waypoint.y,
    currentX,
    currentY,
    waypointX,
    waypointY,
  );
  if (laneClear && directDiagonalOpen(
    edgeReservations,
    navigation,
    e,
    currentX,
    currentY,
    waypointX,
    waypointY,
  )) return { kind: "direct" };
  const candidates = [
    { x: waypointX, y: currentY },
    { x: currentX, y: waypointY },
  ];
  const intermediate = candidates.find((candidate) =>
    navigationStepAllowed(navigation, currentX, currentY, candidate.x, candidate.y) &&
    navigationStepAllowed(navigation, candidate.x, candidate.y, waypointX, waypointY) &&
    !navigationEdgeReserved(edgeReservations, state.width, state.height, currentX, currentY, candidate.x, candidate.y, e.id) &&
    tileFree(state, occupancy, reserved, e, candidate.x, candidate.y),
  );
  if (intermediate) return { kind: "split", target: intermediate };
  // No cardinal is open. Keep the diagonal; a blocked corner still stops the
  // step that would enter it.
  return { kind: "direct" };
}

/**
 * True when the straight segment only occupies the start tile and the
 * destination tile. A center-to-center diagonal crosses both grid lines at
 * the same instant and never travels through a corner tile. An off-center
 * segment that spends a real interval in a third tile returns false.
 */
function diagonalSegmentStaysInLane(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  startX: number,
  startY: number,
  destX: number,
  destY: number,
): boolean {
  const u0 = x0 + 0.5;
  const v0 = y0 + 0.5;
  const du = x1 - x0;
  const dv = y1 - y0;
  let cellX = Math.floor(u0);
  let cellY = Math.floor(v0);
  if (cellX !== startX || cellY !== startY) return false;
  if (startX === destX && startY === destY) return true;

  const stepX = du > 0 ? 1 : du < 0 ? -1 : 0;
  const stepY = dv > 0 ? 1 : dv < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? Math.abs(1 / du) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dv) : Infinity;
  let tMaxX = stepX > 0 ? (cellX + 1 - u0) / du : stepX < 0 ? (cellX - u0) / du : Infinity;
  let tMaxY = stepY > 0 ? (cellY + 1 - v0) / dv : stepY < 0 ? (cellY - v0) / dv : Infinity;

  for (let guard = 0; guard < 6; guard += 1) {
    const nextT = Math.min(tMaxX, tMaxY, 1);
    if (nextT >= 1 - 1e-12) {
      return (cellX === startX && cellY === startY) || (cellX === destX && cellY === destY);
    }
    // Crossings that land on the same grid point skip the corner tiles.
    const corner = Math.abs(tMaxX - tMaxY) <= 1e-8;
    if (corner) {
      cellX += stepX;
      cellY += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (tMaxX < tMaxY) {
      cellX += stepX;
      tMaxX += tDeltaX;
    } else {
      cellY += stepY;
      tMaxY += tDeltaY;
    }
    const inStart = cellX === startX && cellY === startY;
    const inDest = cellX === destX && cellY === destY;
    if (!inStart && !inDest) return false;
    if (inDest) return true;
  }
  return false;
}

function directDiagonalOpen(
  edgeReservations: Map<number, number> | undefined,
  navigation: ReturnType<typeof staticNavigationFor>,
  e: UnitEntity,
  currentX: number,
  currentY: number,
  waypointX: number,
  waypointY: number,
): boolean {
  return navigationStepAllowed(navigation, currentX, currentY, waypointX, waypointY)
    && !navigationEdgeReserved(
      edgeReservations,
      navigation.width,
      navigation.height,
      currentX,
      currentY,
      waypointX,
      waypointY,
      e.id,
    );
}
