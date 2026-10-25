import type { Vec2 } from "../../types";
import type { StaticNavigation } from "../world/terrain";
import { navigationStepAllowed, navigationStepCost } from "./grid";

export type SmoothGridOptions = {
  /** Reject a shortcut that would enter this cell. */
  blocked?: (x: number, y: number) => boolean;
  /** Multiplier for entering a cell. Omitted terrain costs 1. */
  cellCost?: (x: number, y: number) => number;
};

/**
 * Replace stair-step detours with a direct grid line.
 *
 * The long leg follows the dominant axis, then one diagonal run finishes the
 * shortcut, so an open route changes direction at most once. A line that is
 * blocked, cuts a corner, or costs more than the original segment is left
 * alone. The result stays on adjacent tiles.
 */
export function smoothGridPath(
  navigation: StaticNavigation,
  start: Vec2,
  path: readonly Vec2[],
  options?: SmoothGridOptions,
): Vec2[] {
  if (path.length <= 1) return path.slice();
  const smoothed: Vec2[] = [];
  let anchorX = start.x;
  let anchorY = start.y;
  let index = 0;
  if (!anchorUsable(navigation, anchorX, anchorY, options?.blocked)) {
    const first = path[0]!;
    smoothed.push(first);
    anchorX = first.x;
    anchorY = first.y;
    index = 1;
  }

  while (index < path.length) {
    let chosen = -1;
    let chosenLine: Vec2[] | undefined;
    for (let probe = path.length - 1; probe > index; probe -= 1) {
      const goal = path[probe]!;
      const budget = segmentCost(anchorX, anchorY, path, index, probe, options?.cellCost);
      const line = chooseLine(navigation, anchorX, anchorY, goal.x, goal.y, budget, options);
      if (!line) continue;
      chosen = probe;
      chosenLine = line;
      break;
    }
    if (chosenLine && chosen >= index) {
      smoothed.push(...chosenLine);
      const last = chosenLine[chosenLine.length - 1]!;
      anchorX = last.x;
      anchorY = last.y;
      index = chosen + 1;
      continue;
    }
    const step = path[index]!;
    smoothed.push(step);
    anchorX = step.x;
    anchorY = step.y;
    index += 1;
  }
  return smoothed;
}

function anchorUsable(
  navigation: StaticNavigation,
  x: number,
  y: number,
  blocked?: (x: number, y: number) => boolean,
): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x >= navigation.width || y >= navigation.height) return false;
  if (navigation.walkable[y * navigation.width + x] !== 1) return false;
  return !blocked?.(x, y);
}

function segmentCost(
  anchorX: number,
  anchorY: number,
  path: readonly Vec2[],
  from: number,
  to: number,
  cellCost?: (x: number, y: number) => number,
): number {
  let cost = 0;
  let x = anchorX;
  let y = anchorY;
  for (let index = from; index <= to; index += 1) {
    const step = path[index]!;
    cost += navigationStepCost(x, y, step.x, step.y, cellCost?.(step.x, step.y) ?? 1);
    x = step.x;
    y = step.y;
  }
  return cost;
}

function chooseLine(
  navigation: StaticNavigation,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  budget: number,
  options?: SmoothGridOptions,
): Vec2[] | undefined {
  const grouped = acceptLine(navigation, x0, y0, x1, y1, groupedGridLine(x0, y0, x1, y1), budget, options);
  if (grouped) return grouped;
  return acceptLine(navigation, x0, y0, x1, y1, huggingGridLine(x0, y0, x1, y1), budget, options);
}

/** Dominant axis first, then the diagonal remainder. At most one turn. */
export function groupedGridLine(x0: number, y0: number, x1: number, y1: number): Vec2[] {
  const sx = Math.sign(x1 - x0);
  const sy = Math.sign(y1 - y0);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const line: Vec2[] = [];
  let x = x0;
  let y = y0;
  const push = (stepX: number, stepY: number, count: number) => {
    for (let i = 0; i < count; i += 1) {
      x += stepX;
      y += stepY;
      line.push({ x, y });
    }
  };
  if (dx >= dy) push(sx, 0, dx - dy);
  else push(0, sy, dy - dx);
  push(sx, sy, Math.min(dx, dy));
  return line;
}

/** Adjacent steps that stay beside the geometric line, including diagonals. */
export function huggingGridLine(x0: number, y0: number, x1: number, y1: number): Vec2[] {
  const line: Vec2[] = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : x0 > x1 ? -1 : 0;
  const sy = y0 < y1 ? 1 : y0 > y1 ? -1 : 0;
  let err = dx - dy;
  const limit = dx + dy + 1;
  for (let guard = 0; guard < limit && (x !== x1 || y !== y1); guard += 1) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    line.push({ x, y });
  }
  return line;
}

function acceptLine(
  navigation: StaticNavigation,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps: readonly Vec2[],
  budget: number,
  options?: SmoothGridOptions,
): Vec2[] | undefined {
  if (steps.length === 0) return undefined;
  const last = steps[steps.length - 1]!;
  if (last.x !== x1 || last.y !== y1) return undefined;
  let cost = 0;
  let x = x0;
  let y = y0;
  for (const step of steps) {
    if (Math.max(Math.abs(step.x - x), Math.abs(step.y - y)) !== 1) return undefined;
    if (options?.blocked?.(step.x, step.y)) return undefined;
    if (!navigationStepAllowed(navigation, x, y, step.x, step.y)) return undefined;
    if (step.x !== x && step.y !== y && options?.blocked) {
      if (options.blocked(step.x, y) || options.blocked(x, step.y)) return undefined;
    }
    cost += navigationStepCost(x, y, step.x, step.y, options?.cellCost?.(step.x, step.y) ?? 1);
    if (cost > budget + 1e-6) return undefined;
    x = step.x;
    y = step.y;
  }
  return steps.slice();
}
