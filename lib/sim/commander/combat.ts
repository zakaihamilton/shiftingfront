import { inObjectiveZone } from "../../types";
import { isAirUnit } from "../../catalog";
import type { Command, Entity, SimState } from "../../types";
import { distToEntity } from "../world";
import {
  OFFENSIVE_KINDS,
  OFFENSIVE_RESPONSE_RADIUS,
  OFFENSIVE_RESPONSE_KINDS,
  YARD_THREAT_RADIUS,
  combatValue,
  enemyEntitiesView,
  isCombatEntity,
  objectiveKind,
} from "./queries";
import { entitiesFor } from "../ecs/world";

export function objectiveEntity(state: SimState): Entity | undefined {
  const kind = objectiveKind(state);
  const targetIds = state.win.targetIds ?? state.runtime?.targetIds ?? [];
  if (kind === "escort" || kind === "rescue" || kind === "extraction") {
    const targets = targetIds
      .map((id) => entitiesFor(state).find((entity) => entity.id === id && entity.hp > 0))
      .filter((entity): entity is Entity => !!entity);
    if (kind === "extraction") {
      return targets.find((entity) => entity.neutral) ?? targets.find((entity) => !inObjectiveZone(entity.x, entity.y, state.runtime?.zone));
    }
    return targets.find((entity) => entity.neutral) ?? targets[0];
  }
  if (kind === "sabotage" || kind === "destroyMarked") {
    return targetIds
      .map((id) => entitiesFor(state).find((entity) => entity.id === id && entity.hp > 0))
      .find((entity): entity is Entity => !!entity);
  }
  if (kind === "decapitate") return enemyEntitiesView(state).find((entity) => entity.kind === "constructionYard");
  if (kind === "razeAll") return enemyEntitiesView(state).find((entity) => entity.class === "building");
  if (kind === "annihilate") {
    const enemies = enemyEntitiesView(state);
    return enemies.find((entity) => entity.class === "unit" && !isAirUnit(entity.kind))
      ?? enemies.find((entity) => entity.class === "building")
      ?? enemies[0];
  }
  return undefined;
}

/**
 * Pick the first defensive structure that blocks a decapitation approach.
 * The construction yard remains the authoritative objective, but walking a
 * full assault through its turret ring makes the objective behave like an
 * attrition check instead of a siege with a readable first target.
 */
export function offensiveApproachTarget(state: SimState, objective: Entity): Entity {
  if (objectiveKind(state) !== "decapitate" || objective.kind !== "constructionYard") return objective;
  return enemyEntitiesView(state)
    .filter((entity) => entity.kind === "turret" && entity.constructing === 0)
    .sort((a, b) => distToEntity(objective, a) - distToEntity(objective, b) || a.id - b.id)[0] ?? objective;
}

export function parallelOffensiveTargets(state: SimState): Entity[] {
  if (objectiveKind(state) !== "sabotage" && objectiveKind(state) !== "destroyMarked") return [];
  const targetIds = state.win.targetIds ?? state.runtime?.targetIds ?? [];
  return targetIds
    .map((id) => entitiesFor(state).find((entity) => entity.id === id && entity.hp > 0 && entity.owner === 1))
    .filter((entity): entity is Entity => !!entity);
}

export function defensiveThreat(state: SimState, yard: Entity): Entity | undefined {
  const responseRadius = OFFENSIVE_RESPONSE_KINDS.has(objectiveKind(state)) ? OFFENSIVE_RESPONSE_RADIUS : YARD_THREAT_RADIUS;
  return enemyEntitiesView(state)
    .filter((entity) => isCombatEntity(entity) && !(entity.class === "unit" && isAirUnit(entity.kind)))
    .sort((a, b) => distToEntity(yard, a) - distToEntity(yard, b) || a.id - b.id)
    .find((entity) => distToEntity(yard, entity) <= responseRadius);
}

/** Three combat units or a tank in the HQ radius is a raid, not a scout. */
export function yardRaid(state: SimState, yard: Entity): boolean {
  const responseRadius = OFFENSIVE_RESPONSE_KINDS.has(objectiveKind(state)) ? OFFENSIVE_RESPONSE_RADIUS : YARD_THREAT_RADIUS;
  const attackers = enemyEntitiesView(state).filter(
    (entity) => isCombatEntity(entity) && !(entity.class === "unit" && isAirUnit(entity.kind)) && distToEntity(yard, entity) <= responseRadius,
  );
  return attackers.length >= 3 || attackers.some((entity) => entity.kind === "tank");
}

export function scenarioThreat(state: SimState): Entity | undefined {
  const kind = objectiveKind(state);
  if (kind !== "escort" && kind !== "rescue" && kind !== "extraction") return undefined;
  const scenarioTargets = (state.runtime?.targetIds ?? [])
    .map((id) => entitiesFor(state).find((entity) => entity.id === id && entity.hp > 0))
    .filter((entity): entity is Entity => !!entity && (kind === "escort" || !entity.neutral));
  if (!scenarioTargets.length) return undefined;
  return enemyEntitiesView(state)
    .filter((entity) => isCombatEntity(entity) && !(entity.class === "unit" && isAirUnit(entity.kind)))
    .sort((a, b) => {
      const aDistance = Math.min(...scenarioTargets.map((target) => distToEntity(target, a)));
      const bDistance = Math.min(...scenarioTargets.map((target) => distToEntity(target, b)));
      return aDistance - bDistance || a.id - b.id;
    })
    .find((entity) => scenarioTargets.some((target) => distToEntity(target, entity) <= YARD_THREAT_RADIUS));
}

export function assaultReady(state: SimState, target: Entity, combat: Entity[]): boolean {
  if (!OFFENSIVE_KINDS.has(objectiveKind(state)) || target.owner !== 1) return true;
  const deadline = state.runtime?.deadline ?? state.win.ticks;
  const closeoutRatio = objectiveKind(state) === "decapitate" ? 0.28 : 0.4;
  const closeout = deadline !== undefined && state.tick >= deadline * closeoutRatio;
  const minimumUnits = objectiveKind(state) === "annihilate" || objectiveKind(state) === "razeAll"
    ? 5 + Math.floor(state.missionIndex / 2)
    : 8 + Math.floor(state.missionIndex / 3);
  if (combat.length < minimumUnits && !closeout) return false;
  // Late offensive missions need a short staging window to let the opening
  // economy and local defense settle. Committing during the first exchange
  // sends the starting force into a fully staffed turret ring before the
  // commander has had a chance to reinforce it.
  if (state.missionIndex >= 4 && state.tick < 2400) return false;

  const playerStrength = combat.reduce((sum, entity) => sum + combatValue(entity), 0);
  const defenders = enemyEntitiesView(state).filter((entity) => distToEntity(target, entity) <= 22);
  const enemyStrength = defenders
    .filter((entity) => isCombatEntity(entity))
    .reduce((sum, entity) => sum + combatValue(entity), 0);
  // Turrets are not units and therefore do not contribute to combatValue, but
  // they are the part of the production ring that makes a small assault trade
  // away its entire force. Count each completed turret as a defensive unit so
  // the competent commander stages a real counter advantage before pushing.
  const turretStrength = defenders.filter((entity) => entity.kind === "turret" && entity.constructing === 0).length * 8;
  const defensiveStrength = enemyStrength + turretStrength;
  // A half-strength push can clear the first screen but leaves the player
  // force trading into the enemy production ring. Hold the assault until the
  // force has a meaningful counter advantage; the deadline fallback still
  // guarantees a finite closeout when the board is unusually resistant.
  if (defensiveStrength === 0 || playerStrength >= defensiveStrength) return true;
  return closeout;
}

export function orderKey(command: Command): string {
  if (command.type === "attack") return `attack:${command.targetId}`;
  if (command.type === "move" || command.type === "attackMove") return `${command.type}:${command.x}:${command.y}`;
  return command.type;
}
