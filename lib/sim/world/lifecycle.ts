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
    if (entity.class === "unit" && entity.assignedRunwayId !== undefined) {
      const runway = state.entities.find((candidate) => candidate.id === entity.assignedRunwayId);
      if (runway?.class === "building" && runway.kind === "runway" && runway.assignedPlaneId === entity.id) {
        runway.assignedPlaneId = undefined;
      }
    }
    if (entity.class === "building" && entity.kind === "runway" && entity.assignedPlaneId !== undefined) {
      const aircraft = state.entities.find((candidate) => candidate.id === entity.assignedPlaneId);
      if (aircraft?.class === "unit" && aircraft.assignedRunwayId === entity.id) {
        aircraft.assignedRunwayId = undefined;
        aircraft.landingRunwayId = undefined;
        aircraft.flightState = "airborne";
      }
    }
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
    // Compact refunds queued production into credits. Clone the array so a
    // save snapshot can credit the payout without mutating the live world
    // (whose dead producer still holds the queue until the next cleanup).
    credits: [state.credits[0], state.credits[1]],
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
