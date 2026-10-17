import { TILE_H, TILE_W, cameraViewQuad, screenToGroundTile, tileToScreen, type Camera } from "../iso";

export const PAN_STEP = 10;
export const MINIMAP_DRAG_THRESHOLD = 6;

export type CardinalPanDir = "left" | "right" | "up" | "down";
export type DiagonalPanDir = "up-left" | "up-right" | "down-left" | "down-right";
export type PanDir = CardinalPanDir | DiagonalPanDir;

export type CameraPanBounds = {
  mapWidth: number;
  mapHeight: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type CameraPanInput =
  | { space: "screen"; dx: number; dy: number }
  | { space: "map"; dx: number; dy: number };

export type PanAvailability = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

export type MinimapMapRect = { x: number; y: number; width: number; height: number };

export function cameraPanBounds(
  mapWidth: number,
  mapHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): CameraPanBounds {
  return { mapWidth, mapHeight, viewportWidth, viewportHeight };
}

/** The ground tile coordinate beneath the center of the camera viewport. */
export function cameraFocusPoint(cam: Camera, bounds: CameraPanBounds): { x: number; y: number } {
  return screenToGroundTile(bounds.viewportWidth / 2, bounds.viewportHeight / 2, cam);
}

function cameraOffsetForMapDelta(
  deltaX: number,
  deltaY: number,
  zoom: number,
): { dx: number; dy: number } {
  const screenX = (deltaX - deltaY) * (TILE_W / 2) * zoom;
  const screenY = (deltaX + deltaY) * (TILE_H / 2) * zoom;
  return {
    dx: -screenX,
    dy: -screenY,
  };
}

export function panInputToCameraOffset(input: CameraPanInput, zoom: number): { dx: number; dy: number } {
  return input.space === "screen"
    ? { dx: input.dx, dy: input.dy }
    : cameraOffsetForMapDelta(input.dx, input.dy, zoom);
}

/** Limit movement to a maximum projected screen distance while preserving its direction. */
export function capPanInput(input: CameraPanInput, maxScreenDistance: number, zoom: number): CameraPanInput {
  const offset = panInputToCameraOffset(input, zoom);
  const distance = Math.hypot(offset.dx, offset.dy);
  if (distance === 0 || distance <= maxScreenDistance) return input;
  const scale = maxScreenDistance / distance;
  return { ...input, dx: input.dx * scale, dy: input.dy * scale };
}

export function clampCamera(cam: Camera, bounds: CameraPanBounds): void {
  const focus = cameraFocusPoint(cam, bounds);
  const targetX = Math.max(0, Math.min(Math.max(0, bounds.mapWidth - 1), focus.x));
  const targetY = Math.max(0, Math.min(Math.max(0, bounds.mapHeight - 1), focus.y));
  const offset = cameraOffsetForMapDelta(targetX - focus.x, targetY - focus.y, cam.zoom);
  cam.x += offset.dx;
  cam.y += offset.dy;
}

/** Apply one screen-space or map-space camera movement and enforce battlefield bounds. */
export function panCamera(cam: Camera, input: CameraPanInput, bounds?: CameraPanBounds): void {
  const offset = panInputToCameraOffset(input, cam.zoom);
  cam.x += offset.dx;
  cam.y += offset.dy;
  if (bounds) clampCamera(cam, bounds);
}

/** Move the viewport along minimap/map axes while preserving projected speed. */
export function panInputForDirection(
  dir: PanDir,
  screenDistance: number,
  zoom = 1,
): Extract<CameraPanInput, { space: "map" }> {
  const dx = dir.includes("left") ? -1 : dir.includes("right") ? 1 : 0;
  const dy = dir.includes("up") ? -1 : dir.includes("down") ? 1 : 0;
  const projected = cameraOffsetForMapDelta(dx, dy, zoom);
  const distance = Math.hypot(projected.dx, projected.dy);
  const scale = distance === 0 ? 0 : screenDistance / distance;
  return { space: "map", dx: dx * scale, dy: dy * scale };
}

export function focusCameraAtTile(
  cam: Camera,
  tileX: number,
  tileY: number,
  bounds: CameraPanBounds,
  options: { elevation?: number; yBias?: number } = {},
): void {
  const anchor = tileToScreen(tileX, tileY, { x: 0, y: 0, zoom: cam.zoom }, options.elevation ?? 0);
  cam.x = bounds.viewportWidth / 2 - anchor.x;
  cam.y = bounds.viewportHeight * (options.yBias ?? 0.5) - anchor.y;
  clampCamera(cam, bounds);
}

export function canPan(cam: Camera, bounds: CameraPanBounds, dir: PanDir, epsilon = 0.0001): boolean {
  const before = cameraFocusPoint(cam, bounds);
  const next = { ...cam };
  panCamera(next, panInputForDirection(dir, 1), bounds);
  const after = cameraFocusPoint(next, bounds);
  return Math.hypot(after.x - before.x, after.y - before.y) > epsilon;
}

export function panAvailability(cam: Camera, bounds: CameraPanBounds, epsilon = 0.0001): PanAvailability {
  return {
    left: canPan(cam, bounds, "left", epsilon),
    right: canPan(cam, bounds, "right", epsilon),
    up: canPan(cam, bounds, "up", epsilon),
    down: canPan(cam, bounds, "down", epsilon),
  };
}

export function minimapPoint(
  pointerX: number,
  pointerY: number,
  minimapWidth: number,
  minimapHeight: number,
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number } {
  const rect = minimapMapRect(minimapWidth, minimapHeight, mapWidth, mapHeight);
  const px = Math.max(rect.x, Math.min(rect.x + rect.width, pointerX));
  const py = Math.max(rect.y, Math.min(rect.y + rect.height, pointerY));
  return {
    x: Math.max(0, Math.min(Math.max(0, mapWidth - 1), ((px - rect.x) / Math.max(1, rect.width)) * mapWidth - 0.5)),
    y: Math.max(0, Math.min(Math.max(0, mapHeight - 1), ((py - rect.y) / Math.max(1, rect.height)) * mapHeight - 0.5)),
  };
}

/** Fit the full map into the radar without stretching its square tile grid. */
export function minimapMapRect(
  minimapWidth: number,
  minimapHeight: number,
  mapWidth: number,
  mapHeight: number,
): MinimapMapRect {
  const safeMapWidth = Math.max(1, mapWidth);
  const safeMapHeight = Math.max(1, mapHeight);
  const scale = Math.min(minimapWidth / safeMapWidth, minimapHeight / safeMapHeight);
  const width = safeMapWidth * scale;
  const height = safeMapHeight * scale;
  return {
    x: (minimapWidth - width) / 2,
    y: (minimapHeight - height) / 2,
    width,
    height,
  };
}

export const EDGE_PAN_BAND = 36;
export const EDGE_PAN_DELAY_MS = 250;

export function panDirFromPointer(
  x: number,
  y: number,
  width: number,
  height: number,
  band = EDGE_PAN_BAND,
  avail?: PanAvailability,
): PanDir | null {
  if (x < 0 || y < 0 || x > width || y > height) return null;
  const horizontal = x <= band
    ? { dir: "left" as const, dist: x }
    : width - x <= band
      ? { dir: "right" as const, dist: width - x }
      : null;
  const vertical = y <= band
    ? { dir: "up" as const, dist: y }
    : height - y <= band
      ? { dir: "down" as const, dist: height - y }
      : null;

  if (horizontal && vertical) {
    // The mission directive lives in this corner; keep its collapse/expand
    // control free of edge-pan side effects.
    if (horizontal.dir === "right" && vertical.dir === "up") return null;
    const diagonal = `${vertical.dir}-${horizontal.dir}` as DiagonalPanDir;
    if (!avail || (avail[horizontal.dir] && avail[vertical.dir])) return diagonal;
  }

  const candidates: { dir: CardinalPanDir; dist: number }[] = [];
  if (horizontal) candidates.push(horizontal);
  if (vertical) candidates.push(vertical);
  const allowed = avail ? candidates.filter((candidate) => avail[candidate.dir]) : candidates;
  if (!allowed.length) return null;
  allowed.sort((a, b) => a.dist - b.dist);
  return allowed[0].dir;
}

export { cameraViewQuad, screenToGroundTile };
