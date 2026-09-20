import { footprintOf } from "../../../catalog";
import type { SimState } from "../../../types";
import { animClock } from "../../anim";
import { type Camera } from "../../../iso";
import { scrollLayerBlitOffset, scrollLayerNeedsRebuild, scrollLayerPaintCamera, terrainScrollPad } from "../../scrollLayer";
import { paintBuildingPlates, paintTerrainWorld } from "../../terrainPaint";
import { paintOreGlints, paintTerrainAtmosphere, paintTerrainWeather, paintWaterFx } from "../../terrainWeather";
import { drawObjectiveZone } from "../../renderOverlays";
import { entityVisible, entityElev } from "../../renderPicking";
import { canPlaceBuilding, heightAt } from "../../../sim/world";
import { drawDiamond, type RenderExtras } from "../../renderOverlays";
import { TILE_H, TILE_W, tileToScreen } from "../../../iso";

import {
  ensureTerrainCanvas,
  terrainContentKey,
  terrainScroll,
} from "../cache";

function paintTerrain(ctx: CanvasRenderingContext2D, state: SimState, cam: Camera): void {
  paintTerrainWorld(ctx, state, cam);
}

export function renderTerrainPhase(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  w: number,
  h: number,
  extras: RenderExtras,
  hoverTile: { x: number; y: number } | null,
): void {
  const pad = terrainScrollPad(cam.zoom);
  const contentKey = terrainContentKey(state, cam, w, h);
  const layer = ensureTerrainCanvas(w + pad * 2, h + pad * 2);
  if (layer && scrollLayerNeedsRebuild(terrainScroll, contentKey, cam.x, cam.y)) {
    const tctx = layer.getContext("2d");
    if (tctx) {
      paintTerrain(tctx, state, scrollLayerPaintCamera(cam, pad));
      terrainScroll.key = contentKey;
      terrainScroll.originX = cam.x;
      terrainScroll.originY = cam.y;
      terrainScroll.pad = pad;
    }
  }
  if (layer && terrainScroll.key === contentKey) {
    const blit = scrollLayerBlitOffset(terrainScroll, cam.x, cam.y);
    ctx.drawImage(layer, blit.x, blit.y);
  } else {
    paintTerrain(ctx, state, cam);
  }

  const clock = extras.clockMs;
  const timeMs = animClock(state.tick, clock);
  paintWaterFx(ctx, state, cam, timeMs);
  paintOreGlints(ctx, state, cam, timeMs);
  paintTerrainWeather(ctx, state, cam, timeMs, extras.reducedMotion);
  paintTerrainAtmosphere(ctx, state, cam, timeMs, extras.reducedMotion);
  paintBuildingPlates(ctx, state, cam, footprintOf, entityVisible, entityElev);
  drawObjectiveZone(ctx, state, cam, timeMs, heightAt);

  if (extras.placeKind && hoverTile) {
    const fp = footprintOf(extras.placeKind);
    const ok = canPlaceBuilding(state, extras.placeKind, hoverTile.x, hoverTile.y);
    for (let oy = 0; oy < fp.h; oy++) {
      for (let ox = 0; ox < fp.w; ox++) {
        const tx = hoverTile.x + ox;
        const ty = hoverTile.y + oy;
        const elev = heightAt(state, tx, ty);
        const s = tileToScreen(tx, ty, cam, elev);
        ctx.strokeStyle = ok ? "rgba(90,220,120,0.95)" : "rgba(220,70,70,0.95)";
        ctx.fillStyle = ok ? "rgba(90,220,120,0.18)" : "rgba(220,70,70,0.18)";
        ctx.lineWidth = 2;
        drawDiamond(ctx, s.x, s.y, TILE_W * cam.zoom, TILE_H * cam.zoom);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
}
