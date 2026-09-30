import { isAirUnit, isDefensiveTurret, POWER_SHORTAGE_TURRET_RANGE_MULTIPLIER, repairCostFor, repairHpPerTick } from "../catalog";
import { isBuildingEntity, type Entity, type SimEvent, type SimState } from "../types";
import { canTarget, isCombatThreat, statsFor } from "./combat/grid";
import { heightRangeBonus, lineOfSight } from "./combat/targeting";
import { entitiesFor } from "./entities";
import { distToEntity, powerFor } from "./world";
import { directFireRangeBonusAt } from "./terrainRules";

export function canRepair(e: { class: string; hp: number; maxHp: number; constructing: number }): boolean {
  return e.class === "building" && e.hp > 0 && e.constructing === 0 && e.hp < e.maxHp;
}

const EMPTY_EVENTS: SimEvent[] = [];

function isUnderAttack(state: SimState, building: Entity): boolean {
  return entitiesFor(state).some((attacker) => {
    const firingAtBuilding = attacker.attackTarget === building.id ||
      (attacker.lastFiredTargetId === building.id && attacker.cooldown > 0);
    if (attacker.hp <= 0 || attacker.owner === building.owner || !firingAtBuilding ||
        !isCombatThreat(state, attacker) || !canTarget(attacker, building)) return false;
    const aircraft = attacker.class === "unit" && isAirUnit(attacker.kind);
    if (aircraft && (attacker.flightState === "servicing" || attacker.landingRunwayId !== undefined || (attacker.ammo ?? 0) <= 0)) return false;
    const stats = statsFor(attacker);
    const lowPower = attacker.class === "building" && isDefensiveTurret(attacker.kind) && powerFor(state, attacker.owner) < 0;
    const range = stats.range * (lowPower ? POWER_SHORTAGE_TURRET_RANGE_MULTIPLIER : 1)
      + (stats.weapon === "airStrike" ? 0 : directFireRangeBonusAt(state, attacker))
      + heightRangeBonus(state, attacker, building);
    return distToEntity(attacker, building) <= range && (aircraft || lineOfSight(state, attacker, building));
  });
}

export function tickRepair(state: SimState, eventSink?: SimEvent[], collectEvents = true): SimEvent[] {
  const events = eventSink ?? (collectEvents ? [] : undefined);
  for (const e of entitiesFor(state)) {
    if (!e.repairing) continue;
    if (!isBuildingEntity(e) || e.hp <= 0 || e.constructing > 0) {
      e.repairing = false;
      continue;
    }
    if (e.hp >= e.maxHp) {
      e.hp = e.maxHp;
      e.repairing = false;
      continue;
    }
    if (isUnderAttack(state, e)) continue;
    const kind = e.kind;
    const restored = Math.min(repairHpPerTick(kind), e.maxHp - e.hp);
    const cost = Math.max(1, Math.round(repairCostFor(kind, restored)));
    if (state.credits[e.owner] < cost) continue;
    state.credits[e.owner] -= cost;
    e.hp = Math.min(e.maxHp, e.hp + restored);
    events?.push({
      type: "repair",
      owner: e.owner,
      buildingId: e.id,
      kind,
      amount: restored,
      cost,
      x: e.x,
      y: e.y,
    });
    if (e.hp >= e.maxHp) {
      e.hp = e.maxHp;
      e.repairing = false;
    }
  }
  return eventSink ? EMPTY_EVENTS : events ?? EMPTY_EVENTS;
}
