import { isPlayerSelectableUnit, type Entity, type SimState } from "../types";
import { groundHeight } from "../sim/world";
import { TILE_H, tileToScreen, type Camera } from "../iso";
import { pickTile, visibleBuildingAt } from "./renderer";
import { entityVisible } from "./renderPicking";

/** Screen-space pick: units first so vehicles overlapping a building stay selectable. */
export function pickEntity(state: SimState, sx: number, sy: number, cam: Camera, allowNeutral = false): Entity | undefined {
  let bestUnit: Entity | undefined;
  let bestD = Infinity;
  const z = cam.zoom;
  for (const e of state.entities) {
    if (!isPlayerSelectableUnit(e) || e.hp <= 0 || (!allowNeutral && e.neutral) || !entityVisible(state, e)) continue;
    const elev = groundHeight(state, e.x, e.y);
    const s = tileToScreen(e.x, e.y, cam, elev);
    const bodyX = s.x;
    const bodyY = s.y + (TILE_H / 2) * z - 12 * z;
    const radius = e.kind === "harvester" || e.kind === "tank" || e.kind === "repairTruck" || e.kind === "convoyTruck" ? 42 * z : 30 * z;
    const d = Math.hypot(sx - bodyX, sy - bodyY);
    if (d <= radius && d < bestD) {
      bestD = d;
      bestUnit = e;
    }
  }
  if (bestUnit) return bestUnit;
  const tile = pickTile(state, sx, sy, cam);
  if (!tile) return undefined;
  return visibleBuildingAt(state, tile.x, tile.y);
}

/** Drop harvesters from a multi-select unless the box contains only harvesters. */
export function finalizeMultiSelect(entities: readonly Entity[], ids: readonly number[]): number[] {
  const kinds = new Map(entities.map((entity) => [entity.id, entity.kind]));
  const combat = ids.filter((id) => kinds.get(id) !== "harvester");
  return combat.length > 0 ? combat : [...ids];
}
