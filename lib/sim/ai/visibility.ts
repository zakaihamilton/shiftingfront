import { BUILDING_STATS, UNIT_STATS } from "../../catalog";
import { isBuildingEntity, isUnitEntity, type AiContact, type Entity, type Owner, type SimState } from "../../types";
import { byId, distToEntity, livingView } from "../world";
import { groundUnitSightAt } from "../terrainRules";
import { aiContacts as getAiContacts } from "./ownerState";

/** Contacts remain available to the director for fifteen seconds after detection. */
export const AI_CONTACT_TTL_TICKS = 180;

function contactsFor(state: SimState, aiOwner: Owner): Record<string, AiContact> {
  return getAiContacts(state, aiOwner);
}

function sightOf(state: SimState, entity: Entity): number {
  return isUnitEntity(entity)
    ? groundUnitSightAt(state, entity, UNIT_STATS[entity.kind].sight)
    : isBuildingEntity(entity) ? BUILDING_STATS[entity.kind].sight : 0;
}

function canDetect(state: SimState, source: Entity, target: Entity): boolean {
  return distToEntity({ x: source.x, y: source.y }, target) <= sightOf(state, source);
}

function isStrategicContact(state: SimState, target: Entity, opponents: readonly Owner[]): boolean {
  return (target.kind === "constructionYard" && opponents.includes(target.owner))
    || target.marked
    || target.attackTarget !== undefined
    || state.runtime?.targetIds.includes(target.id) === true;
}

function isCurrentlyKnown(state: SimState, target: Entity, sensors: Entity[], opponents: readonly Owner[]): boolean {
  return isStrategicContact(state, target, opponents) || sensors.some((sensor) => canDetect(state, sensor, target));
}

function pruneContacts(state: SimState, aiOwner: Owner): void {
  const contacts = contactsFor(state, aiOwner);
  for (const [key, contact] of Object.entries(contacts)) {
    if (state.tick - contact.lastSeenTick > AI_CONTACT_TTL_TICKS) delete contacts[key];
  }
}

/** Update enemy knowledge from current sensor ranges and mission-wide intel. */
export function updateAiContacts(state: SimState, aiOwner: Owner = 1, opponents: readonly Owner[] = [0]): void {
  const contacts = contactsFor(state, aiOwner);
  const playerEntities = livingView(state).filter((entity) => opponents.includes(entity.owner));
  const sensors = livingView(state).filter((entity) => entity.owner === aiOwner);

  for (const target of playerEntities) {
    const detected = isCurrentlyKnown(state, target, sensors, opponents);
    if (!detected) continue;
    contacts[String(target.id)] = {
      id: target.id,
      ...(state.multiplayer ? { owner: target.owner } : {}),
      class: target.class,
      kind: target.kind,
      x: target.x,
      y: target.y,
      lastSeenTick: state.tick,
    };
  }

  pruneContacts(state, aiOwner);
}

/** Return player entities that the enemy may currently react to. */
export function enemyKnownPlayerEntities(
  state: SimState,
  activeEntities: readonly Entity[] = livingView(state),
  aiOwner: Owner = 1,
  opponents: readonly Owner[] = [0],
): Entity[] {
  const contacts = contactsFor(state, aiOwner);
  const visible = new Set<number>();
  const sensors = activeEntities.filter((entity) => entity.owner === aiOwner);
  const players = activeEntities.filter((entity) => opponents.includes(entity.owner));
  const result: Entity[] = [];

  for (const target of players) {
    if (!isCurrentlyKnown(state, target, sensors, opponents)) continue;
    visible.add(target.id);
    contacts[String(target.id)] = {
      id: target.id,
      ...(state.multiplayer ? { owner: target.owner } : {}),
      class: target.class,
      kind: target.kind,
      x: target.x,
      y: target.y,
      lastSeenTick: state.tick,
    };
    result.push(target);
  }

  pruneContacts(state, aiOwner);
  for (const contact of Object.values(contacts)) {
    if (visible.has(contact.id) || state.tick - contact.lastSeenTick > AI_CONTACT_TTL_TICKS) continue;
    result.push({
      id: contact.id,
      owner: contact.owner ?? opponents[0] ?? 0,
      class: contact.class,
      kind: contact.kind,
      x: contact.x,
      y: contact.y,
      hp: 1,
      maxHp: 1,
      cooldown: 0,
      path: [],
      carry: 0,
      constructing: 0,
      queue: [],
      marked: false,
      idle: false,
    });
  }

  return result;
}

export function nearestKnownPlayer(
  state: SimState,
  from: { x: number; y: number },
  predicate: (entity: Entity) => boolean,
  knownPlayers?: Entity[],
  aiOwner: Owner = 1,
  opponents: readonly Owner[] = [0],
): Entity | undefined {
  const known = knownPlayers ?? enemyKnownPlayerEntities(state, livingView(state), aiOwner, opponents);
  let best: Entity | undefined;
  let bestDistance = Infinity;
  const sensors = livingView(state).filter((entity) => entity.owner === aiOwner);
  for (const entity of known) {
    if (!predicate(entity)) continue;
    const live = byId(state, entity.id);
    if (!live) continue;
    // A stale contact can inform strategic counts, but it cannot provide the
    // live position needed to issue an exact attack order.
    if (!isCurrentlyKnown(state, live, sensors, opponents)) continue;
    const current = distToEntity(from, live);
    if (current < bestDistance) {
      best = live;
      bestDistance = current;
    }
  }
  return best;
}
