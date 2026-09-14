import type { Facing } from "./types";

export type Camera = {
  x: number;
  y: number;
  zoom: number;
};

export const TILE_W = 64;
export const TILE_H = 32;
// Keep plateau and ridge depth readable without making units look like they are climbing cliffs.
export const HEIGHT_STEP = 14;

/** Convert tile coordinate delta to screen direction angle in radians [-pi, pi]. */
export function isoHeadingAngle(dx: number, dy: number): number {
  const sdx = (dx - dy) * (TILE_W / 2);
  const sdy = (dx + dy) * (TILE_H / 2);
  return Math.atan2(sdy, sdx);
}

/** Center screen angle in radians [-PI, PI] for each of the 8 isometric facings. */
export function isoFacingAngle(facing: Facing): number {
  switch (facing) {
    case 0: return 0;
    case 1: return Math.atan2(1, 2);
    case 2: return Math.PI / 2;
    case 3: return Math.atan2(1, -2);
    case 4: return Math.PI;
    case 5: return Math.atan2(-1, -2);
    case 6: return -Math.PI / 2;
    case 7: return Math.atan2(-1, 2);
  }
}

/** Convert any screen angle in radians to the nearest 8-way isometric Facing based on true 2:1 isometric sector midpoints. */
export function screenAngleToFacing(angle: number): Facing {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;

  // Sector boundaries are the midpoints between adjacent facing angles:
  // 7 <-> 0: -0.2318 rad (-13.28 deg)
  // 0 <-> 1: +0.2318 rad (+13.28 deg)
  // 1 <-> 2: +1.0172 rad (+58.28 deg)
  // 2 <-> 3: +2.1244 rad (+121.72 deg)
  // 3 <-> 4: +2.9098 rad (+166.72 deg)
  const b01 = 0.2318238;
  const b12 = 1.0172219;
  const b23 = 2.1243707;
  const b34 = 2.9097688;

  if (a >= -b01 && a < b01) return 0;
  if (a >= b01 && a < b12) return 1;
  if (a >= b12 && a < b23) return 2;
  if (a >= b23 && a < b34) return 3;
  if (a >= b34 || a < -b34) return 4;
  if (a >= -b34 && a < -b23) return 5;
  if (a >= -b23 && a < -b12) return 6;
  return 7;
}

/** Convert tile coordinate delta to the correct 8-way screen-isometric Facing. */
export function toIsometricFacing(dx: number, dy: number): Facing {
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return 0;
  const angle = isoHeadingAngle(dx, dy);
  return screenAngleToFacing(angle);
}

export function createCamera(): Camera {
  return { x: 400, y: 80, zoom: 1 };
}

export function tileToScreen(tx: number, ty: number, cam: Camera, elev = 0): { x: number; y: number } {
  return {
    x: (tx - ty) * (TILE_W / 2) * cam.zoom + cam.x,
    y: (tx + ty) * (TILE_H / 2) * cam.zoom + cam.y - elev * HEIGHT_STEP * cam.zoom,
  };
}

export function screenToTile(sx: number, sy: number, cam: Camera): { x: number; y: number } {
  const x = (sx - cam.x) / cam.zoom;
  const y = (sy - cam.y) / cam.zoom;
  const tx = x / (TILE_W / 2);
  const ty = y / (TILE_H / 2);
  return { x: (tx + ty) / 2, y: (ty - tx) / 2 };
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

/** Affine matrix mapping atlas cell (0,0)-(sw,sh) onto an isometric diamond. */
export function isoAtlasTransform(
  sx: number,
  sy: number,
  tw: number,
  th: number,
  sw: number,
  sh: number,
): [number, number, number, number, number, number] {
  return [tw / (2 * sw), th / (2 * sw), -tw / (2 * sh), th / (2 * sh), sx, sy];
}
