import type { GeneratedMap } from "../../gen/map";
import { footprintOf } from "../../catalog";
import type { BuildingEntity, BuildingKind, SimState, Vec2 } from "../../types";
import { PATH_DIRS, diagonalCornerBlocked } from "../pathfinding";
import { canClimb, inBounds, isStaticWalkable, isWalkable } from "../world";
import { entitiesFor } from "../ecs/world";

/** Keep enemy objective structures well away from the allied starting base. */
export const OBJECTIVE_ALLIED_BASE_CLEARANCE = 18;

export function enemyApproachPoint(
  map: Pick<GeneratedMap, "playerStart" | "enemyStart" | "width" | "height">,
  distance: number,
  lateralOffset: number,
): Vec2 {
  const towardPlayer = {
    x: Math.sign(map.playerStart.x - map.enemyStart.x),
    y: Math.sign(map.playerStart.y - map.enemyStart.y),
  };
  const lateral = { x: -towardPlayer.y, y: towardPlayer.x };
  return {
    x: Math.max(2, Math.min(map.width - 3, Math.round(map.enemyStart.x + towardPlayer.x * distance + lateral.x * lateralOffset))),
    y: Math.max(2, Math.min(map.height - 3, Math.round(map.enemyStart.y + towardPlayer.y * distance + lateral.y * lateralOffset))),
  };
}

export function reachableScenarioCells(state: SimState): Uint8Array | undefined {
  const origin = entitiesFor(state).find((entity) => entity.owner === 0 && entity.class === "unit" && !entity.neutral);
  if (!origin) return undefined;

  const seen = new Uint8Array(state.width * state.height);
  const queue: Vec2[] = [{ x: Math.round(origin.x), y: Math.round(origin.y) }];
  const start = queue[0]!;
  seen[start.y * state.width + start.x] = 1;
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    for (const dir of PATH_DIRS) {
      const next = { x: current.x + dir.x, y: current.y + dir.y };
      if (!inBounds(state, next.x, next.y)) continue;
      const index = next.y * state.width + next.x;
      if (seen[index] || !isStaticWalkable(state, next.x, next.y)) continue;
      if (!canClimb(state, current.x, current.y, next.x, next.y)) continue;
      if (diagonalCornerBlocked(state, current.x, current.y, next.x, next.y)) continue;
      seen[index] = 1;
      queue.push(next);
    }
  }
  return seen;
}

export function reachableBuildingFilter(
  state: SimState,
  kind: BuildingKind,
  seen: Uint8Array | undefined,
): ((x: number, y: number) => boolean) | undefined {
  if (!seen) return undefined;
  const footprint = footprintOf(kind);
  return (x, y) => {
    for (let py = y - 1; py <= y + footprint.h; py++) {
      for (let px = x - 1; px <= x + footprint.w; px++) {
        const inside = px >= x && px < x + footprint.w && py >= y && py < y + footprint.h;
        if (inside || !inBounds(state, px, py) || !isStaticWalkable(state, px, py)) continue;
        if (seen[py * state.width + px] === 1) return true;
      }
    }
    return false;
  };
}

function footprintDistance(
  x: number,
  y: number,
  kind: BuildingKind,
  other: BuildingEntity,
): number {
  const footprint = footprintOf(kind);
  const otherFootprint = footprintOf(other.kind);
  const dx = x + footprint.w - 1 < other.x
    ? other.x - (x + footprint.w - 1)
    : other.x + otherFootprint.w - 1 < x
      ? x - (other.x + otherFootprint.w - 1)
      : 0;
  const dy = y + footprint.h - 1 < other.y
    ? other.y - (y + footprint.h - 1)
    : other.y + otherFootprint.h - 1 < y
      ? y - (other.y + otherFootprint.h - 1)
      : 0;
  return Math.hypot(dx, dy);
}

/**
 * Combines terrain reachability with a hard separation from the allied
 * starting base. The base list is captured before scenario targets are added
 * so multiple objectives are not treated as part of the base network.
 */
export function objectiveBuildingFilter(
  state: SimState,
  kind: BuildingKind,
  seen: Uint8Array | undefined,
  baseBuildings: ReadonlyArray<BuildingEntity> = entitiesFor(state).filter(
    (entity): entity is BuildingEntity =>
      entity.owner === 0 && entity.class === "building" && entity.hp > 0 && entity.kind !== "objective",
  ),
): ((x: number, y: number) => boolean) | undefined {
  const reachableFilter = reachableBuildingFilter(state, kind, seen);
  if (!reachableFilter && baseBuildings.length === 0) return undefined;
  return (x, y) =>
    (reachableFilter?.(x, y) ?? true) &&
    baseBuildings.every((building) => footprintDistance(x, y, kind, building) >= OBJECTIVE_ALLIED_BASE_CLEARANCE);
}

export function reachableScenarioPoint(
  state: SimState,
  desired: Vec2,
  seen?: Uint8Array,
  routeBand?: { start: Vec2; end: Vec2; min: number; max: number },
  allowed?: (x: number, y: number) => boolean,
): Vec2 {
  if (!seen) return desired;
  let best: Vec2 | undefined;
  let bestDistance = Infinity;
  let bestInBand: Vec2 | undefined;
  let bestInBandDistance = Infinity;
  const routeDx = (routeBand?.end.x ?? 0) - (routeBand?.start.x ?? 0);
  const routeDy = (routeBand?.end.y ?? 0) - (routeBand?.start.y ?? 0);
  const routeLengthSquared = routeDx * routeDx + routeDy * routeDy;
  const routeLength = Math.sqrt(routeLengthSquared);
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (!seen[y * state.width + x] || !isWalkable(state, x, y)) continue;
      if (allowed && !allowed(x, y)) continue;
      const distance = Math.hypot(x - desired.x, y - desired.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x, y };
      }
      if (!routeBand || routeLengthSquared === 0) continue;
      const fromStartX = x - routeBand.start.x;
      const fromStartY = y - routeBand.start.y;
      const progress = (fromStartX * routeDx + fromStartY * routeDy) / routeLengthSquared;
      const distanceFromStart = Math.hypot(fromStartX, fromStartY);
      if (progress < routeBand.min || progress > routeBand.max) continue;
      if (distanceFromStart < routeLength * routeBand.min || distanceFromStart > routeLength * routeBand.max) continue;
      if (distance < bestInBandDistance) {
        bestInBandDistance = distance;
        bestInBand = { x, y };
      }
    }
  }
  return bestInBand ?? best ?? desired;
}
