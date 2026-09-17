import { sceneryAt, terrainFeatureAt, type TerrainFeatureKind, type TerrainFeatureSample } from "../../../gen/map";
import type { BiomeName, SurfaceKind } from "../../../types";
import {
  SURFACE_CONCRETE,
  SURFACE_ROAD,
  TILE_BLOCKED,
  TILE_CLEAR,
  TILE_RESOURCE,
  TILE_WATER,
} from "../../../types";
import { tileVariant } from "../../terrainAtlas";
import type { ScatterItem, ScatterKind, ScatterWorld } from "./types";

const POOLS: Record<BiomeName, ScatterKind[]> = {
  "jungle wreckage": ["tuft", "tuft", "shrub", "reed", "pebble", "tuft", "pebble", "dryBrush"],
  "salt marshes": ["tuft", "reed", "reed", "shrub", "shrub", "pebble", "dryBrush"],
  "ash plains": ["pebble", "pebble", "tuft", "pebbleCluster", "tuft", "rockSlab"],
  "crystal flats": ["crystalChip", "crystalChip", "pebble", "pebbleCluster", "mineralFlake", "sandShard"],
  "tundra grid": ["iceChip", "iceChip", "pebble", "tuft", "tuft", "mineralFlake"],
  "rust canyons": ["pebble", "debris", "debris", "pebbleCluster", "pebble", "rockSlab"],
  "volcanic shelf": ["pebble", "cinder", "cinder", "debris", "pebbleCluster", "rockSlab"],
  "glass desert": ["pebble", "pebbleCluster", "debris", "cinder", "rockSlab", "sandShard", "dryBrush"],
};

const FEATURE_POOLS: Partial<Record<TerrainFeatureKind, readonly ScatterKind[]>> = {
  ashDrift: ["tuft", "pebble", "pebbleCluster", "rockSlab"],
  cinderBasin: ["cinder", "pebble", "debris", "rockSlab"],
  scoriaField: ["cinder", "pebbleCluster", "pebble", "rockSlab"],
  crystalVein: ["crystalChip", "crystalChip", "pebble", "mineralFlake"],
  reflectivePan: ["crystalChip", "pebble", "iceChip", "mineralFlake"],
  facetRise: ["crystalChip", "pebbleCluster", "pebble", "sandShard", "mineralFlake"],
  strataGully: ["pebble", "debris", "pebbleCluster", "rockSlab"],
  mesaShelf: ["pebble", "pebbleCluster", "debris", "rockSlab"],
  scrapWash: ["debris", "debris", "pebble"],
  mudflat: ["reed", "tuft", "pebble"],
  reedBed: ["reed", "reed", "shrub"],
  saltPan: ["pebble", "iceChip", "tuft", "dryBrush"],
  duneSea: ["pebble", "pebbleCluster", "cinder", "sandShard", "rockSlab"],
  glassShards: ["sandShard", "crystalChip", "pebble", "debris", "mineralFlake"],
  dryWash: ["pebble", "pebbleCluster", "debris", "rockSlab", "sandShard"],
  frostPan: ["iceChip", "iceChip", "pebble"],
  iceRift: ["iceChip", "pebble", "tuft"],
  driftMoraine: ["pebbleCluster", "iceChip", "pebble", "mineralFlake"],
  canopyGrove: ["tuft", "shrub", "reed"],
  wreckClearing: ["debris", "tuft", "pebble"],
  vineRidge: ["shrub", "tuft", "pebble"],
  basaltShelf: ["cinder", "pebbleCluster", "pebble", "rockSlab"],
  lavaScar: ["cinder", "cinder", "debris", "rockSlab"],
  ashCone: ["cinder", "pebble", "pebbleCluster", "rockSlab"],
};

export function mix(v: number, salt: number): number {
  return (Math.imul(v ^ salt, 1597334677) >>> 0);
}

export function unit(v: number, salt: number): number {
  return mix(v, salt) / 4294967296;
}

export function signed(v: number, salt: number, span: number): number {
  return (unit(v, salt) * 2 - 1) * span;
}

function scatterChance(biome: BiomeName): number {
  switch (biome) {
    case "jungle wreckage": return 60;
    case "salt marshes": return 58;
    case "ash plains": return 50;
    case "rust canyons": return 47;
    case "crystal flats": return 45;
    case "volcanic shelf": return 45;
    case "tundra grid": return 42;
    case "glass desert": return 44;
  }
}

function makeItem(pool: readonly ScatterKind[], v: number, slot: number, scaleBoost = 0): ScatterItem {
  const hashed = mix(v, 31 + slot * 17);
  return {
    kind: pool[hashed % pool.length]!,
    ox: signed(v, 101 + slot, 8.5) + signed(v, 301 + slot, 2.2),
    oy: signed(v, 151 + slot, 3.4) + signed(v, 331 + slot, 1.4),
    rotation: signed(v, 361 + slot, 0.18),
    scale: 0.9 + unit(v, 201 + slot) * 0.62 + scaleBoost,
    variant: mix(v, 251 + slot),
  };
}

function groundItems(biome: BiomeName, v: number, feature: TerrainFeatureSample): ScatterItem[] {
  const chance = Math.min(68, scatterChance(biome) + Math.round(feature.intensity * 12));
  const roll = v % 100;
  if (roll >= chance) return [];
  const count = roll < chance * 0.16 ? 3 : roll < chance * 0.5 ? 2 : 1;
  const pool = feature.intensity >= 0.24 ? FEATURE_POOLS[feature.kind] ?? POOLS[biome] : POOLS[biome];
  const items: ScatterItem[] = [];
  for (let i = 0; i < count; i++) items.push(makeItem(pool, v, i, feature.intensity * 0.1));
  if (feature.intensity >= 0.3 && v % 13 === 0) {
    const landmark = makeItem(["landmark"], v, 8, Math.min(0.3, feature.intensity * 0.18));
    if (items.length >= 3) items[items.length - 1] = landmark;
    else items.push(landmark);
  }
  return items;
}

function roadItems(v: number): ScatterItem[] {
  if (v % 14 !== 0) return [];
  return [{
    kind: "pebble",
    ox: signed(v, 88, 8),
    oy: signed(v, 89, 3),
    rotation: signed(v, 92, 0.1),
    scale: 0.65 + unit(v, 90) * 0.3,
    variant: mix(v, 91),
  }];
}

export function scatterForTile(
  state: ScatterWorld,
  x: number,
  y: number,
  tileKind?: number,
  surface?: SurfaceKind,
): ScatterItem[] {
  const v = tileVariant(state.seed, x, y);
  const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
  const tile = tileKind ?? (
    inMap ? (state.tiles[y * state.width + x] ?? TILE_CLEAR) : sceneryAt(state, x, y).kind
  );
  const surf = surface ?? (inMap ? (state.surfaces[y * state.width + x] ?? 0) : 0);
  if (tile === TILE_WATER || tile === TILE_RESOURCE || tile === TILE_BLOCKED) return [];
  if (surf === SURFACE_CONCRETE) return [];
  if (surf === SURFACE_ROAD) return roadItems(v);
  return groundItems(state.biome, v, terrainFeatureAt(state, x, y));
}
