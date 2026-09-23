import type { SimState } from "../../types";
import { refundQueuedUnits } from "../productionRefund";
import { ensureDeadBuildingInvalidation } from "./terrain";
import { clearEntityReferences, rebuildWorld } from "../ecs/world";

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
    clearEntityReferences(entity, removedIds);
  }
  state.entities = state.entities.filter((entity) => entity.hp > 0);
  // Dead buildings already advanced the navigation revision above.
  rebuildWorld(state, false);
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
