import type { Entity, SimState } from "@/lib/types";

export function gameOverlayModel({
  state,
  selectedIds,
}: {
  state: SimState;
  selectedIds: number[];
}) {
  const selectedEntity = state.entities.find((entity: Entity) => selectedIds.includes(entity.id) && entity.hp > 0);
  // The simulation mutates entities in place; give React a new identity for the selected snapshot.
  const selected = selectedEntity ? { ...selectedEntity } : undefined;
  return {
    palette: (state.factions[state.viewOwner ?? 0] ?? state.factions[0]).palette,
    selected,
  };
}

/**
 * Cheap fingerprint of the inputs `powerBreakdown(state, 0)` depends on:
 * owner-0 living buildings and whether each is still constructing. Unit
 * movement, enemy activity, and selection churn leave this unchanged, so
 * callers can memoize the breakdown on it instead of on `state`.
 */
export function powerSignature(state: SimState): string {
  const parts: string[] = [];
  for (const e of state.entities) {
    if (e.hp <= 0 || e.owner !== (state.viewOwner ?? 0) || e.class !== "building") continue;
    parts.push(e.constructing > 0 ? `${e.kind}~` : e.kind);
  }
  return parts.sort().join("|");
}
