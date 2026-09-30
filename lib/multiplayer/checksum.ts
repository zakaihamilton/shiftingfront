import type { SimState } from "@/lib/types";

export const STATE_CHECK_INTERVAL = 120;
export const CHECK_HISTORY_LIMIT = 8;

/** JSON-compatible canonical order, independent of local viewpoint and object insertion order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function stateChecksum(state: SimState): string {
  const projection: Record<string, unknown> = { ...state, entities: [...state.entities].sort((a, b) => a.id - b.id) };
  for (const key of ["fog", "controlGroups", "commandOwner", "pathBudget", "viewOwner"]) delete projection[key];
  const surviving = (state.multiplayerOwners ?? []).filter((owner) => !(state.multiplayerEliminated ?? []).includes(owner));
  projection.result = state.winner === undefined && surviving.length > 1 ? "playing" : { winner: state.winner ?? null };
  const encoded = new TextEncoder().encode(JSON.stringify(canonical(projection)));
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < encoded.length; index++) {
    const code = encoded[index]!;
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x01000193);
  }
  return (first >>> 0).toString(16).padStart(8, "0") + (second >>> 0).toString(16).padStart(8, "0");
}

export function validChecksum(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{16}$/.test(value);
}
