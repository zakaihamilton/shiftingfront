import type { Owner, SimState } from "../types";
import { powerFor } from "./world";

/** Returns power state for live seats while preserving the two-owner campaign model. */
export function powerShortageByOwner(state: SimState): Record<Owner, boolean> {
  const lowPower: Record<Owner, boolean> = { 0: false, 1: false, 2: false, 3: false };
  const owners: readonly Owner[] = state.multiplayer
    ? state.multiplayerOwners ?? [0, 1]
    : [0, 1];
  for (const owner of owners) lowPower[owner] = powerFor(state, owner) < 0;
  return lowPower;
}
