import { UNIT_STATS } from "../catalog";
import { isBuildingEntity, type Entity, type SimState } from "../types";

/** Return prepaid production credits to the producer's owner when it is sold or destroyed. */
export function refundQueuedUnits(state: SimState, e: Entity): void {
  if (!isBuildingEntity(e)) return;
  if (e.producing) {
    state.credits[e.owner] += UNIT_STATS[e.producing.kind].cost;
    e.producing = undefined;
  }
  if (!e.queue?.length) return;
  for (const unit of e.queue) state.credits[e.owner] += UNIT_STATS[unit].cost;
  e.queue = [];
}
