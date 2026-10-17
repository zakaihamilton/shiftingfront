import { MAP_SKIRT, terrainFeatureSamplerFor, type TerrainFeatureSample } from "../gen/map";
import { SURFACE_CONCRETE, SURFACE_ROAD, TILE_RESOURCE, TILE_WATER } from "../types";
import {
  ATLAS_CELL,
  artSalt,
  materialsFor,
  surfaceAt,
  type AtlasWorld,
} from "./terrainMaterials";
import {
  terrainEdgeDarkening,
  terrainLightRigForBiome,
} from "./terrainLighting";
import {
  sampleTerrainMaterial,
  waterShoreDist,
  waterNeighbor,
} from "./terrainAtlasSurfaces";
import {
  CONCRETE_CELL_CLASS,
  GROUND_CELL_CLASS,
  ORE_CELL_CLASS,
  ROAD_CELL_CLASS,
  WATER_CELL_CLASS,
  atlasKindAt,
  atlasPixelAtTile,
  atlasRectForTile,
  atlasSceneryAt,
  atlasSize,
  bakeAtlasRowSlice,
  bakeAtlasSceneryGrid,
  bakeOrganicCornerBridges,
  bakeWaterShoreDist,
  cellColor,
  makeAtlasKey,
  resourceSignature,
  terrainLayoutSignature,
  type AtlasBakeContext,
  type TerrainAtlasData,
} from "./terrainAtlas/index";

export type { TerrainAtlasData, AtlasBakeContext };
export {
  resourceSignature,
  terrainLayoutSignature,
  makeAtlasKey,
  atlasRectForTile,
  atlasPixelAtTile,
  bakeAtlasRowSlice,
  sampleTerrainMaterial,
  waterShoreDist,
  waterNeighbor,
};

export function initAtlasBake(state: AtlasWorld, grainGeneration = 0): AtlasBakeContext {
  const { cols, rows, width, height } = atlasSize(state);
  const colors = new Float32Array(cols * rows * 3);
  const classes = new Uint8Array(cols * rows);
  const features = new Array<TerrainFeatureSample>(cols * rows);
  const waterCells = new Uint8Array(cols * rows);
  const sceneryGrid = bakeAtlasSceneryGrid(state, cols, rows);
  const shoreDist = bakeWaterShoreDist(sceneryGrid);
  const salt = artSalt(state);
  const mats = materialsFor(state);
  const rig = terrainLightRigForBiome(state.seed, state.biome);
  const pixelFractions = Array.from({ length: ATLAS_CELL }, (_, index) => (index + 0.5) / ATLAS_CELL);
  const edgeFactors = Array.from({ length: ATLAS_CELL * ATLAS_CELL }, (_, index) => {
    const lx = index % ATLAS_CELL;
    const ly = Math.floor(index / ATLAS_CELL);
    return terrainEdgeDarkening(rig, lx / ATLAS_CELL, ly / ATLAS_CELL);
  });
  const featureAt = terrainFeatureSamplerFor(state);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gx = col - MAP_SKIRT;
      const gy = row - MAP_SKIRT;
      const kind = atlasKindAt(sceneryGrid, col, row);
      const feature = featureAt(gx, gy);
      const scenery = atlasSceneryAt(sceneryGrid, col, row);
      const color = kind === TILE_WATER ? { r: 0, g: 0, b: 0 } : cellColor(state, gx, gy, {
        scenery,
        east: atlasSceneryAt(sceneryGrid, col + 1, row),
        south: atlasSceneryAt(sceneryGrid, col, row + 1),
        mats,
        rig,
        salt,
        waterNeighbor: (sceneryGrid.waterNeighbors[row * cols + col] ?? 0) !== 0,
      });
      const i = (row * cols + col) * 3;
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
      const cellIndex = row * cols + col;
      features[cellIndex] = feature;
      waterCells[row * cols + col] = kind === TILE_WATER ? 1 : 0;
      const surface = surfaceAt(state, gx, gy);
      classes[row * cols + col] = kind === TILE_WATER
        ? WATER_CELL_CLASS
        : surface === SURFACE_ROAD
          ? ROAD_CELL_CLASS
          : surface === SURFACE_CONCRETE
            ? CONCRETE_CELL_CLASS
            : kind === TILE_RESOURCE
              ? ORE_CELL_CLASS
              : GROUND_CELL_CLASS;
    }
  }

  const organicCorners = bakeOrganicCornerBridges(colors, classes, cols, rows, salt);
  const data = new Uint8ClampedArray(width * height * 4);

  return {
    state,
    grainGeneration,
    cols,
    rows,
    width,
    height,
    colors,
    classes,
    features,
    waterCells,
    sceneryGrid,
    shoreDist,
    salt,
    mats,
    rig,
    pixelFractions,
    edgeFactors,
    organicCorners,
    data,
    currentRow: 0,
  };
}

export function finalizeAtlasBake(ctx: AtlasBakeContext): TerrainAtlasData {
  return {
    key: makeAtlasKey(ctx.state, ctx.grainGeneration),
    data: ctx.data,
    width: ctx.width,
    height: ctx.height,
    cell: ATLAS_CELL,
    mapWidth: ctx.state.width,
    mapHeight: ctx.state.height,
    waterCells: ctx.waterCells,
  };
}

export function bakeTerrainAtlasData(state: AtlasWorld, grainGeneration = 0): TerrainAtlasData {
  const ctx = initAtlasBake(state, grainGeneration);
  bakeAtlasRowSlice(ctx, ctx.rows);
  return finalizeAtlasBake(ctx);
}
