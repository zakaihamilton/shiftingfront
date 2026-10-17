import type { Facing } from "./types";

export type Camera = {
  x: number;
  y: number;
  zoom: number;
};

export const TILE_W = 64;
export const TILE_H = 64;
// Retained for altitude effects; the orthographic ground projection does not shift map tiles by height.
export const HEIGHT_STEP = 14;

/** Convert a map direction to its screen angle in the orthographic view. */
export function isoHeadingAngle(dx: number, dy: number): number {
  return Math.atan2(dy, dx);
}

/** Center screen angle in radians [-PI, PI] for each of the 8 compass facings. */
export function isoFacingAngle(facing: Facing): number {
  const angle = (facing * Math.PI) / 4;
  return angle > Math.PI ? angle - Math.PI * 2 : angle;
}

/** Screen-space degrees in [0, 360) for a compass facing, matching isoFacingAngle. */
export function isoFacingAngleDegrees(facing: Facing): number {
  let degrees = isoFacingAngle(facing) * (180 / Math.PI);
  if (degrees < 0) degrees += 360;
  return Math.round(degrees * 1000) / 1000;
}

/** Convert any screen angle in radians to the nearest 8-way compass facing. */
export function screenAngleToFacing(angle: number): Facing {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return (((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8) as Facing;
}

/** Convert map coordinate delta to the matching 8-way screen Facing. */
export function toIsometricFacing(dx: number, dy: number): Facing {
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return 0;
  const angle = isoHeadingAngle(dx, dy);
  return screenAngleToFacing(angle);
}

export function createCamera(): Camera {
  // A top-down map starts at its upper-left corner. Gameplay focuses the
  // player's base once the viewport dimensions are known.
  return { x: 0, y: 0, zoom: 1 };
}

export function tileToScreen(tx: number, ty: number, cam: Camera, elev = 0): { x: number; y: number } {
  // Map coordinates anchor the center of each square tile along its top edge.
  // Terrain and object ground positions stay aligned regardless of elevation;
  // altitude is represented by art and shadows in the flat top-down view.
  void elev;
  return {
    x: tx * TILE_W * cam.zoom + cam.x,
    y: ty * TILE_H * cam.zoom + cam.y,
  };
}

export function screenToTile(sx: number, sy: number, cam: Camera): { x: number; y: number } {
  return {
    x: (sx - cam.x) / (TILE_W * cam.zoom),
    y: (sy - cam.y) / (TILE_H * cam.zoom),
  };
}

export function screenToGroundTile(sx: number, sy: number, cam: Camera): { x: number; y: number } {
  return screenToTile(sx, sy - (TILE_H / 2) * cam.zoom, cam);
}

export function cameraViewQuad(
  cam: Camera,
  screenW: number,
  screenH: number,
): [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] {
  return [
    screenToGroundTile(0, 0, cam),
    screenToGroundTile(screenW, 0, cam),
    screenToGroundTile(screenW, screenH, cam),
    screenToGroundTile(0, screenH, cam),
  ];
}

export function expandIsoDiamond(
  x: number,
  y: number,
  w: number,
  h: number,
  overlap: number,
): { x: number; y: number; w: number; h: number } {
  const nw = w * overlap;
  const nh = h * overlap;
  return { x, y: y - (nh - h) * 0.5, w: nw, h: nh };
}

/** Affine matrix mapping atlas cell (0,0)-(sw,sh) onto a square map tile. */
export function isoAtlasTransform(
  sx: number,
  sy: number,
  tw: number,
  th: number,
  sw: number,
  sh: number,
): [number, number, number, number, number, number] {
  return [tw / sw, 0, 0, th / sh, sx - tw / 2, sy];
}
