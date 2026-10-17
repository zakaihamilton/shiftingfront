import type { AtlasWorld } from "../terrainMaterials";
import type { TerrainFeatureSample } from "../../gen/map";
import type { materialsFor } from "../terrainMaterials";
import type { terrainLightRigForBiome } from "../terrainLighting";

export const WATER_CELL_CLASS = 0;
export const ROAD_CELL_CLASS = 1;
export const CONCRETE_CELL_CLASS = 2;
export const ORE_CELL_CLASS = 3;
export const GROUND_CELL_CLASS = 4;

// Mixed-material transitions are intentionally narrower than the existing
// same-ground feather. At the default tile scale this projects to roughly
// 6–10 screen pixels, enough to break the grid without muddying the materials.
export const MATERIAL_EDGE_RADIUS_MIN = 0.14;
export const MATERIAL_EDGE_RADIUS_RANGE = 0.08;
export const MATERIAL_EDGE_WARP_RANGE = 0.18;
export const MATERIAL_CORNER_BLEND_CAP = 0.42;
export const MATERIAL_CORNER_SPREAD_SCALE = 64;

export type TerrainAtlasData = {
  key: string;
  data: Uint8ClampedArray;
  width: number;
  height: number;
  cell: number;
  mapWidth: number;
  mapHeight: number;
  waterCells: Uint8Array;
};

export type AtlasSceneryGrid = {
  cols: number;
  rows: number;
  kind: Uint8Array;
  elev: Uint8Array;
  waterNeighbors: Uint8Array;
};

export type OrganicCornerBridges = {
  cols: number;
  valid: Uint8Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  radius: Float32Array;
  warpX: Float32Array;
  warpY: Float32Array;
  phase: Float32Array;
  blend: Float32Array;
};

export type AtlasBakeContext = {
  state: AtlasWorld;
  grainGeneration: number;
  cols: number;
  rows: number;
  width: number;
  height: number;
  colors: Float32Array;
  classes: Uint8Array;
  features: Array<TerrainFeatureSample>;
  waterCells: Uint8Array;
  sceneryGrid: AtlasSceneryGrid;
  shoreDist: Uint8Array;
  salt: number;
  mats: ReturnType<typeof materialsFor>;
  rig: ReturnType<typeof terrainLightRigForBiome>;
  pixelFractions: number[];
  edgeFactors: number[];
  organicCorners: OrganicCornerBridges;
  data: Uint8ClampedArray;
  currentRow: number;
};
