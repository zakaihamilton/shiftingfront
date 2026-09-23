import type { SimState } from "../../types";
import { refundQueuedUnits } from "../productionRefund";
import { ensureDeadBuildingInvalidation } from "./terrain";
import { worldFor } from "../ecs/world";

export function compactDestroyedEntities(state: SimState): number {
  const world = worldFor(state);
  const entities = world.all();
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

  world.removeMany(removedIds, removedIds);
  return removedIds.size;
}

export function compactedState(state: SimState): SimState {
  if (!Array.isArray(state.entities) || !state.entities.some((entity) => entity.hp <= 0)) return state;
  const copy: SimState = {
    ...state,
    // Compact refunds queued production into credits. Clone the array so a
    // save snapshot can credit the payout without mutating the live world
    // (whose dead producer still holds the queue until the next cleanup).
    credits: [state.credits[0], state.credits[1]],
    entities: state.entities.map((entity) => ({ ...entity })),
  };
  compactDestroyedEntities(copy);
  return copy;
}
