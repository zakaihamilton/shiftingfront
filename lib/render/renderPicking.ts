import { HEIGHT_STEP, TILE_H, TILE_W, screenToGroundTile, tileToScreen, type Camera } from "../iso";
import { buildingAt, groundHeight, heightAt } from "../sim/world";
import { fogAt } from "../sim/fog";
import { isHiddenObjectiveAsset, type Entity, type SimState } from "../types";

export function entityElev(state: SimState, e: Entity): number {
  return e.class === "unit" ? groundHeight(state, e.x, e.y) : heightAt(state, Math.round(e.x), Math.round(e.y));
}

function pointInDiamond(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return diamondDistance(px, py, x, y, w, h) <= 1.02;
}

/** Normalized distance from a point to the center of a projected tile. */
function diamondDistance(px: number, py: number, x: number, y: number, w: number, h: number): number {
  const cx = x;
  const cy = y + h / 2;
  return Math.abs(px - cx) / (w / 2) + Math.abs(py - cy) / (h / 2);
}

export function pickTile(
  state: SimState,
  sx: number,
  sy: number,
  cam: Camera,
): { x: number; y: number } | null {
  const maxElev = 3;
  const g = screenToGroundTile(sx, sy + maxElev * HEIGHT_STEP * cam.zoom, cam);
  const cx = Math.round(g.x);
  const cy = Math.round(g.y);
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  let bestDepth = -Infinity;
  const tw = TILE_W * cam.zoom;
  const th = TILE_H * cam.zoom;
  const r = 4;
  const x0 = Math.max(0, cx - r);
  const y0 = Math.max(0, cy - r);
  const x1 = Math.min(state.width - 1, cx + r);
  const y1 = Math.min(state.height - 1, cy + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const elev = heightAt(state, x, y);
      const s = tileToScreen(x, y, cam, elev);
      if (!pointInDiamond(sx, sy, s.x, s.y, tw, th)) continue;
      const distance = diamondDistance(sx, sy, s.x, s.y, tw, th);
      const depth = (x + y) * 16 + elev;
      if (
        distance < bestDistance - 1e-9 ||
        (Math.abs(distance - bestDistance) <= 1e-9 && depth >= bestDepth)
      ) {
        bestDistance = distance;
        bestDepth = depth;
        best = { x, y };
      }
    }
  }
  return best;
}

export function entityVisible(state: SimState, e: Entity): boolean {
  const tx = Math.round(e.x);
  const ty = Math.round(e.y);
  const fog = fogAt(state, tx, ty);
  if (e.owner === 1 && fog !== 2) return false;
  if (isHiddenObjectiveAsset(e) && fog !== 2) return false;
  return true;
}

const entityVisibility = new Map<number, { alpha: number; target: number; timeMs: number }>();

export function clearEntityVisibilityCache(): void {
  entityVisibility.clear();
}

export function entityVisibilityCacheSize(): number {
  return entityVisibility.size;
}

export function pruneEntityVisibilityCache(liveIds: Iterable<number>): void {
  const live = liveIds instanceof Set ? liveIds : new Set(liveIds);
  for (const id of entityVisibility.keys()) {
    if (!live.has(id)) entityVisibility.delete(id);
  }
}

export function renderEntityOpacity(state: SimState, e: Entity, timeMs: number): number {
  if (e.owner === 0 || e.class !== "unit") return entityVisible(state, e) ? 1 : 0;
  const fog = fogAt(state, Math.round(e.x), Math.round(e.y));
  // A hostile contact is fully readable on the first frame it enters
  // revealed space. Revealed fog is persistent, so an old hidden alpha must
  // not fade the unit back in after discovery.
  if (fog === 2) {
    entityVisibility.set(e.id, { alpha: 1, target: 1, timeMs });
    return 1;
  }
  const target = fog === 1 ? 0.22 : 0;
  const previous = entityVisibility.get(e.id);
  if (!previous) {
    entityVisibility.set(e.id, { alpha: target, target, timeMs });
    return target;
  }
  if (previous.target !== target) previous.target = target;
  const elapsed = Math.max(0, timeMs - previous.timeMs);
  const blend = 1 - Math.exp(-elapsed / 120);
  previous.alpha += (previous.target - previous.alpha) * blend;
  previous.timeMs = timeMs;
  return previous.alpha;
}

export function visibleBuildingAt(state: SimState, x: number, y: number): Entity | undefined {
  if (fogAt(state, x, y) === 0) return undefined;
  const b = buildingAt(state, x, y);
  if (!b || b.hp <= 0 || !entityVisible(state, b)) return undefined;
  return b;
}

export function entityAtPointer(state: SimState, sx: number, sy: number, cam: Camera): Entity | undefined {
  const tile = pickTile(state, sx, sy, cam);
  let bestUnit: Entity | undefined;
  let bestD = 28 * cam.zoom;
  for (const e of state.entities) {
    // Hover inspection is intentionally broader than player selection: a
    // discovered stranded unit can show its objective tooltip without being
    // eligible for commands.
    if (e.hp <= 0 || e.class !== "unit" || !entityVisible(state, e)) continue;
    const elev = groundHeight(state, e.x, e.y);
    const s = tileToScreen(e.x, e.y, cam, elev);
    const d = Math.hypot(sx - s.x, sy - (s.y + (TILE_H / 2) * cam.zoom - 12 * cam.zoom));
    if (d < bestD) {
      bestD = d;
      bestUnit = e;
    }
  }
  if (bestUnit) return bestUnit;
  if (!tile) return undefined;
  return visibleBuildingAt(state, tile.x, tile.y);
}
