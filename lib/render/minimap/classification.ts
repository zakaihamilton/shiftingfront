import { footprintOf } from "../../catalog";
import type { ColorblindMode } from "../../persist/settings";
import { fogAt } from "../../sim/fog";
import {
  type Entity,
  isBuildingEntity,
  isHiddenObjectiveAsset,
  type SimState,
  TILE_BLOCKED,
  TILE_RESOURCE,
  TILE_WATER,
} from "../../types";
import { terrainColors } from "../terrainAtlas";

export type MinimapRegion =
  | "ground"
  | "elevation-mid"
  | "elevation-high"
  | "water"
  | "resource"
  | "blocked"
  | "road"
  | "concrete";

export function minimapRegionForCell(state: SimState, x: number, y: number): MinimapRegion {
  const i = y * state.width + x;
  const surface = state.surfaces[i] ?? 0;
  if (surface === 1) return "road";
  if (surface === 2) return "concrete";
  const tile = state.tiles[i];
  if (tile === TILE_WATER) return "water";
  if (tile === TILE_RESOURCE) return "resource";
  if (tile === TILE_BLOCKED) return "blocked";
  const elev = state.heights[i] ?? 1;
  if (elev >= 3) return "elevation-high";
  if (elev === 2) return "elevation-mid";
  return "ground";
}

export { terrainColors };

export function entityColor(e: Entity, state: SimState, mode: ColorblindMode = "none"): string {
  if (e.marked) return "#ffe066";
  if (e.neutral) return mode === "tritanopia" ? "#e2e8f0" : "#f5e6a8";
  const friendly = state.multiplayer ? e.owner === (state.viewOwner ?? 0) : e.owner === 0;
  if (mode === "deuteranopia" || mode === "protanopia") {
    if (friendly) {
      return "#38bdf8";
    }
    return "#fb923c";
  }
  if (mode === "tritanopia") {
    if (friendly) {
      return "#14b8a6";
    }
    return "#f43f5e";
  }
  const pal = state.factions[e.owner]?.palette;
  if (!pal) return "#888";
  // Minimap color communicates ownership; size already distinguishes units
  // from buildings, so initial and newly created friendly entities should not
  // be split into different shades based on their role.
  return pal.light;
}

export function minimapEntityVisible(state: SimState, e: Entity): boolean {
  const hostile = state.multiplayer ? e.owner !== (state.viewOwner ?? 0) : e.owner === 1;
  if (isBuildingEntity(e)) {
    const fp = footprintOf(e.kind);
    let visible = false;
    for (let dy = 0; dy < fp.h; dy++) {
      for (let dx = 0; dx < fp.w; dx++) {
        if (fogAt(state, e.x + dx, e.y + dy) === 2) {
          visible = true;
          break;
        }
      }
      if (visible) break;
    }
    if (hostile && !visible) return false;
    if (isHiddenObjectiveAsset(e) && !visible) return false;
    return true;
  }
  const fog = fogAt(state, Math.round(e.x), Math.round(e.y));
  if (hostile && fog !== 2) return false;
  // Hidden objective assets are owner-0 actors, so they need their own fog
  // check or their location would leak through the minimap.
  if (isHiddenObjectiveAsset(e) && fog !== 2) return false;
  return true;
}
