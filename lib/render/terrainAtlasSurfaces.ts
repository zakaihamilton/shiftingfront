import { sceneryAt } from "../gen/map";
import {
  SURFACE_CONCRETE,
  SURFACE_ROAD,
  TILE_BLOCKED,
  TILE_RESOURCE,
  TILE_WATER,
} from "../types";
import {
  CONCRETE_STEEL,
  CONCRETE_STEEL_DARK,
  CONCRETE_STEEL_LIGHT,
  artSalt,
  clampByte,
  fbm,
  hash2,
  materialsFor,
  mixRgb,
  resourceAt,
  scaleRgb,
  surfaceAt,
  terrainVisualTuningFor,
  type AtlasWorld,
  type BiomeMaterials,
  type Rgb,
  type TerrainSample,
} from "./terrainMaterials";
import { tintGroundPatches } from "./terrainPatches";
import {
  gradeTerrainColor,
  restrainTerrainColor,
  terrainLightFactor,
  terrainLightRigForBiome,
} from "./terrainLighting";

export const WATER_SHORE_MAX = 8;

export type TerrainMaterialContext = {
  scenery?: { kind: number; elev: number };
  east?: { kind: number; elev: number };
  south?: { kind: number; elev: number };
  mats?: BiomeMaterials;
  rig?: ReturnType<typeof terrainLightRigForBiome>;
  salt?: number;
  waterNeighbor?: boolean;
};

export function waterNeighbor(state: AtlasWorld, x: number, y: number): boolean {
  return sceneryAt(state, x, y).kind === TILE_WATER
    || sceneryAt(state, x + 1, y).kind === TILE_WATER
    || sceneryAt(state, x - 1, y).kind === TILE_WATER
    || sceneryAt(state, x, y + 1).kind === TILE_WATER
    || sceneryAt(state, x, y - 1).kind === TILE_WATER;
}

export function waterShoreDist(state: AtlasWorld, x: number, y: number): number {
  if (sceneryAt(state, x, y).kind !== TILE_WATER) return 0;
  for (let d = 1; d <= WATER_SHORE_MAX; d++) {
    for (let oy = -d; oy <= d; oy++) {
      for (let ox = -d; ox <= d; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== d) continue;
        if (sceneryAt(state, x + ox, y + oy).kind !== TILE_WATER) return d;
      }
    }
  }
  return WATER_SHORE_MAX;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clampShore(dist: number): number {
  return dist > WATER_SHORE_MAX ? WATER_SHORE_MAX : dist;
}

export function readShoreCell(
  shoreDist: Uint8Array,
  cols: number,
  rows: number,
  col: number,
  row: number,
  fallback: number,
): number {
  if (col < 0 || row < 0 || col >= cols || row >= rows) return clampShore(fallback);
  return clampShore(shoreDist[row * cols + col] ?? fallback);
}

export function landEdgeDistFromMask(fx: number, fy: number, mask: number): number {
  let dist = WATER_SHORE_MAX;
  if ((mask & 2) === 0) dist = Math.min(dist, 1 - fx);
  if ((mask & 8) === 0) dist = Math.min(dist, fx);
  if ((mask & 4) === 0) dist = Math.min(dist, 1 - fy);
  if ((mask & 1) === 0) dist = Math.min(dist, fy);
  if ((mask & 128) === 0) dist = Math.min(dist, Math.hypot(1 - fx, 1 - fy));
  if ((mask & 64) === 0) dist = Math.min(dist, Math.hypot(fx, fy));
  if ((mask & 16) === 0) dist = Math.min(dist, Math.hypot(1 - fx, fy));
  if ((mask & 32) === 0) dist = Math.min(dist, Math.hypot(fx, 1 - fy));
  return dist;
}

export function bilinearFromNeighborhood(
  fx: number,
  fy: number,
  n00: number,
  n10: number,
  n20: number,
  n01: number,
  n11: number,
  n21: number,
  n02: number,
  n12: number,
  n22: number,
): number {
  const west = fx < 0.5;
  const north = fy < 0.5;
  const tx = west ? fx + 0.5 : fx - 0.5;
  const ty = north ? fy + 0.5 : fy - 0.5;
  const a = north ? (west ? n00 : n10) : (west ? n01 : n11);
  const b = north ? (west ? n10 : n20) : (west ? n11 : n21);
  const c = north ? (west ? n01 : n11) : (west ? n02 : n12);
  const d = north ? (west ? n11 : n21) : (west ? n12 : n22);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

export function landEdgeDistFromScenery(state: AtlasWorld, x: number, y: number, fx: number, fy: number): number {
  let dist = WATER_SHORE_MAX;
  if (sceneryAt(state, x + 1, y).kind !== TILE_WATER) dist = Math.min(dist, 1 - fx);
  if (sceneryAt(state, x - 1, y).kind !== TILE_WATER) dist = Math.min(dist, fx);
  if (sceneryAt(state, x, y + 1).kind !== TILE_WATER) dist = Math.min(dist, 1 - fy);
  if (sceneryAt(state, x, y - 1).kind !== TILE_WATER) dist = Math.min(dist, fy);
  if (sceneryAt(state, x + 1, y + 1).kind !== TILE_WATER) dist = Math.min(dist, Math.hypot(1 - fx, 1 - fy));
  if (sceneryAt(state, x - 1, y - 1).kind !== TILE_WATER) dist = Math.min(dist, Math.hypot(fx, fy));
  if (sceneryAt(state, x + 1, y - 1).kind !== TILE_WATER) dist = Math.min(dist, Math.hypot(1 - fx, fy));
  if (sceneryAt(state, x - 1, y + 1).kind !== TILE_WATER) dist = Math.min(dist, Math.hypot(fx, 1 - fy));
  return dist;
}

export function waterPixelDist(state: AtlasWorld, mapX: number, mapY: number): number {
  const x = Math.floor(mapX);
  const y = Math.floor(mapY);
  const fx = mapX - x;
  const fy = mapY - y;
  const sx = fx < 0.5 ? x - 1 : x;
  const sy = fy < 0.5 ? y - 1 : y;
  const tx = fx < 0.5 ? fx + 0.5 : fx - 0.5;
  const ty = fy < 0.5 ? fy + 0.5 : fy - 0.5;
  const field = lerp(
    lerp(waterShoreDist(state, sx, sy), waterShoreDist(state, sx + 1, sy), tx),
    lerp(waterShoreDist(state, sx, sy + 1), waterShoreDist(state, sx + 1, sy + 1), tx),
    ty,
  );
  return Math.min(field, landEdgeDistFromScenery(state, x, y, fx, fy));
}

export function tintWater(mats: BiomeMaterials, dist: number, mapX: number, mapY: number, salt: number): Rgb {
  const wet = fbm(mapX * 0.42, mapY * 0.28, salt + 73);
  const current = fbm(mapX * 0.16 + mapY * 0.09, mapY * 0.2, salt + 101);
  const warpedDist = Math.max(0, dist + (wet - 0.5) * 0.75);
  const depthT = Math.min(1, Math.max(0, (warpedDist - 0.45) / 3.8));
  let color = mixRgb(mats.waterMid, mats.waterDeep, 0.18 + depthT * 0.82);
  color = mixRgb(color, mats.waterDeep, current * 0.08 * depthT);
  color = mixRgb(color, mats.waterHi, wet * 0.1 * (0.3 + depthT * 0.45));
  const streak = Math.max(0, 1 - Math.abs(current - 0.5) * 3.2);
  color = mixRgb(color, mats.waterHi, streak * streak * 0.08);
  if (warpedDist < 1.2) color = mixRgb(color, mats.waterHi, (1.2 - warpedDist) * 0.18);
  return color;
}

export function sampleTerrainMaterial(
  state: AtlasWorld,
  mapX: number,
  mapY: number,
  context: TerrainMaterialContext = {},
): TerrainSample {
  const x = Math.floor(mapX);
  const y = Math.floor(mapY);
  const fx = mapX - x;
  const fy = mapY - y;
  const scenery = context.scenery ?? sceneryAt(state, x, y);
  const east = context.east ?? sceneryAt(state, x + 1, y);
  const south = context.south ?? sceneryAt(state, x, y + 1);
  const mats = context.mats ?? materialsFor(state);
  const tuning = terrainVisualTuningFor(state.biome);
  const rig = context.rig ?? terrainLightRigForBiome(state.seed, state.biome);
  const salt = context.salt ?? artSalt(state);
  const grain = fbm(mapX * 0.45, mapY * 0.45, salt);
  const micro = hash2(x * 13, y * 17, salt);
  const surface = surfaceAt(state, x, y);
  const ore = scenery.kind === TILE_RESOURCE || resourceAt(state, x, y) > 0;
  const water = scenery.kind === TILE_WATER;
  let color: Rgb;
  if (water) {
    const dist = waterPixelDist(state, mapX, mapY);
    color = tintWater(mats, dist, mapX, mapY, salt);
  } else if (surface === SURFACE_CONCRETE) {
    color = mixRgb(CONCRETE_STEEL, CONCRETE_STEEL_DARK, 0.05 + micro * 0.08);
    color = mixRgb(color, CONCRETE_STEEL_LIGHT, 0.04 + hash2(x, y, salt) * 0.05);
  } else if (surface === SURFACE_ROAD) {
    color = mixRgb(mats.road, mats.dark, 0.16 + grain * 0.22);
    color = mixRgb(color, mats.light, 0.06 + micro * 0.08);
  } else {
    const elev = scenery.elev;
    color = elev >= 3 ? mats.high : elev === 2 ? mixRgb(mats.mid, mats.high, 0.42) : elev <= 0 ? mats.low : mats.mid;
    if (context.waterNeighbor ?? waterNeighbor(state, x, y)) color = mixRgb(color, mats.shore, 0.28);
    if (ore) {
      color = mixRgb(color, mats.dark, 0.28);
      color = mixRgb(color, mats.ore, 0.22);
    }
    color = tintGroundPatches(color, mats, mapX, mapY, salt, tuning);
    if (scenery.kind === TILE_BLOCKED) color = mixRgb(color, mats.blocked, 0.42);
    const slope = (scenery.elev - east.elev) * (0.08 + tuning.reliefStrength * 0.05)
      + (scenery.elev - south.elev) * (0.12 + tuning.reliefStrength * 0.06);
    color = scaleRgb(color, 0.88 + scenery.elev * 0.055 + slope + (grain - 0.5) * (0.15 + tuning.roughness * 0.24));
    const restraint = scenery.kind === TILE_BLOCKED
      ? 0.18
      : Math.max(0.045, 0.12 - tuning.macroStrength * 0.18);
    color = restrainTerrainColor(color, restraint);
    color = gradeTerrainColor(color, terrainLightFactor(rig, elev, east.elev, south.elev, fx, fy), rig);
  }
  if (water) {
    const light = terrainLightFactor(rig, scenery.elev, east.elev, south.elev, fx, fy);
    color = gradeTerrainColor(color, 0.96 + (light - 0.96) * 0.34, rig, 0.005);
  } else if (surface === SURFACE_ROAD || surface === SURFACE_CONCRETE) {
    const light = terrainLightFactor(rig, scenery.elev, east.elev, south.elev, fx, fy);
    color = gradeTerrainColor(color, 0.98 + (light - 0.98) * 0.45, rig);
  }
  return {
    r: clampByte(color.r),
    g: clampByte(color.g),
    b: clampByte(color.b),
    water,
    ore,
    elev: scenery.elev,
  };
}
