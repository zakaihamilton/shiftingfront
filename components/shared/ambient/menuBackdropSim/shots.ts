import { HEIGHT_STEP, TILE_H, TILE_W, type Camera } from "@/lib/iso";
import type { CinemaScene } from "./scene";

export type CinemaShot =
  | { type: "actor"; index: number }
  | { type: "building"; index: number };

/** Distinct PIP framings: mobile engagements and real structures under fire. */
export const CINEMA_SHOTS: readonly CinemaShot[] = [
  { type: "actor", index: 1 },
  { type: "actor", index: 0 },
  { type: "building", index: 0 },
  { type: "actor", index: 2 },
  { type: "actor", index: 3 },
  { type: "building", index: 1 },
];

export const PREVIEW_SHOT_COUNT = CINEMA_SHOTS.length;

export const PIP_ZOOM = 1.5;

export const SHOT_OFFSETS: readonly { x: number; y: number }[] = [
  { x: -5, y: -3 },
  { x: 5, y: 3 },
  { x: -4, y: 4 },
  { x: 4, y: -4 },
  { x: -6, y: 1 },
  { x: 6, y: -1 },
];

function smoothElevAt(map: { width: number; height: number; heights: number[] }, tx: number, ty: number): number {
  const x0 = Math.max(0, Math.min(map.width - 1, Math.floor(tx)));
  const y0 = Math.max(0, Math.min(map.height - 1, Math.floor(ty)));
  const x1 = Math.min(map.width - 1, x0 + 1);
  const y1 = Math.min(map.height - 1, y0 + 1);
  const fx = tx - x0;
  const fy = ty - y0;
  const w = map.width;
  const h00 = map.heights[y0 * w + x0] ?? 1;
  const h10 = map.heights[y0 * w + x1] ?? 1;
  const h01 = map.heights[y1 * w + x0] ?? 1;
  const h11 = map.heights[y1 * w + x1] ?? 1;
  const top = h00 + (h10 - h00) * fx;
  const bot = h01 + (h11 - h01) * fx;
  return top + (bot - top) * fy;
}

export function cinemaShotCamera(
  scene: CinemaScene,
  shotIndex: number,
  w: number,
  h: number,
): Camera {
  const shot = CINEMA_SHOTS[((shotIndex % CINEMA_SHOTS.length) + CINEMA_SHOTS.length) % CINEMA_SHOTS.length]!;
  const focus = shot.type === "actor" ? scene.actors[shot.index]! : scene.buildings[shot.index]!;
  const off = SHOT_OFFSETS[((shotIndex % SHOT_OFFSETS.length) + SHOT_OFFSETS.length) % SHOT_OFFSETS.length]!;

  // Keep the map focus fixed for the full play window. Buildings are placed
  // around this anchor and remain visible without following moving units.
  const tx = scene.combatEpicenter ? scene.combatEpicenter.x : focus.x;
  const ty = scene.combatEpicenter ? scene.combatEpicenter.y : focus.y;

  const elev = smoothElevAt(scene.map, tx, ty);
  const zoom = PIP_ZOOM;

  return {
    zoom,
    x: Math.round(w / 2 - (tx - ty) * (TILE_W / 2) * zoom + off.x),
    y: Math.round(h / 2 - (tx + ty) * (TILE_H / 2) * zoom + elev * HEIGHT_STEP * zoom + off.y),
  };
}
