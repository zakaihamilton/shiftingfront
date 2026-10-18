import type { Rng } from "../../../seed/rng";
import type { SurfaceKind, Vec2 } from "../../../types";
import { SURFACE_CONCRETE, SURFACE_NONE, TILE_CLEAR, TILE_RESOURCE } from "../../../types";
import { idx, inBounds } from "../terrain";

export function resourcePatch(
  tiles: number[],
  resourceAmount: number[],
  surfaces: SurfaceKind[],
  w: number,
  h: number,
  center: Vec2,
  radius: number,
  rng: Rng,
): void {
  for (let y = center.y - radius; y <= center.y + radius; y++) {
    for (let x = center.x - radius; x <= center.x + radius; x++) {
      if (!inBounds(x, y, w, h)) continue;
      if (Math.hypot(x - center.x, y - center.y) > radius + rng.next() * 0.35) continue;
      const i = idx(x, y, w);
      if (tiles[i] !== TILE_CLEAR || surfaces[i] === SURFACE_CONCRETE) continue;
      tiles[i] = TILE_RESOURCE;
      surfaces[i] = SURFACE_NONE;
      resourceAmount[i] = 480 + rng.int(421);
    }
  }
}

export function resourceCenterNear(
  tiles: number[],
  surfaces: SurfaceKind[],
  distances: Int32Array,
  width: number,
  height: number,
  origin: Vec2,
  preferred: Vec2,
): Vec2 {
  let best: Vec2 | undefined;
  let bestDistance = Infinity;
  for (let y = Math.max(0, origin.y - 12); y <= Math.min(height - 1, origin.y + 12); y++) {
    for (let x = Math.max(0, origin.x - 12); x <= Math.min(width - 1, origin.x + 12); x++) {
      const distanceFromOrigin = Math.hypot(x - origin.x, y - origin.y);
      if (distanceFromOrigin < 7 || distanceFromOrigin > 12) continue;
      const i = idx(x, y, width);
      if (distances[i]! < 0 || distances[i]! > 28 || tiles[i] !== TILE_CLEAR || surfaces[i] === SURFACE_CONCRETE) continue;
      const distanceFromPreferred = Math.hypot(x - preferred.x, y - preferred.y);
      if (distanceFromPreferred < bestDistance) {
        bestDistance = distanceFromPreferred;
        best = { x, y };
      }
    }
  }
  return best ?? preferred;
}

/** Used when the preferred ring is high ground and cannot take a starter patch. */
export function resourceCenterOnOpenGround(
  tiles: number[],
  surfaces: SurfaceKind[],
  heights: number[],
  distances: Int32Array,
  width: number,
  height: number,
  origin: Vec2,
  preferred: Vec2,
): Vec2 | undefined {
  let best: Vec2 | undefined;
  let bestDistance = Infinity;
  for (let y = Math.max(0, origin.y - 14); y <= Math.min(height - 1, origin.y + 14); y++) {
    for (let x = Math.max(0, origin.x - 14); x <= Math.min(width - 1, origin.x + 14); x++) {
      const distanceFromOrigin = Math.hypot(x - origin.x, y - origin.y);
      if (distanceFromOrigin < 7 || distanceFromOrigin > 14) continue;
      const i = idx(x, y, width);
      if (distances[i]! < 0 || distances[i]! > 48 || tiles[i] !== TILE_CLEAR || surfaces[i] === SURFACE_CONCRETE || (heights[i] ?? 0) >= 3) continue;
      const distanceFromPreferred = Math.hypot(x - preferred.x, y - preferred.y);
      if (distanceFromPreferred < bestDistance) {
        bestDistance = distanceFromPreferred;
        best = { x, y };
      }
    }
  }
  return best;
}
