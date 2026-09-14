import type { SimState } from "../../lib/types";

/** Assert the simulation's one-unit-per-rounded-cell invariant. */
export function expectUniqueUnitCells(state: SimState): void {
  const occupied = new Map<string, number>();
  for (const entity of state.entities) {
    if (entity.hp <= 0 || entity.class !== "unit") continue;
    const cell = `${Math.round(entity.x)},${Math.round(entity.y)}`;
    const previousId = occupied.get(cell);
    if (previousId !== undefined) {
      throw new Error(`units ${previousId} and ${entity.id} occupy ${cell}`);
    }
    occupied.set(cell, entity.id);
  }
}
