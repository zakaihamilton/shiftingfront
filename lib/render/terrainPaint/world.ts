import { isMountainScenery } from "../../gen/map";
import { type Camera, tileToScreen } from "../../iso";
import { type SimState, TILE_BLOCKED, TILE_WATER } from "../../types";
import {
  canvasDensity,
  canvasViewport,
  drawRenderCanvas,
  prepareRenderContext,
  resizeRenderCanvas,
} from "../canvasViewport";
import { type AtlasWorld, getTerrainAtlas } from "../terrainAtlas";
import { paintCell, paintCellProps, paintCellScatter, WATER_COVER } from "./cell";
import { SHROUD_FILL } from "./constants";
import {
  clearTerrainCullingCache,
  memoScenery,
  visibleTileRange,
  visitVisibleTiles,
} from "./culling";
import { drawBlockerProp } from "./details";
import { clearShroudMaskCache, paintShroudLayer } from "./shroud";

const SKIRT_BLUR_PX = 5;

let skirtCanvas: HTMLCanvasElement | null = null;
let surfaceCaches = new WeakMap<HTMLCanvasElement, { key: string; canvas: HTMLCanvasElement }>();

export { visibleTileRange, WATER_COVER };

export function clearTerrainPaintCache(): void {
  clearTerrainCullingCache();
  clearShroudMaskCache();
  skirtCanvas = null;
  surfaceCaches = new WeakMap();
}

function skirtRenderTarget(
  ctx: CanvasRenderingContext2D,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (
    typeof document === "undefined" ||
    typeof HTMLCanvasElement === "undefined" ||
    !(ctx.canvas instanceof HTMLCanvasElement)
  ) {
    return null;
  }
  if (!skirtCanvas) skirtCanvas = document.createElement("canvas");
  resizeRenderCanvas(skirtCanvas, canvasViewport(ctx.canvas), canvasDensity(ctx.canvas));
  const target = skirtCanvas.getContext("2d");
  if (!target) return null;
  prepareRenderContext(target);
  target.globalAlpha = 1;
  target.filter = "none";
  const viewport = canvasViewport(skirtCanvas);
  target.clearRect(0, 0, viewport.width, viewport.height);
  return { canvas: skirtCanvas, ctx: target };
}

export function paintTerrainSurface(
  ctx: CanvasRenderingContext2D,
  state: AtlasWorld,
  cam: Camera,
  gainAt?: (x: number, y: number) => number,
): void {
  const atlas = getTerrainAtlas(state);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const skirtTarget = skirtRenderTarget(ctx);
  const paintSkirt = (target: CanvasRenderingContext2D) => {
    // The decorative skirt sits behind the playable map. In particular, a
    // low-elevation skirt-water diamond must not paint over the lower edge of
    // a higher playable tile just because water is rendered in its own pass.
    visitVisibleTiles(target, state, cam, (x, y) => {
      const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
      if (inMap || memoScenery(state, x, y).kind !== TILE_WATER) return;
      paintCell(target, state, cam, atlas, x, y, true, gainAt);
    });
    visitVisibleTiles(target, state, cam, (x, y) => {
      const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
      if (inMap) return;
      paintCell(target, state, cam, atlas, x, y, false, gainAt);
    });
  };

  if (skirtTarget) {
    paintSkirt(skirtTarget.ctx);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.filter = `blur(${SKIRT_BLUR_PX}px)`;
    drawRenderCanvas(ctx, skirtTarget.canvas);
    ctx.restore();
  } else {
    paintSkirt(ctx);
  }

  // Paint water before land. Water is level 0, so drawing it after the land
  // pass makes its diamond cover the lower part of neighboring elevated land
  // and cliff faces, including neighbors earlier in isometric depth order.
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
    if (!inMap) return;
    paintCell(ctx, state, cam, atlas, x, y, true, gainAt);
  });
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
    if (!inMap) return;
    paintCell(ctx, state, cam, atlas, x, y, false, gainAt);
  });
  // Low scatter sits with the atlas so the shroud darkens unexplored clutter.
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    paintCellScatter(ctx, state, cam, x, y);
  });
}

export function paintTerrainBlockers(
  ctx: CanvasRenderingContext2D,
  state: AtlasWorld,
  cam: Camera,
  gainAt?: (x: number, y: number) => number,
): void {
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    const scenery = memoScenery(state, x, y);
    if (scenery.kind !== TILE_BLOCKED || isMountainScenery(scenery)) return;
    const s = tileToScreen(x, y, cam, scenery.elev);
    const gain = gainAt?.(x, y) ?? 1;
    ctx.save();
    ctx.globalAlpha = gain;
    drawBlockerProp(ctx, state, x, y, s.x, s.y, cam.zoom);
    ctx.restore();
  });
}

function paintCachedTerrainSurface(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
): void {
  if (typeof document === "undefined") {
    paintTerrainSurface(ctx, state, cam);
    return;
  }
  const atlas = getTerrainAtlas(state);
  const w = canvasViewport(ctx.canvas).width;
  const h = canvasViewport(ctx.canvas).height;
  const key = `${atlas.key}:${atlas.canvas ? "ready" : "pending"}:${cam.x}:${cam.y}:${cam.zoom}:${w}x${h}:${canvasDensity(ctx.canvas)}`;
  let cached = surfaceCaches.get(ctx.canvas);
  if (!cached || cached.key !== key) {
    const canvas = cached?.canvas ?? document.createElement("canvas");
    resizeRenderCanvas(canvas, { width: w, height: h }, canvasDensity(ctx.canvas));
    const surface = canvas.getContext("2d");
    if (!surface) {
      paintTerrainSurface(ctx, state, cam);
      return;
    }
    // The shroud below supplies visibility shading. Geometry, textures, and
    // the blurred skirt can survive fog refreshes without being repainted.
    prepareRenderContext(surface);
    surface.clearRect(0, 0, w, h);
    paintTerrainSurface(surface, state, cam);
    cached = { key, canvas };
    surfaceCaches.set(ctx.canvas, cached);
  }
  drawRenderCanvas(ctx, cached.canvas);
}

export function paintTerrainWorld(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
): void {
  const w = canvasViewport(ctx.canvas).width;
  const h = canvasViewport(ctx.canvas).height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = SHROUD_FILL;
  ctx.fillRect(0, 0, w, h);

  paintCachedTerrainSurface(ctx, state, cam);
  // Tall blockers and ore stay after the shroud and remain vision-gated.
  paintShroudLayer(ctx, state, cam);
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    paintCellProps(ctx, state, cam, x, y);
  });
}
