import { UNIT_STATS } from "../catalog";
import { isBuildingEntity, type Entity, type Owner, type SharedProducerKind, type SimState } from "../types";
import { isSharedProducerKind, sharedProductionQueue } from "./producerState";

/** Return prepaid production credits to the producer's owner when it is sold or destroyed. */
export function refundQueuedUnits(state: SimState, e: Entity): void {
  if (!isBuildingEntity(e)) return;
  if (e.producing) {
    state.credits[e.owner] += UNIT_STATS[e.producing.kind].cost;
    e.producing = undefined;
  }
  if (e.queue?.length) {
    for (const unit of e.queue) state.credits[e.owner] += UNIT_STATS[unit].cost;
    e.queue = [];
  }
  if (e.hp <= 0 && isSharedProducerKind(e.kind)) {
    refundOrphanedSharedQueue(state, e.owner, e.kind);
  }
}

/** Refund shared Barracks/Factory work when its last living producer is removed. */
export function refundOrphanedSharedQueue(state: SimState, owner: Owner, kind: SharedProducerKind): void {
  const replacement = state.entities.some((candidate) =>
    candidate.class === "building" && candidate.kind === kind &&
    candidate.owner === owner && candidate.hp > 0,
  );
  if (replacement) return;

  const queue = sharedProductionQueue(state, owner, kind);
  if (queue.producing) state.credits[owner] += UNIT_STATS[queue.producing.kind].cost;
  for (const unit of queue.queue) state.credits[owner] += UNIT_STATS[unit].cost;
  queue.producing = undefined;
  queue.queue.length = 0;
}
