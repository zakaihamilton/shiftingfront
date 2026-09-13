import type { Vec2 } from "../../../types";
import { TILE_BLOCKED, TILE_WATER } from "../../../types";
import { idx, inBounds, neighbors8 } from "../terrain";
import type { MapAffordances } from "./types";

export function walkDistances(
  tiles: number[],
  heights: number[],
  width: number,
  height: number,
  start: Vec2,
): Int32Array {
  const distances = new Int32Array(width * height);
  distances.fill(-1);
  if (!inBounds(start.x, start.y, width, height)) return distances;
  const queue: Vec2[] = [{ x: Math.round(start.x), y: Math.round(start.y) }];
  distances[idx(queue[0]!.x, queue[0]!.y, width)] = 0;
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const currentDistance = distances[idx(current.x, current.y, width)]!;
    for (const next of neighbors8(current.x, current.y)) {
      if (!inBounds(next.x, next.y, width, height)) continue;
      const nextIndex = idx(next.x, next.y, width);
      if (distances[nextIndex] >= 0 || tiles[nextIndex] === TILE_WATER || tiles[nextIndex] === TILE_BLOCKED) continue;
      if (Math.abs((heights[nextIndex] ?? 1) - (heights[idx(current.x, current.y, width)] ?? 1)) > 1) continue;
      if (next.x !== current.x && next.y !== current.y) {
        const sideA = idx(next.x, current.y, width);
        const sideB = idx(current.x, next.y, width);
        if (tiles[sideA] === TILE_WATER || tiles[sideA] === TILE_BLOCKED || tiles[sideB] === TILE_WATER || tiles[sideB] === TILE_BLOCKED) continue;
      }
      distances[nextIndex] = currentDistance + 1;
      queue.push(next);
    }
  }
  return distances;
}

export function routeLength(points: Vec2[]): number {
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    length += Math.hypot(to.x - from.x, to.y - from.y);
  }
  return Math.round(length);
}

export function routeReachable(distances: Int32Array, width: number, points: Vec2[]): boolean {
  return points.every((point) => distances[idx(Math.round(point.x), Math.round(point.y), width)] >= 0);
}

function routeSeparation(first: Vec2[] | undefined, second: Vec2[] | undefined): number {
  if (!first?.length || !second?.length) return 0;
  let separation = 0;
  for (let sample = 0; sample <= 8; sample += 1) {
    const firstPoint = first[Math.min(first.length - 1, Math.round((sample / 8) * (first.length - 1)))]!;
    const secondPoint = second[Math.min(second.length - 1, Math.round((sample / 8) * (second.length - 1)))]!;
    separation = Math.max(separation, Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y));
  }
  return Math.round(separation * 10) / 10;
}

export function computeMapAffordances(
  distances: Int32Array,
  resourceAmount: number[],
  routePlans: Vec2[][],
  playerStart: Vec2,
  enemyStart: Vec2,
  mapWidth = Math.max(1, Math.round(Math.sqrt(resourceAmount.length))),
): MapAffordances {
  const resourceDistances = resourceAmount
    .map((amount, i) => (amount > 0 && distances[i]! >= 0 ? distances[i]! : -1))
    .filter((distance) => distance >= 0);
  const routeLengths = routePlans.map((route) => routeLength(route));
  const sortedRouteLengths = [...routeLengths].sort((a, b) => a - b);
  const axisX = enemyStart.x - playerStart.x;
  const axisY = enemyStart.y - playerStart.y;
  const axisLength = Math.hypot(axisX, axisY) || 1;
  const forwardResourceValue = resourceAmount.reduce((sum, amount, i) => {
    if (amount <= 0 || distances[i]! < 0) return sum;
    const x = i % mapWidth;
    const y = Math.floor(i / mapWidth);
    const projection = ((x - playerStart.x) * axisX + (y - playerStart.y) * axisY) / (axisLength * axisLength);
    return projection >= 0.42 ? sum + amount : sum;
  }, 0);
  return {
    routeLengths,
    baselineRouteLength: sortedRouteLengths[0] ?? 0,
    alternateRouteLength: sortedRouteLengths[1] ?? sortedRouteLengths[0] ?? 0,
    reachableResourceValue: resourceAmount.reduce(
      (sum, amount, i) => sum + (distances[i]! >= 0 ? amount : 0),
      0,
    ),
    nearestResourceDistance: resourceDistances.length ? Math.min(...resourceDistances) : 0,
    laneCount: routePlans.length,
    forwardResourceValue,
    routeSeparation: routeSeparation(routePlans[0], routePlans[1]),
  };
}
