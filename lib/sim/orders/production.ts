import { BUILDING_DEFINITIONS, MAX_PRODUCTION_QUEUE, UNIT_STATS, isUnitAvailable, productionQueueSize } from "../../catalog";
import { type BuildingKind, type Entity, type SimEvent, type SimState, type UnitKind } from "../../types";
import { byId, powerFor } from "../world";
import { entitiesFor } from "../ecs/world";

export function startProduce(state: SimState, fromId: number, unit: UnitKind): SimEvent[] {
  if (!isUnitAvailable(unit, state.missionIndex)) return [{ type: "commandRejected", reason: "unit unavailable" }];
  const b = byId(state, fromId);
  if (!b || b.class !== "building" || b.owner !== 0 || b.constructing > 0) return [{ type: "commandRejected", reason: "producer unavailable" }];
  if (!BUILDING_DEFINITIONS[b.kind as BuildingKind].production?.includes(unit)) return [{ type: "commandRejected", reason: "wrong producer" }];
  if (!b.queue) b.queue = [];
  if (b.kind === "runway" && (
    b.assignedPlaneId !== undefined ||
    b.producing !== undefined ||
    b.queue.length > 0
  )) return [{ type: "commandRejected", reason: "runway already assigned" }];
  if (productionQueueSize(b) >= MAX_PRODUCTION_QUEUE) return [{ type: "commandRejected", reason: "production queue full" }];
  const stats = UNIT_STATS[unit];
  if (state.credits[0] < stats.cost) return [{ type: "commandRejected", reason: "insufficient credits" }];
  if (powerFor(state, 0) < 0) return [{ type: "commandRejected", reason: "power shortage" }];
  state.credits[0] -= stats.cost;
  if (!b.producing) {
    b.producing = { kind: unit, remaining: stats.buildTicks };
  } else {
    b.queue.push(unit);
  }
  return [];
}

export function cancelProduce(state: SimState, unit: UnitKind): SimEvent[] {
  let queued: { entity: Entity; index: number } | undefined;
  let producing: Entity | undefined;
  for (const e of entitiesFor(state)) {
    if (e.hp <= 0 || e.owner !== 0 || e.class !== "building" || e.constructing > 0) continue;
    if (!e.queue) e.queue = [];
    for (let i = e.queue.length - 1; i >= 0; i--) {
      if (e.queue[i] === unit) {
        queued = { entity: e, index: i };
        break;
      }
    }
    if (e.producing?.kind === unit) producing = e;
  }
  if (queued) {
    queued.entity.queue.splice(queued.index, 1);
    state.credits[0] += UNIT_STATS[unit].cost;
    return [];
  }
  if (!producing?.producing) return [];
  state.credits[0] += UNIT_STATS[unit].cost;
  const next = producing.queue.shift();
  producing.producing = next
    ? { kind: next, remaining: UNIT_STATS[next].buildTicks }
    : undefined;
  return [];
}
