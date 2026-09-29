import type { SimState } from "../../types";
import { refundQueuedUnits } from "../productionRefund";
import { ensureDeadBuildingInvalidation } from "./terrain";
import { removeEntities } from "../entities";

function cloneProductionQueues(state: SimState): SimState["productionQueues"] {
  return Object.fromEntries(Object.entries(state.productionQueues ?? {}).map(([owner, byKind]) => [
    owner,
    Object.fromEntries(Object.entries(byKind ?? {}).map(([kind, queue]) => [
      kind,
      queue ? {
        ...queue,
        ...(queue.producing ? { producing: { ...queue.producing } } : {}),
        queue: [...queue.queue],
      } : queue,
    ])),
  ])) as SimState["productionQueues"];
}

export function compactDestroyedEntities(state: SimState): number {
  const entities = state.entities;
  let removedIds: Set<number> | undefined;
  for (const entity of entities) {
    if (entity.hp > 0) continue;
    (removedIds ??= new Set<number>()).add(entity.id);
  }
  if (!removedIds) return 0;

  for (const entity of entities) {
    if (entity.hp > 0) continue;
    refundQueuedUnits(state, entity);
    if (entity.class === "building") ensureDeadBuildingInvalidation(state, entity.id);
  }

  removeEntities(state, removedIds, removedIds);
  return removedIds.size;
}

export function compactedState(state: SimState): SimState {
  if (!Array.isArray(state.entities) || !state.entities.some((entity) => entity.hp <= 0)) return state;
  const copy: SimState = {
    ...state,
    // Cleanup can credit refunds and clear shared queues, so clone each value
    // it may mutate before compacting a save snapshot.
    credits: state.credits.slice(),
    entities: state.entities.map((entity) => ({ ...entity })),
    productionQueues: cloneProductionQueues(state),
  };
  compactDestroyedEntities(copy);
  return copy;
}
