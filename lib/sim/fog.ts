import { BUILDING_STATS, UNIT_STATS, footprintOf } from "../catalog";
import { MAP_SKIRT } from "../gen/map";
import { isBuildingEntity, isHiddenObjectiveAsset, isUnitEntity, type SimState } from "../types";
import { livingView } from "./world";

export function fogGridWidth(mapW: number): number {
  return mapW + 2 * MAP_SKIRT;
}

export function fogGridHeight(mapH: number): number {
  return mapH + 2 * MAP_SKIRT;
}

export function makeFog(mapW: number, mapH: number, fill = 0): number[] {
  return new Array(fogGridWidth(mapW) * fogGridHeight(mapH)).fill(fill);
}

function isPaddedFog(state: { width: number; height: number; fog: number[] }): boolean {
  return state.fog.length === fogGridWidth(state.width) * fogGridHeight(state.height);
}

export function expandFog(fog: number[], width: number, height: number): number[] {
  const expected = fogGridWidth(width) * fogGridHeight(height);
  if (fog.length === expected) return fog;
  const next = makeFog(width, height, 0);
  if (fog.length === width * height) {
    const gw = fogGridWidth(width);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        next[(y + MAP_SKIRT) * gw + (x + MAP_SKIRT)] = fog[y * width + x] ?? 0;
      }
    }
  }
  return next;
}

export function fogIndex(state: { width: number; height: number; fog: number[] }, x: number, y: number): number | null {
  if (isPaddedFog(state)) {
    if (x < -MAP_SKIRT || y < -MAP_SKIRT || x >= state.width + MAP_SKIRT || y >= state.height + MAP_SKIRT) {
      return null;
    }
    return (y + MAP_SKIRT) * fogGridWidth(state.width) + (x + MAP_SKIRT);
  }
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
  return y * state.width + x;
}

export function fogAt(state: { width: number; height: number; fog: number[] }, x: number, y: number): number {
  const i = fogIndex(state, x, y);
  if (i === null) return 0;
  return state.fog[i] ?? 0;
}

/** Whether a tile is inside a current player-controlled sight radius. */
export function tileInPlayerVision(state: SimState, x: number, y: number): boolean {
  for (const e of livingView(state)) {
    if (e.owner !== 0 || isHiddenObjectiveAsset(e)) continue;
    const sight = isUnitEntity(e)
      ? UNIT_STATS[e.kind].sight
      : isBuildingEntity(e) ? BUILDING_STATS[e.kind].sight : 0;
    let cx = e.x;
    let cy = e.y;
    if (isBuildingEntity(e)) {
      const fp = footprintOf(e.kind);
      cx = e.x + (fp.w - 1) / 2;
      cy = e.y + (fp.h - 1) / 2;
    }
    if (Math.hypot(x - cx, y - cy) <= sight) return true;
  }
  return false;
}

export function tickFog(state: SimState): void {
  state.fog = expandFog(state.fog, state.width, state.height);
  const x0 = -MAP_SKIRT;
  const y0 = -MAP_SKIRT;
  const x1 = state.width + MAP_SKIRT;
  const y1 = state.height + MAP_SKIRT;
  for (const e of livingView(state)) {
    // Rescue and extraction targets are owner-0 entities for objective
    // bookkeeping, but they are not player-controlled vision sources until
    // contacted.
    if (e.owner !== 0 || isHiddenObjectiveAsset(e)) continue;
    const sight = isUnitEntity(e)
      ? UNIT_STATS[e.kind].sight
      : isBuildingEntity(e) ? BUILDING_STATS[e.kind].sight : 0;
    const r = Math.ceil(sight);
    let cx = e.x;
    let cy = e.y;
    if (isBuildingEntity(e)) {
      const fp = footprintOf(e.kind);
      cx = e.x + (fp.w - 1) / 2;
      cy = e.y + (fp.h - 1) / 2;
    }
    const ox = Math.round(cx);
    const oy = Math.round(cy);
    for (let y = oy - r; y <= oy + r; y++) {
      for (let x = ox - r; x <= ox + r; x++) {
        if (x < x0 || y < y0 || x >= x1 || y >= y1) continue;
        if (Math.hypot(x - cx, y - cy) > sight) continue;
        const i = fogIndex(state, x, y);
        if (i !== null) state.fog[i] = 2;
      }
    }
  }
}
