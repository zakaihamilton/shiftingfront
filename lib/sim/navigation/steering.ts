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
  let target = e.path[0]!;
  const navigation = staticNavigationFor(state);
  const currentCell = cellOf(state, e.x, e.y);
  const currentX = currentCell % state.width;
  const currentY = Math.floor(currentCell / state.width);
  const targetX = Math.round(target.x);
  const targetY = Math.round(target.y);
  let splitDiagonal = false;
  if (Math.abs(targetX - currentX) === 1 && Math.abs(targetY - currentY) === 1) {
    const candidates = [
      { x: targetX, y: currentY },
      { x: currentX, y: targetY },
    ];
    const intermediate = candidates.find((candidate) =>
      navigationStepAllowed(navigation, currentX, currentY, candidate.x, candidate.y) &&
      navigationStepAllowed(navigation, candidate.x, candidate.y, targetX, targetY) &&
      !navigationEdgeReserved(edgeReservations, state.width, state.height, currentX, currentY, candidate.x, candidate.y) &&
      tileFree(state, occupancy, reserved, e, candidate.x, candidate.y),
    );
    if (intermediate) {
      target = intermediate;
      splitDiagonal = true;
    }
  }
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const distance = Math.hypot(dx, dy);
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
