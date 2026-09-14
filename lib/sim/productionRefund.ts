import { UNIT_STATS } from "../catalog";
import { isBuildingEntity, type Entity, type SimState } from "../types";

/** Return prepaid production credits when a player producer is sold or destroyed. */
export function refundQueuedUnits(state: SimState, e: Entity): void {
  if (!isBuildingEntity(e) || e.owner !== 0) return;
  if (e.producing) {
    state.credits[0] += UNIT_STATS[e.producing.kind].cost;
    e.producing = undefined;
  }
  if (!e.queue?.length) return;
  for (const unit of e.queue) state.credits[0] += UNIT_STATS[unit].cost;
  e.queue = [];
}
