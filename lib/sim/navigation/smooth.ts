import type { Vec2 } from "../../types";
import type { StaticNavigation } from "../world/terrain";
import { navigationStepAllowed, navigationStepCost } from "./grid";

export type SmoothGridOptions = {
  /** Reject a shortcut that would enter this cell. */
  blocked?: (x: number, y: number) => boolean;
  /** Multiplier for entering a cell. Omitted terrain costs 1. */
  cellCost?: (x: number, y: number) => number;
  /**
   * Tile step already being followed. The first shortcut keeps this heading
   * when it is one of the two equal-cost legs to the goal.
   */
  approach?: Vec2;
};

/**
 * Replace stair-step detours with a direct grid line.
 *
 * An open shortcut changes direction at most once. Its long leg is the 8-way
 * heading closest to the destination, unless the unit is already walking the
 * other equal-cost leg. A line that is blocked, cuts a corner, or costs more
 * than the original segment is left alone. The result stays on adjacent tiles.
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
    const segmentApproach = smoothed.length === 0 ? options?.approach : undefined;
    for (let probe = path.length - 1; probe > index; probe -= 1) {
      const goal = path[probe]!;
      const budget = segmentCost(anchorX, anchorY, path, index, probe, options?.cellCost);
      const line = chooseLine(navigation, anchorX, anchorY, goal.x, goal.y, budget, options, segmentApproach);
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
  options: SmoothGridOptions | undefined,
  approach: Vec2 | undefined,
): Vec2[] | undefined {
  const heading = headingGroupedGridLine(x0, y0, x1, y1);
  const alternate = groupedGridLine(x0, y0, x1, y1, !prefersDiagonalLeg(x1 - x0, y1 - y0));
  const continued = approach ? continuedGroupedGridLine(x0, y0, x1, y1, approach) : undefined;
  const candidates = continued ? [continued, heading, alternate] : [heading, alternate];
  for (const candidate of candidates) {
    const accepted = acceptLine(navigation, x0, y0, x1, y1, candidate, budget, options);
    if (accepted) return accepted;
  }
  return undefined;
}

/** Tan of 22.5°. A shallower angle is closer to the cardinal leg than the diagonal. */
const DIAGONAL_HEADING_RATIO = Math.SQRT2 - 1;

function prefersDiagonalLeg(dx: number, dy: number): boolean {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx === 0 || ady === 0) return false;
  return Math.min(adx, ady) > Math.max(adx, ady) * DIAGONAL_HEADING_RATIO;
}

/**
 * One turn, with the longer run on the 8-way heading closest to the goal.
 * A unit ordered mostly east walks east, then turns once for the diagonal.
 */
function headingGroupedGridLine(x0: number, y0: number, x1: number, y1: number): Vec2[] {
  return groupedGridLine(x0, y0, x1, y1, prefersDiagonalLeg(x1 - x0, y1 - y0));
}

/**
 * One turn that starts with the step the unit is already taking, when that
 * step is one of the two equal-cost legs. Otherwise there is no continuation.
 */
function continuedGroupedGridLine(x0: number, y0: number, x1: number, y1: number, approach: Vec2): Vec2[] | undefined {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const diagonal = approach.x === sx && approach.y === sy && sx !== 0 && sy !== 0;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const cardinal = adx >= ady
    ? approach.x === sx && approach.y === 0 && sx !== 0
    : approach.x === 0 && approach.y === sy && sy !== 0;
  if (!diagonal && !cardinal) return undefined;
  if (adx === 0 || ady === 0) return groupedGridLine(x0, y0, x1, y1, false);
  return groupedGridLine(x0, y0, x1, y1, diagonal);
}

/** One turn: either the diagonal run or the straight cardinal run comes first. */
export function groupedGridLine(x0: number, y0: number, x1: number, y1: number, diagonalFirst = false): Vec2[] {
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
  const cardinalCount = Math.abs(dx - dy);
  const diagonalCount = Math.min(dx, dy);
  const cardinalX = dx >= dy ? sx : 0;
  const cardinalY = dx >= dy ? 0 : sy;
  if (diagonalFirst) {
    push(sx, sy, diagonalCount);
    push(cardinalX, cardinalY, cardinalCount);
  } else {
    push(cardinalX, cardinalY, cardinalCount);
    push(sx, sy, diagonalCount);
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
