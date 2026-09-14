import type { Entity, SimState } from "../../types";
import { refundQueuedUnits } from "../productionRefund";
import { ensureDeadBuildingInvalidation } from "./terrain";

export function compactDestroyedEntities(state: SimState): number {
  let removedIds: Set<number> | undefined;
  for (const entity of state.entities) {
    if (entity.hp > 0) continue;
    (removedIds ??= new Set<number>()).add(entity.id);
  }
  if (!removedIds) return 0;

  for (const entity of state.entities) {
    if (entity.hp > 0) continue;
    refundQueuedUnits(state, entity);
    if (entity.class === "building") ensureDeadBuildingInvalidation(state, entity.id);
  }

  for (const entity of state.entities) {
    if (entity.hp <= 0) continue;
    clearDeadReferences(entity, removedIds);
  }
  state.entities = state.entities.filter((entity) => entity.hp > 0);
  return removedIds.size;
}

export function compactedState(state: SimState): SimState {
  if (!Array.isArray(state.entities) || !state.entities.some((entity) => entity.hp <= 0)) return state;
  const copy: SimState = {
    ...state,
    entities: state.entities.map((entity) => ({ ...entity })),
  };
  compactDestroyedEntities(copy);
  return copy;
}

function clearDeadReferences(entity: Entity, removedIds: Set<number>): void {
  if (entity.attackTarget !== undefined && removedIds.has(entity.attackTarget)) {
    entity.attackTarget = undefined;
  }
  if (entity.supportTargetId !== undefined && removedIds.has(entity.supportTargetId)) {
    entity.supportTargetId = undefined;
    if (entity.supportMode === "assigned") entity.supportMode = "auto";
  }
}
