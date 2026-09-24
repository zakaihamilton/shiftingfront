import { BUILDING_STATS, UNIT_STATS } from "../../catalog";
import { isBuildingEntity, isUnitEntity, type AiContact, type Entity, type SimState } from "../../types";
import { byId, distToEntity, livingView } from "../world";
import { groundUnitSightAt } from "../terrainRules";

/** Contacts remain available to the director for fifteen seconds after detection. */
export const AI_CONTACT_TTL_TICKS = 180;

function contactsFor(state: SimState): Record<string, AiContact> {
  return state.aiContacts ?? (state.aiContacts = {});
}

function sightOf(state: SimState, entity: Entity): number {
  return isUnitEntity(entity)
    ? groundUnitSightAt(state, entity, UNIT_STATS[entity.kind].sight)
    : isBuildingEntity(entity) ? BUILDING_STATS[entity.kind].sight : 0;
}

function canDetect(state: SimState, source: Entity, target: Entity): boolean {
  return distToEntity({ x: source.x, y: source.y }, target) <= sightOf(state, source);
}

function isStrategicContact(state: SimState, target: Entity): boolean {
  return target.kind === "constructionYard"
    || target.marked
    || target.attackTarget !== undefined
    || state.runtime?.targetIds.includes(target.id) === true;
}

function isCurrentlyKnown(state: SimState, target: Entity, sensors: Entity[]): boolean {
  return isStrategicContact(state, target) || sensors.some((sensor) => canDetect(state, sensor, target));
}

function pruneContacts(state: SimState): void {
  const contacts = contactsFor(state);
  for (const [key, contact] of Object.entries(contacts)) {
    if (state.tick - contact.lastSeenTick > AI_CONTACT_TTL_TICKS) delete contacts[key];
  }
}

/** Update enemy knowledge from current sensor ranges and mission-wide intel. */
export function updateAiContacts(state: SimState): void {
  const contacts = contactsFor(state);
  const playerEntities = livingView(state).filter((entity) => entity.owner === 0);
  const sensors = livingView(state).filter((entity) => entity.owner === 1);

  for (const target of playerEntities) {
    const detected = isCurrentlyKnown(state, target, sensors);
    if (!detected) continue;
    contacts[String(target.id)] = {
      id: target.id,
      class: target.class,
      kind: target.kind,
      x: target.x,
      y: target.y,
      lastSeenTick: state.tick,
    };
  }

  pruneContacts(state);
}

/** Return player entities that the enemy may currently react to. */
export function enemyKnownPlayerEntities(state: SimState, activeEntities: readonly Entity[] = livingView(state)): Entity[] {
  const contacts = contactsFor(state);
  const visible = new Set<number>();
  const sensors = activeEntities.filter((entity) => entity.owner === 1);
  const players = activeEntities.filter((entity) => entity.owner === 0);
  const result: Entity[] = [];

  for (const target of players) {
    if (!isCurrentlyKnown(state, target, sensors)) continue;
    visible.add(target.id);
    contacts[String(target.id)] = {
      id: target.id,
      class: target.class,
      kind: target.kind,
      x: target.x,
      y: target.y,
      lastSeenTick: state.tick,
    };
    result.push(target);
  }

  pruneContacts(state);
  for (const contact of Object.values(contacts)) {
    if (visible.has(contact.id) || state.tick - contact.lastSeenTick > AI_CONTACT_TTL_TICKS) continue;
    result.push({
      id: contact.id,
      owner: 0,
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
  knownPlayers: Entity[] = enemyKnownPlayerEntities(state),
): Entity | undefined {
  let best: Entity | undefined;
  let bestDistance = Infinity;
  const sensors = livingView(state).filter((entity) => entity.owner === 1);
  for (const entity of knownPlayers) {
    if (!predicate(entity)) continue;
    const live = byId(state, entity.id);
    if (!live) continue;
    // A stale contact can inform strategic counts, but it cannot provide the
    // live position needed to issue an exact attack order.
    if (!isCurrentlyKnown(state, live, sensors)) continue;
    const current = distToEntity(from, live);
    if (current < bestDistance) {
      best = live;
      bestDistance = current;
    }
  }
  return best;
}
