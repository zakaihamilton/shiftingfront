import { BUILDING_STATS, footprintOf } from "../catalog";
import { toIsometricFacing } from "../iso";
import type { BuildingKind, Entity, Facing, SimState } from "../types";

export function entityVariant(state: SimState, e: Entity): number {
  return ((state.seed * 2654435761) ^ (e.id * 2246822519)) >>> 0;
}

export function constructionStage(e: Entity): 0 | 1 | 2 | 3 {
  if (e.constructing <= 0 || e.class !== "building") return 3;
  const total = BUILDING_STATS[e.kind as BuildingKind].buildTicks || 1;
  return Math.max(0, Math.min(2, Math.floor((1 - e.constructing / total) * 3))) as 0 | 1 | 2;
}

export function depthOf(e: Entity): number {
  if (e.class === "building") {
    const fp = footprintOf(e.kind as BuildingKind);
    return e.x + fp.w - 1 + (e.y + fp.h - 1);
  }
  return e.x + e.y;
}

// Parked aircraft share the runway's ground elevation, so keep their sprite
// above the runway in the painter's order while preserving normal depth order
// for aircraft in flight.
export const SERVICING_AIRCRAFT_DEPTH_BIAS = 3;

export function renderDepthOf(e: Entity, position?: { x: number; y: number }): number {
  const depth = e.class === "unit" && position ? position.x + position.y : depthOf(e);
  return e.class === "unit" && e.kind === "strikePlane" && e.flightState === "servicing"
    ? depth + SERVICING_AIRCRAFT_DEPTH_BIAS
    : depth;
}

export function facingFor(state: SimState, e: Entity, entityById: Map<number, Entity>, from?: { x: number; y: number }): Facing {
  const x = from?.x ?? e.x;
  const y = from?.y ?? e.y;
  let target: { x: number; y: number } | undefined;
  if (!(e.class === "unit" && e.kind === "strikePlane" && e.flightState === "servicing") && e.attackTarget !== undefined) {
    target = entityById.get(e.attackTarget);
  }
  if (!target && e.path.length) target = e.path[0];
  if (target) {
    const dx = target.x - x;
    const dy = target.y - y;
    if (Math.hypot(dx, dy) > 0.2) return toIsometricFacing(dx, dy);
  }
  return e.facing ?? ((e.owner === 0 ? 0 : 4) as Facing);
}
