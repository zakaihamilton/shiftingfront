import { TILE_H } from "../../../iso";
import { terrainFeatureAt, type TerrainFeatureSample } from "../../../gen/map";
import type { BiomeName, SurfaceKind } from "../../../types";
import { biomeMaterials } from "../../terrainAtlas";
import { mixRgb, propMaterialsFor, terrainVisualTuningFor, type BiomeMaterials } from "../../terrainMaterials";
import { terrainPropLightGain } from "../../terrainLighting";
import type { ScatterItem, ScatterWorld } from "./types";
import { scatterForTile } from "./distribution";
import {
  drawCactus,
  drawCinder,
  drawCrystalChip,
  drawDesertShrub,
  drawDesertTree,
  drawDebris,
  drawDryBrush,
  drawIceChip,
  drawLandmark,
  drawMineralFlake,
  drawPebble,
  drawPebbleCluster,
  drawReed,
  drawRockSlab,
  drawMineralFragment,
  drawShrub,
  drawTuft,
} from "./render";

export * from "./types";
export * from "./distribution";
export * from "./render";

function paintItem(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  biome: BiomeName,
  item: ScatterItem,
  z: number,
): void {
  ctx.save();
  ctx.translate(item.ox * z, item.oy * z);
  ctx.rotate(item.rotation);
  switch (item.kind) {
    case "pebble":
      drawPebble(ctx, mats, z, item.scale, item.variant);
      break;
    case "pebbleCluster":
      drawPebbleCluster(ctx, mats, z, item.scale, item.variant);
      break;
    case "rockSlab":
      drawRockSlab(ctx, mats, z, item.scale, item.variant);
      break;
    case "mineralFragment":
      drawMineralFragment(ctx, mats, z, item.scale, item.variant);
      break;
    case "dryBrush":
      drawDryBrush(ctx, mats, z, item.scale, item.variant);
      break;
    case "mineralFlake":
      drawMineralFlake(ctx, mats, z, item.scale, item.variant);
      break;
    case "tuft":
      drawTuft(ctx, mats, z, item.scale, item.variant);
      break;
    case "shrub":
      drawShrub(ctx, mats, z, item.scale, item.variant);
      break;
    case "debris":
      drawDebris(ctx, mats, z, item.scale, item.variant);
      break;
    case "crystalChip":
      drawCrystalChip(ctx, mats, z, item.scale, item.variant);
      break;
    case "reed":
      drawReed(ctx, mats, z, item.scale, item.variant);
      break;
    case "cinder":
      drawCinder(ctx, mats, z, item.scale, item.variant);
      break;
    case "iceChip":
      drawIceChip(ctx, mats, z, item.scale, item.variant);
      break;
    case "desertTree":
      drawDesertTree(ctx, mats, z, item.scale, item.variant);
      break;
    case "cactus":
      drawCactus(ctx, mats, z, item.scale, item.variant);
      break;
    case "desertShrub":
      drawDesertShrub(ctx, mats, z, item.scale, item.variant);
      break;
    case "landmark":
      drawLandmark(ctx, mats, biome, z, item.scale, item.variant);
      break;
  }
  ctx.restore();
}

function featurePropMaterials(mats: BiomeMaterials, feature: TerrainFeatureSample): BiomeMaterials {
  const wet = Math.max(0, feature.wetness);
  const dry = Math.max(0, -feature.wetness);
  const wetDarken = Math.min(0.12, wet * 0.22);
  const dryDust = Math.min(0.08, dry * 0.18);
  const regional = {
    ...mats,
    dark: mixRgb(mats.dark, mats.blocked, wetDarken),
    mid: mixRgb(mats.mid, wet > dry ? mats.dark : mats.patchA, wet > dry ? wetDarken : dryDust),
    high: mixRgb(mats.high, wet > dry ? mats.mid : mats.patchA, wet > dry ? wetDarken * 0.7 : dryDust),
    light: mixRgb(mats.light, mats.high, wetDarken * 0.5),
  };
  const coolRegion = /crystal|reflective|facet|frost|ice|drift/.test(feature.kind);
  if (!coolRegion) return regional;
  const cool = Math.min(0.08, feature.intensity * 0.1);
  return {
    ...regional,
    light: mixRgb(regional.light, regional.high, cool),
    ore: mixRgb(regional.ore, regional.light, cool * 0.3),
  };
}

export function drawTerrainScatter(
  ctx: CanvasRenderingContext2D,
  state: ScatterWorld,
  x: number,
  y: number,
  sx: number,
  sy: number,
  z: number,
  tileKind?: number,
  surface?: SurfaceKind,
): void {
  const items = scatterForTile(state, x, y, tileKind, surface);
  if (items.length === 0) return;
  const feature = terrainFeatureAt(state, x, y);
  const mats = featurePropMaterials(
    propMaterialsFor(biomeMaterials(state.biome), terrainVisualTuningFor(state.biome)),
    feature,
  );
  ctx.save();
  ctx.globalAlpha *= terrainPropLightGain(state, x, y);
  ctx.globalAlpha *= 1 - Math.min(0.06, Math.max(0, feature.wetness) * 0.12);
  ctx.translate(sx, sy + TILE_H * z * 0.42);
  for (const item of items) paintItem(ctx, mats, state.biome, item, z);
  ctx.restore();
}
