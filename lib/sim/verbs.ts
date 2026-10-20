import { UNIT_STATS } from "../catalog";
import type { Entity, SimEvent, SimState } from "../types";
import { isUnitEntity } from "../types";
import { byId, invalidateLivingCache } from "./world";
import { commandOwner } from "./orders/commandOwner";
import { entitiesFor } from "./entities";
import { campaignIdentityActive, VETERAN_DAMAGE } from "./fieldIdentity";

export const BRACE_SPEED = 0.45;
export const BRACE_RANGE = 1.4;
export const ENTRENCH_INCOMING = 0.7;
export const VETERAN_DAMAGE_MULTIPLIER = 1.12;
export const BOMBARD_TICKS = 36;
export const BOMBARD_RADIUS = 3.2;
export const BOMBARD_DAMAGE = 52;

export function isEntrenched(entity: Entity): boolean {
  return entity.class === "unit"
    && entity.kind === "infantry"
    && entity.stance === "hold"
    && entity.idle === true
    && entity.path.length === 0
    && entity.orderDestination === undefined
    && entity.attackTarget === undefined;
}

export function clearPlanted(entity: Entity): void {
  entity.braced = undefined;
  entity.bombard = undefined;
}

export function braceRangeBonus(entity: Entity): number {
  return entity.braced === true && entity.kind === "tank" ? BRACE_RANGE : 0;
}

export function veteranSightBonus(entity: Pick<Entity, "veteranRank">): number {
  return entity.veteranRank === 1 ? 1 : 0;
}

export function noteDamageDealt(state: SimState, attacker: Entity, amount: number): void {
  if (!campaignIdentityActive(state) || attacker.owner !== 0 || !isUnitEntity(attacker) || amount <= 0) return;
  if (attacker.veteranRank === 1) return;
  attacker.damageDealt = (attacker.damageDealt ?? 0) + amount;
  if (attacker.damageDealt >= VETERAN_DAMAGE) attacker.veteranRank = 1;
}

export function braceUnits(state: SimState, ids: number[]): SimEvent[] {
  const owner = commandOwner(state);
  let braced = 0;
  for (const id of ids) {
    const entity = byId(state, id);
    if (!entity || !isUnitEntity(entity) || entity.owner !== owner || entity.neutral || entity.kind !== "tank") continue;
    clearPlanted(entity);
    entity.braced = true;
    entity.path = [];
    entity.attackTarget = undefined;
    entity.orderMode = undefined;
    entity.orderDestination = undefined;
    entity.flowGoal = undefined;
    entity.routePending = false;
    entity.idle = true;
    braced += 1;
  }
  return braced > 0 ? [] : [{ type: "commandRejected", reason: "no tank to brace" }];
}

export function bombardUnits(state: SimState, ids: number[], x: number, y: number): SimEvent[] {
  const owner = commandOwner(state);
  let armed = 0;
  for (const id of ids) {
    const entity = byId(state, id);
    if (!entity || !isUnitEntity(entity) || entity.owner !== owner || entity.neutral || entity.kind !== "behemoth") continue;
    clearPlanted(entity);
    entity.bombard = { x, y, remaining: BOMBARD_TICKS };
    entity.path = [];
    entity.attackTarget = undefined;
    entity.orderMode = undefined;
    entity.orderDestination = undefined;
    entity.flowGoal = undefined;
    entity.routePending = false;
    entity.idle = true;
    armed += 1;
  }
  return armed > 0 ? [] : [{ type: "commandRejected", reason: "no behemoth to bombard" }];
}

function destroyFromBombard(state: SimState, target: Entity, events?: SimEvent[]): void {
  target.hp = 0;
  invalidateLivingCache(state);
  if (isUnitEntity(target)) state.losses.units[target.owner] = (state.losses.units[target.owner] ?? 0) + 1;
  else state.losses.buildings[target.owner] = (state.losses.buildings[target.owner] ?? 0) + 1;
  events?.push({ type: "destroyed", id: target.id, owner: target.owner, kind: target.kind, x: target.x, y: target.y });
}

/** Charges a planted area shot, then resolves it once. */
export function tickBombards(state: SimState, events?: SimEvent[]): void {
  for (const entity of entitiesFor(state)) {
    if (!isUnitEntity(entity) || entity.hp <= 0 || !entity.bombard) continue;
    entity.path = [];
    entity.idle = true;
    entity.bombard.remaining -= 1;
    if (entity.bombard.remaining > 0) continue;
    const point = entity.bombard;
    entity.bombard = undefined;
    entity.cooldown = Math.max(entity.cooldown, 36);
    let dealt = 0;
    for (const target of entitiesFor(state)) {
      if (target.hp <= 0 || target.id === entity.id || target.owner === entity.owner || target.neutral) continue;
      const distance = Math.hypot(target.x - point.x, target.y - point.y);
      if (distance > BOMBARD_RADIUS) continue;
      const falloff = Math.max(0.35, 1 - distance / BOMBARD_RADIUS);
      const amount = BOMBARD_DAMAGE * falloff;
      target.hp -= amount;
      dealt += amount;
      if (target.class === "unit") target.suppression = Math.min(100, (target.suppression ?? 0) + 24);
      if (target.hp <= 0) destroyFromBombard(state, target, events);
    }
    noteDamageDealt(state, entity, dealt);
    events?.push({
      type: "combat",
      owner: entity.owner,
      attackerKind: entity.kind,
      weapon: UNIT_STATS.behemoth.weapon,
      x: entity.x,
      y: entity.y,
      targetX: point.x,
      targetY: point.y,
      targetOwner: entity.owner === 0 ? 1 : 0,
      targetKind: "infantry",
      destroyed: false,
    });
  }
}
