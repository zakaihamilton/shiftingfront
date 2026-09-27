import type { Owner, SimState } from "../../types";

export function commandOwner(state: SimState): Owner {
  return state.commandOwner ?? state.viewOwner ?? 0;
}
