import type { Entity, SimState } from "../types";

/** The entity array is the authoritative mutable store for a mission. */
export function entitiesFor(state: SimState): readonly Entity[] {
  return state.entities;
}

export function livingEntitiesFor(state: SimState): Entity[] {
  return state.entities.filter((entity) => entity.hp > 0);
}

export function entityFor(state: SimState, id: number): Entity | undefined {
  return state.entities.find((entity) => entity.id === id);
}

/** Add one entity and replace the array so derived query caches see the change. */
export function addEntity(state: SimState, entity: Entity): Entity {
  if (state.entities.some((existing) => existing.id === entity.id)) {
    throw new Error(`Entity ${entity.id} already exists`);
  }
  state.entities = [...state.entities, entity];
  if (entity.class === "building") {
    state.navigationRevision = (state.navigationRevision ?? 0) + 1;
  }
  return entity;
}

/**
 * Remove entities while keeping references and navigation revisions coherent.
 * Command-specific accounting must happen before this structural operation.
 */
export function removeEntities(
  state: SimState,
  ids: Iterable<number>,
  navigationHandledIds: ReadonlySet<number> = new Set(),
): Entity[] {
  const requestedIds = new Set(ids);
  if (requestedIds.size === 0) return [];

  const removed = state.entities.filter((entity) => requestedIds.has(entity.id));
  if (removed.length === 0) return [];

  const removedIds = new Set(removed.map((entity) => entity.id));
  for (const entity of removed) {
    if (entity.class === "building" && !navigationHandledIds.has(entity.id)) {
      state.navigationRevision = (state.navigationRevision ?? 0) + 1;
    }
  }
  for (const entity of state.entities) {
    if (!removedIds.has(entity.id)) clearEntityReferences(entity, removedIds);
  }
  state.entities = state.entities.filter((entity) => !removedIds.has(entity.id));
  return removed;
}

export function assertUniqueEntityIds(state: SimState): void {
  const seen = new Set<number>();
  for (const entity of state.entities) {
    if (seen.has(entity.id)) throw new Error(`Duplicate entity id: ${entity.id}`);
    seen.add(entity.id);
  }
}

function clearEntityReferences(entity: Entity, removedIds: ReadonlySet<number>): void {
  if (entity.attackTarget !== undefined && removedIds.has(entity.attackTarget)) {
    entity.attackTarget = undefined;
  }
  if (entity.supportTargetId !== undefined && removedIds.has(entity.supportTargetId)) {
    entity.supportTargetId = undefined;
    if (entity.supportMode === "assigned") entity.supportMode = "auto";
  }
  if (entity.assignedRunwayId !== undefined && removedIds.has(entity.assignedRunwayId)) {
    entity.assignedRunwayId = undefined;
    entity.landingRunwayId = undefined;
    if (entity.flightState === "servicing") {
      entity.flightState = "airborne";
      entity.serviceTicks = undefined;
      entity.idle = true;
    }
  }
  if (entity.landingRunwayId !== undefined && removedIds.has(entity.landingRunwayId)) {
    entity.landingRunwayId = undefined;
  }
  if (entity.assignedPlaneId !== undefined && removedIds.has(entity.assignedPlaneId)) {
    entity.assignedPlaneId = undefined;
  }
}
