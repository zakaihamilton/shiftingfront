import type { Owner, SimState } from "../types";

/** Campaign simulations have one human seat; skirmishes treat each active seat as player-controlled. */
export function isPlayerControlledOwner(state: Pick<SimState, "multiplayer" | "multiplayerOwners">, owner: Owner): boolean {
  if (!state.multiplayer) return owner === 0;
  return (state.multiplayerOwners ?? [0, 1]).includes(owner);
}
