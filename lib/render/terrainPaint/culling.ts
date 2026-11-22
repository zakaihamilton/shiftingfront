import { MAP_SKIRT } from "../../gen/map";
import { type Camera, HEIGHT_STEP, screenToTile, TILE_H, TILE_W, tileToScreen } from "../../iso";
import { canvasViewport } from "../canvasViewport";
import { SceneryMemo } from "../sceneryMemo";
import type { AtlasWorld } from "../terrainAtlas";

const sceneryMemo = new SceneryMemo();

export function clearTerrainCullingCache(): void {
  sceneryMemo.clear();
}

export function memoScenery(state: AtlasWorld & { tick?: number }, x: number, y: number) {
  return sceneryMemo.sample(state, x, y);
}

export function visibleTileRange(
  cam: Camera,
  screenW: number,
  screenH: number,
  mapWidth: number,
  mapHeight: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const marginX = TILE_W * cam.zoom * 2;
  const marginY = TILE_H * cam.zoom * 2;
  const elevLift = 4 * HEIGHT_STEP * cam.zoom;
  const cliffDrop = TILE_H * cam.zoom * 6;
  const samples = [
    screenToTile(-marginX, -marginY - elevLift, cam),
    screenToTile(screenW + marginX, -marginY - elevLift, cam),
    screenToTile(screenW + marginX, screenH + marginY + cliffDrop, cam),
    screenToTile(-marginX, screenH + marginY + cliffDrop, cam),
  ];
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of samples) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const pad = 6;
  const x0 = Math.max(-MAP_SKIRT, Math.floor(minX) - pad);
  const y0 = Math.max(-MAP_SKIRT, Math.floor(minY) - pad);
  const x1 = Math.min(mapWidth + MAP_SKIRT, Math.ceil(maxX) + pad + 1);
  const y1 = Math.min(mapHeight + MAP_SKIRT, Math.ceil(maxY) + pad + 1);
  return { x0, y0, x1, y1 };
}

export function visitVisibleTiles(
  ctx: CanvasRenderingContext2D,
  state: AtlasWorld,
  cam: Camera,
  visit: (x: number, y: number) => void,
): void {
  const w = canvasViewport(ctx.canvas).width;
  const h = canvasViewport(ctx.canvas).height;
  const margin = TILE_W * cam.zoom * 2;
  const range = visibleTileRange(cam, w, h, state.width, state.height);
  const x0 = range.x0;
  const y0 = range.y0;
  const x1 = range.x1;
  const y1 = range.y1;
  if (x0 >= x1 || y0 >= y1) return;
  const depth0 = x0 + y0;
  const depth1 = x1 - 1 + (y1 - 1);
  for (let depth = depth0; depth <= depth1; depth++) {
    const xs = Math.max(x0, depth - (y1 - 1));
    const xe = Math.min(x1 - 1, depth - y0);
    for (let x = xs; x <= xe; x++) {
      const y = depth - x;
      const elev = memoScenery(state, x, y).elev;
      const s = tileToScreen(x, y, cam, elev);
      if (s.x < -margin || s.y < -margin || s.x > w + margin || s.y > h + margin) continue;
      visit(x, y);
    }
  }
}
