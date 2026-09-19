import { BUILDING_DEFINITIONS, BUILDING_KINDS, MAX_PRODUCTION_QUEUE, isUnitAvailable, producerFor, productionQueueSize } from "@/lib/catalog";
import type { BuildingKind, Entity, SimState, UnitKind } from "@/lib/types";

export const PLACEABLE: BuildingKind[] = BUILDING_KINDS.filter(
  (kind) => BUILDING_DEFINITIONS[kind].aiRole !== "base" && BUILDING_DEFINITIONS[kind].aiRole !== "objective",
);
export const PRODUCIBLE: UnitKind[] = ["infantry", "antiArmor", "harvester", "tank", "medic", "repairTruck", "strikePlane"];

export function leastLoadedProducer(state: SimState, owner: 0 | 1, unit: UnitKind): Entity | undefined {
  if (!isUnitAvailable(unit, state.missionIndex)) return undefined;
  const kind = producerFor(unit);
  let best: Entity | undefined;
  let bestN = Infinity;
  for (const entity of state.entities) {
    if (entity.hp <= 0 || entity.owner !== owner || entity.class !== "building" || entity.kind !== kind || entity.constructing > 0) continue;
    if (kind === "runway" && (
      entity.assignedPlaneId !== undefined ||
      entity.producing !== undefined ||
      entity.queue.length > 0
    )) continue;
    const queued = productionQueueSize(entity);
    if (queued >= MAX_PRODUCTION_QUEUE) continue;
    if (queued < bestN) {
      best = entity;
      bestN = queued;
    }
  }
  return best;
}
