import { HEIGHT_STEP, TILE_H, TILE_W, tileToScreen, type Camera } from "@/lib/iso";
import { footprintOf } from "@/lib/catalog";
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
const CINEMA_VIEW_MARGIN = 18;

function cinemaCameraAtZoom(
  scene: CinemaScene,
  w: number,
  h: number,
  target: { x: number; y: number },
  offset: { x: number; y: number },
  zoom: number,
): Camera {
  const elev = smoothElevAt(scene.map, target.x, target.y);
  return {
    zoom,
    x: Math.round(w / 2 - (target.x - target.y) * (TILE_W / 2) * zoom + offset.x),
    y: Math.round(h / 2 - (target.x + target.y) * (TILE_H / 2) * zoom + elev * HEIGHT_STEP * zoom + offset.y),
  };
}

function cinemaEntityProjection(
  scene: CinemaScene,
  entity: { class: string; kind: string; x: number; y: number; hp: number },
  cam: Camera,
): { x: number; y: number; halfWidth: number; halfHeight: number } {
  const isBuilding = entity.class === "building";
  const footprint = isBuilding ? footprintOf(entity.kind as Parameters<typeof footprintOf>[0]) : undefined;
  const x = isBuilding ? entity.x + (footprint!.w - 1) / 2 : entity.x;
  const y = isBuilding ? entity.y + (footprint!.h - 1) / 2 : entity.y;
  const elev = isBuilding
    ? scene.map.heights[Math.floor(entity.y) * scene.map.width + Math.floor(entity.x)] ?? 1
    : smoothElevAt(scene.map, x, y);
  const screen = tileToScreen(x, y, cam, elev);
  return {
    x: screen.x,
    y: screen.y,
    halfWidth: (isBuilding ? 96 : 36) * cam.zoom,
    halfHeight: (isBuilding ? 88 : 36) * cam.zoom,
  };
}

function cinemaFitZoom(
  scene: CinemaScene,
  w: number,
  h: number,
  target: { x: number; y: number },
  offset: { x: number; y: number },
): number {
  const entities = scene.cameraFramingEntities ?? scene.state.entities;
  const fits = (zoom: number): boolean => {
    const cam = cinemaCameraAtZoom(scene, w, h, target, offset, zoom);
    return entities.every((entity) => {
      if (entity.hp <= 0) return true;
      const projected = cinemaEntityProjection(scene, entity, cam);
      return projected.x - projected.halfWidth >= CINEMA_VIEW_MARGIN
        && projected.x + projected.halfWidth <= w - CINEMA_VIEW_MARGIN
        && projected.y - projected.halfHeight >= CINEMA_VIEW_MARGIN
        && projected.y + projected.halfHeight <= h - CINEMA_VIEW_MARGIN;
    });
  };

  const minZoom = 0.35;
  if (fits(PIP_ZOOM)) return PIP_ZOOM;
  let lo = minZoom;
  let hi = PIP_ZOOM;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export const SHOT_OFFSETS: readonly { x: number; y: number }[] = [
  { x: -10, y: -6 },
  { x: 10, y: 6 },
  { x: -8, y: 8 },
  { x: 8, y: -8 },
  { x: -12, y: 2 },
  { x: 12, y: -2 },
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

  // Keep the camera stable for a play window while still giving each scenario
  // a distinct subject. The focus points are captured before simulation starts
  // so moving actors never make the camera jitter or chase the fight.
  const subject = scene.cameraFocusPoints?.[shotIndex] ?? focus;
  const anchor = scene.cameraFocus ?? scene.combatEpicenter ?? focus;
  const focusWeight = shot.type === "building" ? 0.34 : 0.24;
  const tx = anchor.x + (subject.x - anchor.x) * focusWeight;
  const ty = anchor.y + (subject.y - anchor.y) * focusWeight;

  const zoom = cinemaFitZoom(scene, w, h, { x: tx, y: ty }, off);
  return cinemaCameraAtZoom(scene, w, h, { x: tx, y: ty }, off, zoom);
}
