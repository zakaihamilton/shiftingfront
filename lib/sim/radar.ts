import type { Owner, SimState } from "../types";
import { powerFor } from "./world";

export type MinimapPicture = "on" | "no-radar" | "low-power";

function finishedRadar(state: Pick<SimState, "entities">, owner: Owner): boolean {
  return state.entities.some((entity) =>
    entity.class === "building"
    && entity.kind === "radar"
    && entity.owner === owner
    && entity.hp > 0
    && entity.constructing <= 0,
  );
}

/** Why the minimap picture is live or dark for this owner. */
export function minimapPicture(state: SimState, owner?: Owner): MinimapPicture {
  const viewer = owner ?? state.viewOwner ?? 0;
  if (!finishedRadar(state, viewer)) return "no-radar";
  // A deficit is negative surplus. Zero still runs the picture, matching production.
  if (powerFor(state, viewer) < 0) return "low-power";
  return "on";
}

/** The minimap is live while this owner has a finished radar and power. */
export function minimapRadarOnline(state: SimState, owner?: Owner): boolean {
  return minimapPicture(state, owner) === "on";
}
