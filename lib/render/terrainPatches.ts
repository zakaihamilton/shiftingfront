import type { BiomeName } from "../types";
import type { TerrainFeatureSample } from "../gen/map/features";
import {
  fbm,
  hash2,
  mixRgb,
  terrainVisualTuningFor,
  type BiomeMaterials,
  type Rgb,
  type TerrainVisualTuning,
} from "./terrainMaterials";

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function fade(value: number): number {
  return value * value * (3 - 2 * value);
}

function smoothHash(x: number, y: number, salt: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const v00 = hash2(x0, y0, salt);
  const v10 = hash2(x0 + 1, y0, salt);
  const v01 = hash2(x0, y0 + 1, salt);
  const v11 = hash2(x0 + 1, y0 + 1, salt);
  const top = v00 + (v10 - v00) * tx;
  const bottom = v01 + (v11 - v01) * tx;
  return top + (bottom - top) * ty;
}

/**
 * Smooth seeded patch noise with a small domain warp. The warp bends the
 * patch grid into organic shapes without adding another FBM pass to the
 * atlas bake.
 */
type PatchWarp = { x: number; y: number };

function patchWarp(mapX: number, mapY: number, salt: number): PatchWarp {
  const phase = salt * 0.000001;
  return {
    x: Math.sin(mapY * 2.25 + phase) * 0.18,
    y: Math.sin(mapX * 2.05 - phase * 1.3) * 0.18,
  };
}

function patchNoise(
  mapX: number,
  mapY: number,
  salt: number,
  scale: number,
  warp = patchWarp(mapX, mapY, salt),
): number {
  return smoothHash((mapX + warp.x) * scale, (mapY + warp.y) * scale, salt);
}

/** Regional soil/moss/sand mix sampled once per atlas cell. */
export function tintGroundPatches(
  color: Rgb,
  mats: BiomeMaterials,
  mapX: number,
  mapY: number,
  salt: number,
  tuning: TerrainVisualTuning = terrainVisualTuningFor("ash plains"),
): Rgb {
  const macro = fbm(mapX * tuning.macroScale, mapY * tuning.macroScale, salt + 311);
  const detail = fbm(mapX * tuning.detailScale, mapY * tuning.detailScale, salt + 347);
  const lowRegion = smoothstep(0.08, 0.42, 0.5 - macro) * tuning.macroStrength * 0.2;
  const highRegion = smoothstep(0.58, 0.92, macro) * tuning.macroStrength * 0.14;
  let out = mixRgb(color, mats.patchA, 0.045 + macro * tuning.macroStrength * 0.46);
  out = mixRgb(out, mats.dark, lowRegion);
  out = mixRgb(out, mats.high, highRegion);
  const fleck = smoothstep(0.44, 0.9, detail) * (0.08 + tuning.roughness * 0.42);
  return mixRgb(out, mats.patchB, fleck);
}

/**
 * Cheap per-pixel biome marks. Uses hash + trig only — no extra fbm — so the
 * atlas bake stays inside the performance budget.
 */
export function applyBiomeGroundPattern(
  color: Rgb,
  biome: BiomeName,
  mapX: number,
  mapY: number,
  salt: number,
  mats: BiomeMaterials,
  feature?: TerrainFeatureSample,
): Rgb {
  const tuning = terrainVisualTuningFor(biome);
  const warp = patchWarp(mapX, mapY, salt);
  const n = patchNoise(mapX, mapY, salt + 419, 8, warp);
  let out: Rgb;
  switch (biome) {
    case "glass desert": {
      const n2 = patchNoise(mapX, mapY, salt + 431, 16, warp);
      const dune = 0.5 + 0.5 * Math.sin(mapX * 2.1 + mapY * 0.58);
      const ripple = 0.5 + 0.5 * Math.sin(mapX * 5.4 - mapY * 1.5);
      out = mixRgb(color, mats.patchA, dune * 0.1 + ripple * 0.035 + (n - 0.5) * 0.04);
      out = mixRgb(out, mats.patchB, smoothstep(0.84, 0.99, n2) * 0.1);
      break;
    }
    case "rust canyons": {
      const stripe = ((mapX * 0.85 + mapY * 1.6) % 1 + 1) % 1;
      const strata = Math.pow(Math.max(0, Math.cos(stripe * Math.PI * 2)), 10) * 0.14 + 0.025;
      const scratch = smoothstep(0.72, 0.96, n) * 0.09;
      out = mixRgb(mixRgb(color, mats.patchB, strata), mats.patchA, scratch);
      break;
    }
    case "tundra grid": {
      const n2 = patchNoise(mapX, mapY, salt + 431, 16, warp);
      const frost = smoothstep(0.48, 0.9, n) * 0.2;
      const vein = Math.abs(Math.sin(mapX * 3.8 + mapY * 0.3));
      out = mixRgb(color, mats.patchA, frost);
      out = mixRgb(out, mats.light, smoothstep(0.88, 0.99, vein) * 0.1);
      out = mixRgb(out, mats.patchB, smoothstep(0.84, 0.99, n2) * 0.08);
      break;
    }
    case "volcanic shelf": {
      const n2 = patchNoise(mapX, mapY, salt + 431, 16, warp);
      const crack = Math.abs(Math.sin(mapX * 5.1) * Math.sin(mapY * 3.7));
      const seam = smoothstep(0.72, 0.97, crack) * 0.2 + 0.025;
      out = mixRgb(color, mats.patchB, seam);
      out = mixRgb(out, mats.ore, smoothstep(0.87, 0.99, n2) * 0.08);
      break;
    }
    case "salt marshes": {
      const wet = 0.5 + 0.5 * Math.sin(mapX * 1.7 + mapY * 1.3);
      const puddle = 0.5 + 0.5 * Math.sin(mapX * 4.2 - mapY * 3.1);
      out = mixRgb(
        mixRgb(color, mats.patchA, 0.05 + wet * 0.13),
        mats.patchB,
        0.025 + smoothstep(0.7, 0.95, puddle) * 0.07,
      );
      break;
    }
    case "jungle wreckage": {
      const n2 = patchNoise(mapX, mapY, salt + 431, 16, warp);
      const litter = 0.035 + smoothstep(0.52, 0.95, n) * 0.16;
      const moss = mixRgb(mats.patchB, mats.patchA, smoothstep(0.58, 0.78, n2));
      out = mixRgb(color, moss, litter);
      out = mixRgb(out, mats.high, smoothstep(0.88, 0.99, n) * 0.06);
      break;
    }
    case "crystal flats": {
      const glint = 0.025 + smoothstep(0.72, 0.99, n) * 0.18;
      const facet = Math.abs(Math.sin(mapX * 4.2 - mapY * 3.1));
      out = mixRgb(color, mats.patchB, glint);
      out = mixRgb(out, mats.light, smoothstep(0.88, 0.99, facet) * 0.1);
      break;
    }
    default: {
      const streak = 0.5 + 0.5 * Math.sin(mapX * 0.9 - mapY * 2.2);
      const ash = 0.04 + smoothstep(0.72, 0.88, n) * 0.08;
      out = mixRgb(
        mixRgb(color, mixRgb(mats.patchB, mats.patchA, smoothstep(0.46, 0.66, streak)), 0.06 + streak * 0.1),
        mats.dark,
        ash,
      );
      break;
    }
  }
  const macro = fbm(mapX * tuning.macroScale, mapY * tuning.macroScale, salt + 557);
  const broadRelief = (macro - 0.5) * tuning.macroStrength * 0.34;
  if (broadRelief > 0) out = mixRgb(out, mats.high, broadRelief);
  else out = mixRgb(out, mats.dark, -broadRelief);
  return applyTerrainFeaturePattern(out, feature, mapX, mapY, salt, mats, warp);
}

function applyTerrainFeaturePattern(
  color: Rgb,
  feature: TerrainFeatureSample | undefined,
  mapX: number,
  mapY: number,
  salt: number,
  mats: BiomeMaterials,
  warp: PatchWarp,
): Rgb {
  if (!feature || feature.intensity < 0.08) return color;
  const t = feature.intensity;
  const grain = patchNoise(mapX, mapY, salt + 503, 12, warp);
  const band = 0.5 + 0.5 * Math.sin(mapX * 4.4 - mapY * 2.7 + feature.detail * 5);
  const seam = Math.abs(Math.sin(mapX * 7.1 + mapY * 3.6 + feature.detail * 4));
  switch (feature.kind) {
    case "ashDrift":
    case "duneSea":
    case "saltPan":
    case "frostPan":
      return mixRgb(color, mats.patchA, t * (0.05 + band * 0.1));
    case "cinderBasin":
    case "strataGully":
    case "dryWash":
    case "iceRift":
    case "lavaScar":
      return mixRgb(color, mats.patchB, t * (seam > 0.74 ? 0.16 : 0.06));
    case "crystalVein":
    case "glassShards":
      {
        const highlight = smoothstep(0.66, 0.82, grain);
        return mixRgb(
          color,
          mixRgb(mats.patchB, mats.light, highlight),
          t * (0.06 + highlight * 0.1),
        );
      }
    case "reedBed":
    case "canopyGrove":
      return mixRgb(
        color,
        mixRgb(mats.dark, mats.patchA, smoothstep(0.46, 0.62, grain)),
        t * (0.06 + band * 0.09),
      );
    case "wreckClearing":
    case "scrapWash":
    case "mudflat":
      return mixRgb(
        color,
        mixRgb(mats.patchB, mats.light, smoothstep(0.74, 0.9, grain)),
        t * 0.08,
      );
    case "scoriaField":
    case "facetRise":
    case "mesaShelf":
    case "driftMoraine":
    case "vineRidge":
    case "basaltShelf":
    case "ashCone":
      {
        const highlight = smoothstep(0.7, 0.86, seam);
        return mixRgb(
          color,
          mixRgb(mats.dark, mats.light, highlight),
          t * (0.07 + highlight * 0.03),
        );
      }
  }
  return color;
}
