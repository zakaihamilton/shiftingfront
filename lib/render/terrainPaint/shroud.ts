import { type Camera, HEIGHT_STEP, TILE_H, TILE_W, tileToScreen } from "../../iso";
import type { SimState } from "../../types";
import {
  canvasDensity,
  canvasViewport,
  drawRenderCanvas,
  prepareRenderContext,
  resizeRenderCanvas,
} from "../canvasViewport";
import { fogTerrainGain, tileVariant } from "../terrainAtlas";
import { SHROUD_RGB } from "./constants";
import { memoScenery, visitVisibleTiles } from "./culling";
import { smoothFogGain } from "./details";
import { paintShroudMaskTile, paintShroudOverlay } from "./tile";

let shroudMask: HTMLCanvasElement | null = null;

export function clearShroudMaskCache(): void {
  shroudMask = null;
}

export function paintShroudLayer(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
): void {
  const w = canvasViewport(ctx.canvas).width;
  const h = canvasViewport(ctx.canvas).height;
  const z = cam.zoom;
  const tw = TILE_W * z;
  const th = TILE_H * z;
  const step = HEIGHT_STEP * z;
  const paintVisibleShroud = (
    target: CanvasRenderingContext2D,
    painter: typeof paintShroudOverlay,
  ) =>
    visitVisibleTiles(ctx, state, cam, (x, y) => {
      const scenery = memoScenery(state, x, y);
      const s = tileToScreen(x, y, cam, scenery.elev);
      const dropE = Math.max(0, scenery.elev - memoScenery(state, x + 1, y).elev);
      const dropS = Math.max(0, scenery.elev - memoScenery(state, x, y + 1).elev);
      painter(
        target,
        s.x,
        s.y,
        tw,
        th,
        dropE,
        dropS,
        step,
        smoothFogGain(state, x, y),
        z,
        x,
        y,
        tileVariant(state.seed, x, y),
        state,
      );
    });
  if (typeof document === "undefined") {
    paintVisibleShroud(ctx, paintShroudOverlay);
    return;
  }
  if (!shroudMask) shroudMask = document.createElement("canvas");
  resizeRenderCanvas(shroudMask, { width: w, height: h }, canvasDensity(ctx.canvas));
  const fog = shroudMask.getContext("2d");
  if (!fog) {
    paintVisibleShroud(ctx, paintShroudOverlay);
    return;
  }
  prepareRenderContext(fog);
  fog.globalCompositeOperation = "source-over";
  fog.globalAlpha = 1;
  fog.clearRect(0, 0, w, h);
  const overlay = 1 - fogTerrainGain(0);
  fog.fillStyle = `rgba(${SHROUD_RGB.r}, ${SHROUD_RGB.g}, ${SHROUD_RGB.b}, ${overlay})`;
  fog.fillRect(0, 0, w, h);
  fog.globalCompositeOperation = "destination-out";
  paintVisibleShroud(fog, paintShroudMaskTile);
  fog.globalCompositeOperation = "source-over";
  fog.globalAlpha = 1;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  drawRenderCanvas(ctx, shroudMask);
  ctx.restore();
}
