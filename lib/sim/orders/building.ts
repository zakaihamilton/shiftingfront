import { BUILDING_DEFINITIONS, BUILDING_STATS, buildingLimitReached, sellRefundFor } from "../../catalog";
import { isBuildingEntity, type BuildingKind, type Entity, type SimEvent, type SimState } from "../../types";
import { byId, canPlaceBuilding, inBounds, invalidateEntityCaches, invalidateNavigation, isStaticWalkable, spawnBuilding, terrainAccess } from "../world";
import { canRepair } from "../repair";
import { canSell } from "../sell";
import { refundQueuedUnits } from "../productionRefund";

export { refundQueuedUnits };

export function startBuild(state: SimState, kind: BuildingKind, x: number, y: number): SimEvent[] {
  if (kind === "constructionYard" || kind === "objective") return [{ type: "commandRejected", reason: "invalid building" }];
  if (buildingLimitReached(state.entities, 0, kind)) return [{ type: "commandRejected", reason: "building limit reached" }];
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (!canPlaceBuilding(state, kind, tx, ty)) return [{ type: "commandRejected", reason: "invalid placement" }];
  const yard = state.entities.find(
    (e) => e.owner === 0 && e.kind === "constructionYard" && e.hp > 0 && e.constructing === 0,
  );
  if (!yard) return [{ type: "commandRejected", reason: "construction yard unavailable" }];
  const cost = BUILDING_STATS[kind].cost;
  if (state.credits[0] < cost) return [{ type: "commandRejected", reason: "insufficient credits" }];
  state.credits[0] -= cost;
  spawnBuilding(state, 0, kind, tx, ty, BUILDING_STATS[kind].buildTicks);
  return [];
}

export function cancelBuild(state: SimState, kind: BuildingKind): SimEvent[] {
  if (kind === "constructionYard" || kind === "objective") return [];
  let target: Entity | undefined;
  for (const e of state.entities) {
    if (e.hp <= 0 || e.owner !== 0 || e.class !== "building") continue;
    if (e.kind !== kind || e.constructing <= 0) continue;
    target = e;
  }
  if (!target) return [];
  target.hp = 0;
  invalidateEntityCaches(state);
  target.constructing = 0;
  invalidateNavigation(state, target.id);
  state.credits[0] += BUILDING_STATS[kind].cost;
  return [];
}

export function toggleRepair(state: SimState, buildingId: number): SimEvent[] {
  const e = byId(state, buildingId);
  if (!e || e.class !== "building" || e.owner !== 0) return [];
  if (e.repairing) {
    e.repairing = false;
    return [];
  }
  if (!canRepair(e)) return [];
  e.repairing = true;
  return [{ type: "repairStarted", x: e.x, y: e.y }];
}

export function setRallyPoint(state: SimState, buildingId: number, x: number, y: number): SimEvent[] {
  const building = byId(state, buildingId);
  if (
    !building ||
    !isBuildingEntity(building) ||
    building.hp <= 0 ||
    building.owner !== 0 ||
    building.constructing > 0 ||
    !BUILDING_DEFINITIONS[building.kind].production
  ) {
    return [{ type: "commandRejected", reason: "rally unavailable" }];
  }

  const tx = Math.round(x);
  const ty = Math.round(y);
  if (!inBounds(state, tx, ty) || !terrainAccess(state, tx, ty).traversable || !isStaticWalkable(state, tx, ty)) {
    return [{ type: "commandRejected", reason: "invalid rally target" }];
  }
  building.rallyPoint = { x: tx, y: ty };
  return [];
}

export function sellBuilding(state: SimState, buildingId: number): SimEvent[] {
  const e = byId(state, buildingId);
  if (!e || !isBuildingEntity(e) || e.owner !== 0 || !canSell(e)) return [];
  refundQueuedUnits(state, e);
  state.credits[0] += sellRefundFor(e.kind, e.hp);
  e.hp = 0;
  invalidateEntityCaches(state);
  e.repairing = false;
  invalidateNavigation(state, e.id);
  state.losses.buildings[0] += 1;
  return [{ type: "sold", id: e.id, kind: e.kind, x: e.x, y: e.y }];
}
