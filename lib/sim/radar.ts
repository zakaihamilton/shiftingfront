import type { Owner, SimState } from "../types";

/** The minimap is live while this owner has a finished radar still standing. */
export function minimapRadarOnline(state: Pick<SimState, "entities" | "viewOwner">, owner?: Owner): boolean {
  const viewer = owner ?? state.viewOwner ?? 0;
  return state.entities.some((entity) =>
    entity.class === "building"
    && entity.kind === "radar"
    && entity.owner === viewer
    && entity.hp > 0
    && entity.constructing <= 0,
  );
}
