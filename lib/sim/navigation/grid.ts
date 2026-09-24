import type { SimState, Vec2 } from "../../types";
import { staticNavigationFor } from "../world";

export const PATH_MAX_NODES = 4096;

export const PATH_DIRS: Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

/** Whether a candidate step turns back against the unit's last tile-to-tile move. */
export function reversesPreviousStep(
  width: number,
  currentX: number,
  currentY: number,
  nextX: number,
  nextY: number,
  previousCell?: number,
): boolean {
  if (previousCell === undefined) return false;
  const previousX = previousCell % width;
  const previousY = Math.floor(previousCell / width);
  const incomingX = currentX - previousX;
  const incomingY = currentY - previousY;
  if (incomingX === 0 && incomingY === 0) return false;
  if (Math.max(Math.abs(incomingX), Math.abs(incomingY)) > 1) return false;
  const outgoingX = nextX - currentX;
  const outgoingY = nextY - currentY;
  return incomingX * outgoingX + incomingY * outgoingY < 0;
}

export function inBoundsNavigation(navigation: ReturnType<typeof staticNavigationFor>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < navigation.width && y < navigation.height;
}

/** Cost used by A* and reverse flow fields for one terrain step. */
export function navigationStepCost(x0: number, y0: number, x1: number, y1: number, destinationCost = 1): number {
  return (x0 !== x1 && y0 !== y1 ? Math.SQRT2 : 1) * destinationCost;
}

/** Stable key for a directed grid edge in a per-tick reservation table. */
export function navigationEdgeKey(
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const size = width * height;
  return (y0 * width + x0) * size + (y1 * width + x1);
}

/** Whether either direction of an edge is already reserved by another unit. */
export function navigationEdgeReserved(
  reservations: Map<number, number> | undefined,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ignoreId?: number,
): boolean {
  if (!reservations) return false;
  const forward = reservations.get(navigationEdgeKey(width, height, x0, y0, x1, y1));
  if (forward !== undefined && forward !== ignoreId) return true;
  const reverse = reservations.get(navigationEdgeKey(width, height, x1, y1, x0, y0));
  return reverse !== undefined && reverse !== ignoreId;
}

/**
 * The single source of truth for a static terrain transition. Movement,
 * A*, and flow fields must all agree about cliffs and diagonal corners.
 */
export function navigationStepAllowed(
  navigation: ReturnType<typeof staticNavigationFor>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  if (!inBoundsNavigation(navigation, x0, y0) || !inBoundsNavigation(navigation, x1, y1)) return false;
  if (navigation.walkable[y0 * navigation.width + x0] !== 1) return false;
  if (navigation.walkable[y1 * navigation.width + x1] !== 1) return false;
  if (Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) !== 1) return false;
  if (Math.abs(navigation.heights[y1 * navigation.width + x1]! - navigation.heights[y0 * navigation.width + x0]!) > 1) return false;
  if (x0 === x1 || y0 === y1) return true;
  if (navigation.walkable[y0 * navigation.width + x1] !== 1) return false;
  if (Math.abs(navigation.heights[y0 * navigation.width + x1]! - navigation.heights[y0 * navigation.width + x0]!) > 1) return false;
  if (navigation.walkable[y1 * navigation.width + x0] !== 1) return false;
  if (Math.abs(navigation.heights[y1 * navigation.width + x0]! - navigation.heights[y0 * navigation.width + x0]!) > 1) return false;
  return true;
}

export function diagonalCornerBlockedLocal(
  navigation: ReturnType<typeof staticNavigationFor>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx === 0 || dy === 0) return false;
  if (!inBoundsNavigation(navigation, x0 + dx, y0) || navigation.walkable[y0 * navigation.width + x0 + dx] !== 1) return true;
  if (Math.abs(navigation.heights[y0 * navigation.width + x0 + dx]! - navigation.heights[y0 * navigation.width + x0]!) > 1) return true;
  if (!inBoundsNavigation(navigation, x0, y0 + dy) || navigation.walkable[(y0 + dy) * navigation.width + x0] !== 1) return true;
  if (Math.abs(navigation.heights[(y0 + dy) * navigation.width + x0]! - navigation.heights[y0 * navigation.width + x0]!) > 1) return true;
  return false;
}

export function diagonalCornerBlocked(state: SimState, x0: number, y0: number, x1: number, y1: number): boolean {
  const navigation = staticNavigationFor(state);
  return diagonalCornerBlockedLocal(navigation, x0, y0, x1, y1);
}
