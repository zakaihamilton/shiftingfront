import type { GeneratedMap } from "../../gen/map";
import { OBJECTIVE_ZONE_RADIUS } from "../../types";
import type { SimState, Vec2 } from "../../types";
import { tryFindPathDetailed } from "../pathBudget";
import { findPathDetailed, routePendingFor } from "../pathfinding";
import { distToEntity, isStaticWalkable } from "../world";
import { reachableScenarioPoint } from "./reachability";
import { entitiesFor } from "../ecs/world";

export function convoyStartPoint(
  map: Pick<GeneratedMap, "playerStart" | "width" | "height">,
  index: number,
): Vec2 {
  const offsets = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: 1, y: -1 },
  ];
  const offset = offsets[index % offsets.length]!;
  const anchorX = Math.round(map.playerStart.x);
  const anchorY = Math.round(map.playerStart.y);
  return {
    x: Math.max(2, Math.min(map.width - 3, anchorX + offset.x)),
    y: Math.max(2, Math.min(map.height - 3, anchorY + offset.y)),
  };
}

export function convoyZonePoint(
  state: SimState,
  map: Pick<GeneratedMap, "playerStart" | "enemyStart">,
  contested: boolean,
  seen?: Uint8Array,
): Vec2 {
  const routeT = contested ? 0.66 : 0.72;
  const desired = {
    x: Math.round(map.playerStart.x + (map.enemyStart.x - map.playerStart.x) * routeT),
    y: Math.round(map.playerStart.y + (map.enemyStart.y - map.playerStart.y) * routeT),
  };
  return reachableScenarioPoint(state, desired, seen, {
    start: map.playerStart,
    end: map.enemyStart,
    min: routeT - 0.08,
    max: routeT + 0.08,
  });
}

export function convoyDestination(state: SimState, zone: Vec2, index: number): Vec2 {
  const enemyBase = entitiesFor(state).filter((entity) => entity.owner === 1 && entity.class === "building" && entity.hp > 0);
  const candidates: Array<{ point: Vec2; zoneDistance: number; baseDistance: number }> = [];
  for (let y = zone.y - OBJECTIVE_ZONE_RADIUS; y <= zone.y + OBJECTIVE_ZONE_RADIUS; y++) {
    for (let x = zone.x - OBJECTIVE_ZONE_RADIUS; x <= zone.x + OBJECTIVE_ZONE_RADIUS; x++) {
      const zoneDistance = Math.hypot(x - zone.x, y - zone.y);
      if (zoneDistance < OBJECTIVE_ZONE_RADIUS - 1.5 || zoneDistance > OBJECTIVE_ZONE_RADIUS || !isStaticWalkable(state, x, y)) continue;
      const baseDistance = enemyBase.length
        ? Math.min(...enemyBase.map((building) => distToEntity({ x, y }, building)))
        : Infinity;
      if (baseDistance < 2.5) continue;
      candidates.push({ point: { x, y }, zoneDistance, baseDistance });
    }
  }
  candidates.sort((a, b) => b.baseDistance - a.baseDistance || b.zoneDistance - a.zoneDistance || a.point.y - b.point.y || a.point.x - b.point.x);
  const convoyId = state.runtime?.kind === "escort" ? state.runtime.targetIds[index] : undefined;
  const convoy = convoyId === undefined ? undefined : entitiesFor(state).find((entity) => entity.id === convoyId && entity.hp > 0);
  if (convoy && candidates.length) {
    // Keep the stable perimeter ordering, but skip a candidate that is not
    // reachable from this convoy's staging cell. This closes a rare generated
    // map trap where one of several identical trucks could never finish the
    // otherwise valid escort route.
    for (let offset = 0; offset < candidates.length; offset++) {
      const candidate = candidates[(index + offset) % candidates.length]!;
      if (findPathDetailed(state, convoy, candidate.point).status === "complete") return candidate.point;
    }
  }
  return candidates[index % candidates.length]?.point ?? zone;
}

export function tickEscort(state: SimState): void {
  const runtime = state.runtime;
  if (!runtime || runtime.kind !== "escort") return;

  if (runtime.convoyStartTick !== undefined && state.tick >= runtime.convoyStartTick) {
    for (const [index, id] of runtime.targetIds.entries()) {
      const convoy = entitiesFor(state).find((entity) => entity.id === id && entity.hp > 0);
      if (convoy?.scenarioRole === "convoy" && convoy.neutral) {
        const destination = convoyDestination(state, runtime.zone!, index);
        convoy.orderDestination = destination;
        const result = tryFindPathDetailed(state, convoy, destination);
        if (result) {
          convoy.path = result.path;
          convoy.routePending = routePendingFor(result.status);
        } else {
          convoy.path = [];
          convoy.routePending = true;
        }
      }
    }
    delete runtime.convoyStartTick;
  }
}
