import { cliffFaces } from "../../gen/assets";
import { MAP_SKIRT, isMountainScenery, skirtAlpha } from "../../gen/map";
import { generateCampaignVisualProfile } from "../../gen/visualProfile";
import type { SimState } from "../../types";
import { SURFACE_CONCRETE, TILE_BLOCKED, TILE_RESOURCE, TILE_WATER } from "../../types";
import { HEIGHT_STEP, TILE_H, TILE_W, expandIsoDiamond, screenToTile, tileToScreen, type Camera } from "../../iso";
import { fogAt } from "../../sim/fog";
import { biomeMaterials, fogTerrainGain, getTerrainAtlas, tileVariant, type AtlasWorld, type TerrainAtlas } from "../terrainAtlas";
import { SceneryMemo } from "../sceneryMemo";
import { drawConcreteSlab } from "../terrainPlates";
import { isoDiamondPath } from "../isoDiamond";
import { paintShroudOverlay, paintShroudMaskTile, drawAtlasDiamond } from "./tile";
import { smoothFogGain, drawBlockerProp, drawOreCrystals } from "./details";
import { drawTerrainScatter } from "./scatter";
import { SHROUD_FILL, SHROUD_RGB, TERRAIN_COVER } from "./constants";
import { drawElevationFaces, fillElevationPoly, fillElevationRamp, softElevationRampStops } from "./cliffs";
import { terrainLightRigForBiome } from "../terrainLighting";
import { terrainVisualTuningFor } from "../terrainMaterials";

const sceneryMemo = new SceneryMemo();

export function clearTerrainPaintCache(): void {
  sceneryMemo.clear();
}

function memoScenery(state: AtlasWorld & { tick?: number }, x: number, y: number) {
  return sceneryMemo.sample(state, x, y);
}

function wetBankColors(
  base: ReturnType<typeof cliffFaces>,
  mats: ReturnType<typeof biomeMaterials>,
  waterE: boolean,
  waterS: boolean,
): ReturnType<typeof cliffFaces> {
  const wet = `rgb(${Math.max(0, mats.waterDeep.r - 6)},${Math.max(0, mats.waterDeep.g - 4)},${Math.min(255, mats.waterDeep.b + 4)})`;
  return {
    south: waterS ? wet : base.south,
    east: waterE ? wet : base.east,
    southInk: base.southInk,
    eastInk: base.eastInk,
  };
}

function paintElevationGapBridges(
  ctx: CanvasRenderingContext2D,
  s: { x: number; y: number },
  eastS: { x: number; y: number },
  southS: { x: number; y: number },
  tw: number,
  th: number,
  dropE: number,
  dropS: number,
  colors: ReturnType<typeof cliffFaces>,
): void {
  // Atlas cells meet at their top elevation. When the neighbor is lower,
  // that neighbor's diamond is translated down by the height step, leaving
  // a thin uncovered parallelogram beside the inset cliff face. Paint only
  // that gap; the face and the atlas remain responsible for the visible art.
  if (dropE > 0) {
    const points = [
      s.x + tw / 2, s.y + th / 2,
      s.x, s.y + th,
      eastS.x - tw / 2, eastS.y + th / 2,
      eastS.x, eastS.y,
    ];
    if (dropE === 1) {
      const [fromColor, toColor] = softElevationRampStops(colors.east);
      fillElevationRamp(ctx, points, s, eastS, fromColor, toColor);
    } else {
      fillElevationPoly(ctx, 0, 0, points, colors.east);
    }
  }
  if (dropS > 0) {
    const points = [
      s.x - tw / 2, s.y + th / 2,
      s.x, s.y + th,
      southS.x + tw / 2, southS.y + th / 2,
      southS.x, southS.y,
    ];
    if (dropS === 1) {
      const [fromColor, toColor] = softElevationRampStops(colors.south);
      fillElevationRamp(ctx, points, s, southS, fromColor, toColor);
    } else {
      fillElevationPoly(ctx, 0, 0, points, colors.south);
    }
  }
}

function paintCell(
  ctx: CanvasRenderingContext2D,
  state: AtlasWorld,
  cam: Camera,
  atlas: TerrainAtlas,
  x: number,
  y: number,
  waterPass: boolean,
  gainAt?: (x: number, y: number) => number,
): void {
  const scenery = memoScenery(state, x, y);
  const water = scenery.kind === TILE_WATER;
  if (water !== waterPass) return;
  const elev = scenery.elev;
  const s = tileToScreen(x, y, cam, elev);
  const z = cam.zoom;
  const tw = TILE_W * z;
  const th = TILE_H * z;
  const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
  ctx.save();
  ctx.globalAlpha *= skirtAlpha(x, y, state.width, state.height);
  const concrete = inMap && state.surfaces[y * state.width + x] === SURFACE_CONCRETE;
  const cover = expandIsoDiamond(s.x, s.y, tw, th, concrete ? 1 : water ? WATER_COVER : TERRAIN_COVER);
  const eastSc = memoScenery(state, x + 1, y);
  const southSc = memoScenery(state, x, y + 1);
  const eastS = tileToScreen(x + 1, y, cam, eastSc.elev);
  const southS = tileToScreen(x, y + 1, cam, southSc.elev);
  const dropE = water ? 0 : Math.max(0, elev - eastSc.elev);
  const dropS = water ? 0 : Math.max(0, elev - southSc.elev);
  const gain = gainAt?.(x, y) ?? 1;
  const faceColors = wetBankColors(
    cliffFaces(state.biome, elev, generateCampaignVisualProfile(state.seed)),
    biomeMaterials(state.biome),
    eastSc.kind === TILE_WATER,
    southSc.kind === TILE_WATER,
  );
  const tuning = terrainVisualTuningFor(state.biome);

  if (!water && (elev >= 2 || dropE > 0 || dropS > 0)) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.25, 0.05 + tuning.shadowDepth * 0.32 + elev * 0.025 + (dropE + dropS) * 0.03) * gain;
    ctx.fillStyle = "#071014";
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + th * 0.58 + HEIGHT_STEP * z * 0.1, tw * 0.44, th * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (dropE > 0 || dropS > 0) {
    ctx.save();
    paintElevationGapBridges(ctx, s, eastS, southS, tw, th, dropE, dropS, faceColors);
    drawElevationFaces(
      ctx,
      s.x,
      s.y,
      tw,
      th,
      HEIGHT_STEP * z,
      dropE,
      dropS,
      tileVariant(state.seed, x, y),
      faceColors,
      x,
      y,
      terrainLightRigForBiome(state.seed, state.biome),
    );
    ctx.restore();
  }

  ctx.save();
  isoDiamondPath(ctx, cover.x, cover.y, cover.w, cover.h);
  ctx.clip();
  const mats = biomeMaterials(state.biome);
  const base = water ? mats.waterMid : concrete ? mats.concrete : mats.mid;
  ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
  isoDiamondPath(ctx, cover.x, cover.y, cover.w, cover.h);
  ctx.fill();
  if (atlas.canvas) {
    drawAtlasDiamond(ctx, atlas, x, y, s.x, s.y, tw, th);
  } else if (concrete) {
    // Keep the specialized slab as a no-atlas fallback; the normal browser
    // path uses the atlas so concrete participates in organic land edges.
    drawConcreteSlab(ctx, s.x, s.y, tw, th, z, tileVariant(state.seed, x, y), 1);
  } else {
    ctx.fillStyle = `rgb(${mats.mid.r},${mats.mid.g},${mats.mid.b})`;
    isoDiamondPath(ctx, cover.x, cover.y, cover.w, cover.h);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

function paintCellScatter(
  ctx: CanvasRenderingContext2D,
  state: AtlasWorld,
  cam: Camera,
  x: number,
  y: number,
): void {
  const scenery = memoScenery(state, x, y);
  if (scenery.kind === TILE_WATER) return;
  const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
  const surface = inMap ? state.surfaces[y * state.width + x] : 0;
  const s = tileToScreen(x, y, cam, scenery.elev);
  ctx.save();
  ctx.globalAlpha *= skirtAlpha(x, y, state.width, state.height);
  drawTerrainScatter(ctx, state, x, y, s.x, s.y, cam.zoom, scenery.kind, surface);
  ctx.restore();
}

function paintCellProps(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  x: number,
  y: number,
): void {
  if (fogAt(state, x, y) === 0) return;
  const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
  const scenery = memoScenery(state, x, y);
  const elev = scenery.elev;
  const s = tileToScreen(x, y, cam, elev);
  const z = cam.zoom;
  const gain = smoothFogGain(state, x, y);
  ctx.save();
  ctx.globalAlpha = gain;
  if (scenery.kind === TILE_BLOCKED && !isMountainScenery(scenery)) {
    drawBlockerProp(ctx, state, x, y, s.x, s.y, z);
  }
  if (inMap && state.tiles[y * state.width + x] === TILE_RESOURCE) {
    drawOreCrystals(ctx, state, cam, x, y, elev, z);
  }
  ctx.restore();
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
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
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

function visitVisibleTiles(
  ctx: CanvasRenderingContext2D,
  state: AtlasWorld,
  cam: Camera,
  visit: (x: number, y: number) => void,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const margin = TILE_W * cam.zoom * 2;
  const range = visibleTileRange(cam, w, h, state.width, state.height);
  const x0 = range.x0;
  const y0 = range.y0;
  const x1 = range.x1;
  const y1 = range.y1;
  if (x0 >= x1 || y0 >= y1) return;
  const depth0 = x0 + y0;
  const depth1 = (x1 - 1) + (y1 - 1);
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

let shroudMask: HTMLCanvasElement | null = null;

function paintShroudLayer(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const z = cam.zoom;
  const tw = TILE_W * z;
  const th = TILE_H * z;
  const step = HEIGHT_STEP * z;
  const paintVisibleShroud = (
    target: CanvasRenderingContext2D,
    painter: typeof paintShroudOverlay,
  ) => visitVisibleTiles(ctx, state, cam, (x, y) => {
    const scenery = memoScenery(state, x, y);
    const s = tileToScreen(x, y, cam, scenery.elev);
    const dropE = Math.max(0, scenery.elev - memoScenery(state, x + 1, y).elev);
    const dropS = Math.max(0, scenery.elev - memoScenery(state, x, y + 1).elev);
    painter(target, s.x, s.y, tw, th, dropE, dropS, step, smoothFogGain(state, x, y), z, x, y, tileVariant(state.seed, x, y), state);
  });
  if (typeof document === "undefined") {
    paintVisibleShroud(ctx, paintShroudOverlay);
    return;
  }
  if (!shroudMask) shroudMask = document.createElement("canvas");
  if (shroudMask.width !== w || shroudMask.height !== h) {
    shroudMask.width = w;
    shroudMask.height = h;
  }
  const fog = shroudMask.getContext("2d");
  if (!fog) {
    paintVisibleShroud(ctx, paintShroudOverlay);
    return;
  }
  fog.setTransform(1, 0, 0, 1, 0, 0);
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
  ctx.drawImage(shroudMask, 0, 0);
  ctx.restore();
}

// Water must stay within its own diamond. Unlike land, it should not expand
// across shared cell edges where the neighboring tile may be dry ground.
export const WATER_COVER = 1;

export function paintTerrainSurface(
  ctx: CanvasRenderingContext2D,
  state: AtlasWorld,
  cam: Camera,
  gainAt?: (x: number, y: number) => number,
): void {
  const atlas = getTerrainAtlas(state);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // The decorative skirt sits behind the playable map. In particular, a
  // low-elevation skirt-water diamond must not paint over the lower edge of
  // a higher playable tile just because water is rendered in its own pass.
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
    if (inMap || memoScenery(state, x, y).kind !== TILE_WATER) return;
    paintCell(ctx, state, cam, atlas, x, y, true, gainAt);
  });
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    paintCell(ctx, state, cam, atlas, x, y, false, gainAt);
  });
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
    if (!inMap) return;
    paintCell(ctx, state, cam, atlas, x, y, true, gainAt);
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

export function paintTerrainWorld(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = SHROUD_FILL;
  ctx.fillRect(0, 0, w, h);

  paintTerrainSurface(ctx, state, cam, (x, y) => smoothFogGain(state, x, y));
  // Tall blockers and ore stay after the shroud and remain vision-gated.
  paintShroudLayer(ctx, state, cam);
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    paintCellProps(ctx, state, cam, x, y);
  });
}
