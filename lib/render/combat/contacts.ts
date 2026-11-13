import type { Entity, SimState } from "../../types";

export function isLockedContactUnit(state: SimState, e: Entity): boolean {
  return (
    e.class === "unit" &&
    e.neutral === true &&
    (state.runtime?.kind === "rescue" || state.runtime?.kind === "extraction") &&
    Boolean(state.runtime.targetIds?.includes(e.id))
  );
}

export function isScenarioTarget(state: SimState, e: Entity): boolean {
  return e.class === "unit" && Boolean(state.runtime?.targetIds.includes(e.id));
}

export function isExtractableUnit(state: SimState, e: Entity): boolean {
  return (
    e.class === "unit" &&
    state.runtime?.kind === "extraction" &&
    Boolean(state.runtime.targetIds?.includes(e.id)) &&
    !state.runtime.extractedIds?.includes(e.id)
  );
}
