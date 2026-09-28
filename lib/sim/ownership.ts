import type { Owner, SimState } from "../types";

/** Campaign simulations have one human seat; versus AI owners use computer pathing behavior. */
export function isPlayerControlledOwner(
  state: Pick<SimState, "multiplayer" | "multiplayerOwners" | "multiplayerAiOwners">,
  owner: Owner,
): boolean {
  if (!state.multiplayer) return owner === 0;
  return (state.multiplayerOwners ?? [0, 1]).includes(owner) && !(state.multiplayerAiOwners ?? []).includes(owner);
}
