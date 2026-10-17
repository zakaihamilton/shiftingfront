import { tileCliffGeometry } from "../../gen/assets";
import { expandIsoDiamond, isoAtlasTransform } from "../../iso";
import { atlasRectForTile, fogTerrainGain, type TerrainAtlas } from "../terrainAtlas";
import { SHROUD_FILL, SHROUD_RGB, SHROUD_COVER, SHROUD_CORNER_RADIUS_FRAC, SHROUD_CORE_COVER } from "./constants";
import { roundedIsoDiamondPath, type IsoDiamondCornerRadii } from "../isoDiamond";
import { fillElevationPoly } from "./cliffs";
import { fogAt } from "../../sim/fog";
import type { SimState } from "../../types";

export function paintShroudCliffs(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tw: number,
  th: number,
  dropE: number,
  dropS: number,
  step: number,
  tileX: number,
  tileY: number,
  seed: number,
  seal: boolean,
): void {
  if (dropE <= 0 && dropS <= 0) return;
  const geo = tileCliffGeometry(tw, th, step, dropE, dropS, seed, tileX, tileY);
  if (geo.south) fillElevationPoly(ctx, sx, sy, geo.south.points, undefined, seal);
  if (geo.east) fillElevationPoly(ctx, sx, sy, geo.east.points, undefined, seal);
  if (geo.wedge) fillElevationPoly(ctx, sx, sy, geo.wedge, undefined, seal);
}

const MASK_RGB = { r: 0, g: 0, b: 0 };

function shroudStop(rgb: { r: number; g: number; b: number }, alpha: number): string {
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

function fillShroudStamp(
  ctx: CanvasRenderingContext2D,
  cover: { x: number; y: number; w: number; h: number },
  radii: IsoDiamondCornerRadii,
  rgb: { r: number; g: number; b: number },
): void {
  const cx = cover.x;
  const cy = cover.y + cover.h / 2;
  const radius = Math.max(cover.w, cover.h) * 0.42;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(radius, radius);
  const feather = ctx.createRadialGradient(0, 0, 0.08, 0, 0, 1);
  feather.addColorStop(0, shroudStop(rgb, 1));
  feather.addColorStop(0.7, shroudStop(rgb, 1));
  feather.addColorStop(1, shroudStop(rgb, 0));
  ctx.fillStyle = feather;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const core = expandIsoDiamond(cover.x, cover.y, cover.w, cover.h, SHROUD_CORE_COVER);
  const coreRadii: IsoDiamondCornerRadii = [
    radii[0] * SHROUD_CORE_COVER,
    radii[1] * SHROUD_CORE_COVER,
    radii[2] * SHROUD_CORE_COVER,
    radii[3] * SHROUD_CORE_COVER,
  ];
  roundedIsoDiamondPath(ctx, core.x, core.y, core.w, core.h, coreRadii);
  ctx.fill();
}

export function shroudCornerRadii(
  state: SimState,
  tileX: number,
  tileY: number,
  radius: number,
  occupied: (fog: number) => boolean,
): IsoDiamondCornerRadii {
  const on = (dx: number, dy: number) => occupied(fogAt(state, tileX + dx, tileY + dy));
  const outer = (dx1: number, dy1: number, dx2: number, dy2: number, dx3: number, dy3: number) =>
    on(dx1, dy1) || on(dx2, dy2) || on(dx3, dy3) ? 0 : radius;
  return [
    outer(-1, 0, 0, -1, -1, -1),
    outer(1, 0, 0, -1, 1, -1),
    outer(1, 0, 0, 1, 1, 1),
    outer(-1, 0, 0, 1, -1, 1),
  ];
}

export function paintShroudMaskTile(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tw: number,
  th: number,
  dropE: number,
  dropS: number,
  step: number,
  gain: number,
  z: number,
  tileX: number,
  tileY: number,
  seed: number,
  state: SimState,
): void {
  const shroudGain = fogTerrainGain(0);
  if (gain <= shroudGain + 0.005) return;
  const srcAlpha = 1 - (1 - gain) / (1 - shroudGain);
  if (srcAlpha <= 0.01) return;
  ctx.globalAlpha = srcAlpha;
  ctx.fillStyle = "#000000";
  const cover = expandIsoDiamond(sx, sy, tw, th, srcAlpha >= 0.98 ? SHROUD_COVER : 1);
  const radius = SHROUD_CORNER_RADIUS_FRAC * Math.min(cover.w, cover.h);
  const radii = shroudCornerRadii(state, tileX, tileY, radius, (fog) => fog >= 1);
  fillShroudStamp(ctx, cover, radii, MASK_RGB);
  paintShroudCliffs(ctx, sx, sy, tw, th, dropE, dropS, step, tileX, tileY, seed, srcAlpha >= 0.98);
}

export function paintShroudOverlay(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tw: number,
  th: number,
  dropE: number,
  dropS: number,
  step: number,
  gain: number,
  z: number,
  tileX: number,
  tileY: number,
  seed: number,
  state: SimState,
): void {
  if (gain >= 0.98) return;
  ctx.save();
  ctx.globalAlpha = 1 - gain;
  ctx.fillStyle = SHROUD_FILL;
  const cover = expandIsoDiamond(sx, sy, tw, th, SHROUD_COVER);
  const radius = SHROUD_CORNER_RADIUS_FRAC * Math.min(cover.w, cover.h);
  const radii = shroudCornerRadii(state, tileX, tileY, radius, (fog) => fog < 2);
  fillShroudStamp(ctx, cover, radii, SHROUD_RGB);
  paintShroudCliffs(ctx, sx, sy, tw, th, dropE, dropS, step, tileX, tileY, seed, true);
  ctx.restore();
}

export function drawAtlasDiamond(
  ctx: CanvasRenderingContext2D,
  atlas: TerrainAtlas,
  x: number,
  y: number,
  sx: number,
  sy: number,
  tw: number,
  th: number,
): void {
  if (!atlas.canvas) return;
  const rect = atlasRectForTile(x, y, atlas.mapWidth);
  const pad = ATLAS_SAMPLE_PAD;
  const sx0 = Math.max(0, rect.sx - pad);
  const sy0 = Math.max(0, rect.sy - pad);
  const sx1 = Math.min(atlas.width, rect.sx + rect.sw + pad);
  const sy1 = Math.min(atlas.height, rect.sy + rect.sh + pad);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.transform(...isoAtlasTransform(sx, sy, tw, th, rect.sw, rect.sh));
  ctx.drawImage(atlas.canvas, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 - rect.sx, sy0 - rect.sy, sx1 - sx0, sy1 - sy0);
}

const ATLAS_SAMPLE_PAD = 1;
