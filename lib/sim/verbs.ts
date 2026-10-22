import { UNIT_STATS } from "../catalog";
import type { Entity, SimEvent, SimState } from "../types";
import { isUnitEntity } from "../types";
import { byId, closestTargetPoint, invalidateLivingCache } from "./world";
import { commandOwner } from "./orders/commandOwner";
import { entitiesFor } from "./entities";
import { campaignIdentityActive, VETERAN_DAMAGE } from "./fieldIdentity";
import { directFireRangeBonusAt } from "./terrainRules";

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

export function bombardRange(state: SimState, entity: Entity, x: number, y: number): number {
  const source = state.heights[Math.round(entity.y) * state.width + Math.round(entity.x)] ?? 1;
  const target = state.heights[Math.round(y) * state.width + Math.round(x)] ?? 1;
  return UNIT_STATS.behemoth.range + directFireRangeBonusAt(state, entity) + (source > target ? 1 : 0);
}

export function bombardInRange(state: SimState, entity: Entity, x: number, y: number): boolean {
  return Math.hypot(entity.x - x, entity.y - y) <= bombardRange(state, entity, x, y);
}

/** Aim at the near side of a building, and keep the chosen point inside cannon range. */
export function bombardPointFor(state: SimState, shooters: readonly Entity[], target: Entity): { x: number; y: number } | undefined {
  for (const shooter of shooters) {
    const point = closestTargetPoint(shooter, target);
    if (bombardInRange(state, shooter, point.x, point.y)) return point;
  }
  return undefined;
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
  let behemoths = 0;
  for (const id of ids) {
    const entity = byId(state, id);
    if (!entity || !isUnitEntity(entity) || entity.owner !== owner || entity.neutral || entity.kind !== "behemoth") continue;
    behemoths += 1;
    if (!bombardInRange(state, entity, x, y)) continue;
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
  if (armed > 0) return [];
  return [{ type: "commandRejected", reason: behemoths > 0 ? "target out of range" : "no behemoth to bombard" }];
}

function destroyFromBombard(state: SimState, target: Entity, events?: SimEvent[]): void {
  target.hp = 0;
  invalidateLivingCache(state);
  if (isUnitEntity(target)) state.losses.units[target.owner] = (state.losses.units[target.owner] ?? 0) + 1;
  else state.losses.buildings[target.owner] = (state.losses.buildings[target.owner] ?? 0) + 1;
  events?.push({ type: "destroyed", id: target.id, owner: target.owner, kind: target.kind, x: target.x, y: target.y });
}

function closerBombardHit(
  current: { target: Entity; distance: number } | undefined,
  target: Entity,
  distance: number,
): { target: Entity; distance: number } {
  if (!current || distance < current.distance || (distance === current.distance && target.id < current.target.id)) {
    return { target, distance };
  }
  return current;
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
    let primary: { target: Entity; distance: number } | undefined;
    for (const target of entitiesFor(state)) {
      if (target.hp <= 0 || target.id === entity.id || target.owner === entity.owner || target.neutral) continue;
      const distance = Math.hypot(target.x - point.x, target.y - point.y);
      if (distance > BOMBARD_RADIUS) continue;
      const falloff = Math.max(0.35, 1 - distance / BOMBARD_RADIUS);
      const amount = BOMBARD_DAMAGE * falloff;
      target.hp -= amount;
      dealt += amount;
      if (target.class === "unit") target.suppression = Math.min(100, (target.suppression ?? 0) + 24);
      primary = closerBombardHit(primary, target, distance);
      if (target.hp <= 0) destroyFromBombard(state, target, events);
    }
    noteDamageDealt(state, entity, dealt);
    const hit = primary?.target;
    events?.push({
      type: "combat",
      owner: entity.owner,
      attackerKind: entity.kind,
      weapon: UNIT_STATS.behemoth.weapon,
      x: entity.x,
      y: entity.y,
      targetX: point.x,
      targetY: point.y,
      // A miss has no victim. A building kind keeps the cue on the generic shell
      // sound, and the shooter owns the marker so another faction is not painted.
      targetOwner: hit?.owner ?? entity.owner,
      targetKind: hit?.kind ?? "constructionYard",
      destroyed: hit !== undefined && hit.hp <= 0,
      areaRadius: BOMBARD_RADIUS,
    });
  }
}
