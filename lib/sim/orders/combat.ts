import { UNIT_STATS, isAirUnit, isSupportUnit } from "../../catalog";
import { isUnitEntity, type Formation, type SimEvent, type SimState } from "../../types";
import { findPathDetailed, routePendingFor } from "../pathfinding";
import { FOREGROUND_PATH_MAX_NODES, FOREGROUND_PATHS_PER_ORDER } from "../pathBudget";
import { byId, closestApproach } from "../world";
import { assignSupportTarget, canSupportEntity } from "../support";
import { launchAircraft } from "../aircraft";
import { directFireRangeBonusAt } from "../terrainRules";

export function attackUnits(state: SimState, ids: number[], targetId: number): SimEvent[] {
  const target = byId(state, targetId);
  if (!target || target.owner !== 1 || target.neutral) return [{ type: "commandRejected", reason: "invalid attack target" }];
  let searches = 0;
  for (const id of ids) {
    const e = byId(state, id);
    if (!e || !isUnitEntity(e) || e.owner !== 0 || e.neutral) continue;
    if (e.kind === "harvester" || isSupportUnit(e.kind)) continue;
    if (isAirUnit(e.kind)) launchAircraft(state, e);
    e.attackTarget = targetId;
    e.flowGoal = undefined;
    e.orderMode = "attack";
    e.orderDestination = { x: target.x, y: target.y };
    e.gatherX = undefined;
    e.gatherY = undefined;
    e.routePending = false;
    e.landingRunwayId = undefined;
    e.idle = false;
    const range = UNIT_STATS[e.kind].range + directFireRangeBonusAt(state, e);
    const dest = target.class === "building" ? closestApproach(state, e, target) : target;
    if (Math.hypot(e.x - dest.x, e.y - dest.y) > range) {
      if (isAirUnit(e.kind)) {
        e.path = [];
        continue;
      }
      if (searches < FOREGROUND_PATHS_PER_ORDER) {
        const result = findPathDetailed(state, e, dest, { maxNodes: FOREGROUND_PATH_MAX_NODES });
        e.path = result.path;
        e.routePending = routePendingFor(result.status);
        searches += 1;
      } else {
        e.path = [];
        e.routePending = true;
      }
    }
  }
  return [];
}

export function supportUnits(state: SimState, ids: number[], targetId: number): SimEvent[] {
  const target = byId(state, targetId);
  if (!target || target.owner !== 0 || target.class !== "unit" || target.neutral) {
    return [{ type: "commandRejected", reason: "invalid support target" }];
  }
  let assigned = 0;
  for (const id of ids) {
    const provider = byId(state, id);
    if (!provider || !isUnitEntity(provider) || provider.owner !== 0 || provider.neutral) continue;
    if (!isSupportUnit(provider.kind) || !canSupportEntity(provider, target)) continue;
    assignSupportTarget(state, provider, target);
    assigned += 1;
  }
  return assigned ? [] : [{ type: "commandRejected", reason: "no eligible support unit" }];
}

export function setStance(state: SimState, ids: number[], stance: "aggressive" | "defensive" | "hold"): SimEvent[] {
  for (const id of ids) {
    const e = byId(state, id);
    if (e?.owner === 0 && e.class === "unit") e.stance = stance;
  }
  return [];
}

export function setFormation(state: SimState, ids: number[], formation: Formation): SimEvent[] {
  for (const id of ids) {
    const e = byId(state, id);
    if (e?.owner === 0 && e.class === "unit") e.formation = formation;
  }
  return [];
}
