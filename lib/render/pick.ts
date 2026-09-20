import { isPlayerSelectableUnit, type Entity, type SimState } from "../types";
import { isAirUnit } from "../catalog";
import { TILE_H, tileToScreen, type Camera } from "../iso";
import { pickTile, visibleBuildingAt } from "./renderer";
import { AIR_UNIT_RENDER_ELEVATION, entityElev, entityVisible } from "./renderPicking";
import { unitRenderPosition, updateUnitHistory } from "./gl/unitTransformTracker";
import { groundHeight } from "../sim/world";

/** Screen-space pick: units first so vehicles overlapping a building stay selectable. */
export function pickEntity(
  state: SimState,
  sx: number,
  sy: number,
  cam: Camera,
  allowNeutral = false,
  clockMs = typeof performance !== "undefined" ? performance.now() : state.tick * (1000 / 12),
): Entity | undefined {
  updateUnitHistory(state, clockMs);
  let bestUnit: Entity | undefined;
  let bestD = Infinity;
  const z = cam.zoom;
  for (const e of state.entities) {
    if (!isPlayerSelectableUnit(e) || e.hp <= 0 || (!allowNeutral && e.neutral) || !entityVisible(state, e)) continue;
    const visual = e.class === "unit" && isAirUnit(e.kind) ? unitRenderPosition(e, clockMs) : undefined;
    const x = visual?.x ?? e.x;
    const y = visual?.y ?? e.y;
    const elev = visual
      ? groundHeight(state, x, y) + AIR_UNIT_RENDER_ELEVATION * visual.airborneMix
      : entityElev(state, e);
    const s = tileToScreen(x, y, cam, elev);
    const bodyX = s.x;
    const bodyY = s.y + (TILE_H / 2) * z - 12 * z;
    const unitKind = e.class === "unit" ? e.kind : undefined;
    const radius = unitKind && isAirUnit(unitKind) ? 38 * z
      : unitKind === "harvester" || unitKind === "tank" || unitKind === "repairTruck" || unitKind === "convoyTruck" ? 42 * z
        : 30 * z;
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
