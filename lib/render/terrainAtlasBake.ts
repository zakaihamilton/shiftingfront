import { MAP_SKIRT, sceneryAt, terrainFeatureAt, type TerrainFeatureSample } from "../gen/map";
import { SURFACE_CONCRETE, SURFACE_ROAD, TILE_BLOCKED, TILE_RESOURCE, TILE_WATER } from "../types";
import {
  ATLAS_CELL,
  CONCRETE_STEEL_DARK,
  TERRAIN_ATLAS_REV,
  artSalt,
  clampByte,
  hash2,
  materialsFor,
  mixRgb,
  resourceAt,
  surfaceAt,
  type AtlasWorld,
  type Rgb,
} from "./terrainMaterials";
import { oreVeinAt } from "./terrainOre";
import { applyBiomeGroundPattern } from "./terrainPatches";
import {
  terrainEdgeDarkening,
  terrainLightRigFor,
} from "./terrainLighting";
import {
  WATER_SHORE_MAX,
  bilinearFromNeighborhood,
  clampShore,
  landEdgeDistFromMask,
  readShoreCell,
  sampleTerrainMaterial,
  type TerrainMaterialContext,
  tintWater,
  waterShoreDist,
  waterNeighbor,
} from "./terrainAtlasSurfaces";

const WATER_CELL_CLASS = 0;
const ROAD_CELL_CLASS = 1;
const CONCRETE_CELL_CLASS = 2;
const ORE_CELL_CLASS = 3;
const GROUND_CELL_CLASS = 4;

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

export function resourceSignature(amounts: number[]): number {
  let h = amounts.length;
  for (let i = 0; i < amounts.length; i++) h = (Math.imul(h, 33) + (amounts[i] ?? 0)) | 0;
  return h;
}

export function terrainLayoutSignature(tiles: number[], surfaces: number[]): number {
  let h = tiles.length;
  for (let i = 0; i < tiles.length; i++) h = (Math.imul(h, 33) + (tiles[i] ?? 0)) | 0;
  h = (Math.imul(h, 33) + surfaces.length) | 0;
  for (let i = 0; i < surfaces.length; i++) h = (Math.imul(h, 33) + (surfaces[i] ?? 0)) | 0;
  return h;
}

export function makeAtlasKey(state: AtlasWorld, grainGeneration: number): string {
  return `${TERRAIN_ATLAS_REV}:${state.seed}:${state.missionIndex ?? 0}:${state.biome}:${state.width}x${state.height}:${terrainLayoutSignature(state.tiles, state.surfaces)}:${grainGeneration}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function atlasRectForTile(x: number, y: number, _mapWidth: number): { sx: number; sy: number; sw: number; sh: number } {
  return {
    sx: (x + MAP_SKIRT) * ATLAS_CELL,
    sy: (y + MAP_SKIRT) * ATLAS_CELL,
    sw: ATLAS_CELL,
    sh: ATLAS_CELL,
  };
}

type AtlasSceneryGrid = {
  cols: number;
  rows: number;
  kind: Uint8Array;
  elev: Uint8Array;
  waterNeighbors: Uint8Array;
};

function bakeWaterShoreDist(grid: AtlasSceneryGrid): Uint8Array {
  const { cols, rows, kind } = grid;
  const stride = cols + 2;
  const dist = new Uint8Array(cols * rows);
  dist.fill(255);
  const queue = new Int32Array(cols * rows);
  let tail = 0;
  let head = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (kind[(row + 1) * stride + col + 1] === TILE_WATER) continue;
      const i = row * cols + col;
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++]!;
    const d = dist[i]!;
    const col = i % cols;
    const row = (i / cols) | 0;
    const nd = d + 1;
    if (nd > WATER_SHORE_MAX) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nc = col + dx;
        const nr = row + dy;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = nr * cols + nc;
        if (nd >= dist[ni]!) continue;
        dist[ni] = nd;
        queue[tail++] = ni;
      }
    }
  }
  return dist;
}

function bakeAtlasSceneryGrid(state: AtlasWorld, cols: number, rows: number): AtlasSceneryGrid {
  const cachedCols = cols + 2;
  const cachedRows = rows + 2;
  const kind = new Uint8Array(cachedCols * cachedRows);
  const elev = new Uint8Array(cachedCols * cachedRows);
  for (let row = 0; row < cachedRows; row++) {
    for (let col = 0; col < cachedCols; col++) {
      const sample = sceneryAt(state, col - MAP_SKIRT - 1, row - MAP_SKIRT - 1);
      kind[row * cachedCols + col] = sample.kind;
      elev[row * cachedCols + col] = sample.elev;
    }
  }

  const waterNeighbors = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const center = (row + 1) * cachedCols + col + 1;
      let mask = 0;
      if (kind[center - cachedCols] === TILE_WATER) mask |= 1;
      if (kind[center + 1] === TILE_WATER) mask |= 2;
      if (kind[center + cachedCols] === TILE_WATER) mask |= 4;
      if (kind[center - 1] === TILE_WATER) mask |= 8;
      if (kind[center - cachedCols + 1] === TILE_WATER) mask |= 16;
      if (kind[center + cachedCols - 1] === TILE_WATER) mask |= 32;
      if (kind[center - cachedCols - 1] === TILE_WATER) mask |= 64;
      if (kind[center + cachedCols + 1] === TILE_WATER) mask |= 128;
      waterNeighbors[row * cols + col] = mask;
    }
  }
  return { cols, rows, kind, elev, waterNeighbors };
}

function atlasKindAt(grid: AtlasSceneryGrid, col: number, row: number): number {
  return grid.kind[(row + 1) * (grid.cols + 2) + col + 1] ?? TILE_BLOCKED;
}

function atlasSceneryAt(grid: AtlasSceneryGrid, col: number, row: number): { kind: number; elev: number } {
  const index = (row + 1) * (grid.cols + 2) + col + 1;
  return { kind: grid.kind[index] ?? TILE_BLOCKED, elev: grid.elev[index] ?? 0 };
}

function atlasSize(state: AtlasWorld): { cols: number; rows: number; width: number; height: number } {
  const cols = state.width + MAP_SKIRT * 2;
  const rows = state.height + MAP_SKIRT * 2;
  return { cols, rows, width: cols * ATLAS_CELL, height: rows * ATLAS_CELL };
}

function cellColor(state: AtlasWorld, gx: number, gy: number, context: TerrainMaterialContext): Rgb {
  const sample = sampleTerrainMaterial(state, gx, gy, context);
  return { r: sample.r, g: sample.g, b: sample.b };
}

export function bakeTerrainAtlasData(state: AtlasWorld, grainGeneration = 0): TerrainAtlasData {
  const { cols, rows, width, height } = atlasSize(state);
  const colors = new Float32Array(cols * rows * 3);
  const classes = new Uint8Array(cols * rows);
  const features = new Array<TerrainFeatureSample>(cols * rows);
  const waterCells = new Uint8Array(cols * rows);
  const sceneryGrid = bakeAtlasSceneryGrid(state, cols, rows);
  const shoreDist = bakeWaterShoreDist(sceneryGrid);
  const salt = artSalt(state);
  const mats = materialsFor(state);
  const rig = terrainLightRigFor(state.seed);
  const pixelFractions = Array.from({ length: ATLAS_CELL }, (_, index) => (index + 0.5) / ATLAS_CELL);
  const edgeFactors = Array.from({ length: ATLAS_CELL * ATLAS_CELL }, (_, index) => {
    const lx = index % ATLAS_CELL;
    const ly = Math.floor(index / ATLAS_CELL);
    return terrainEdgeDarkening(rig, lx / ATLAS_CELL, ly / ATLAS_CELL);
  });
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gx = col - MAP_SKIRT;
      const gy = row - MAP_SKIRT;
      const kind = atlasKindAt(sceneryGrid, col, row);
      const feature = terrainFeatureAt(state, gx, gy);
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
      features[row * cols + col] = feature;
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

  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gx = col - MAP_SKIRT;
      const gy = row - MAP_SKIRT;
      const i = (row * cols + col) * 3;
      const baseR = colors[i]!;
      const baseG = colors[i + 1]!;
      const baseB = colors[i + 2]!;
      const same = classes[row * cols + col]!;
      const canBlend = same !== CONCRETE_CELL_CLASS && same !== WATER_CELL_CLASS;
      const blendE = canBlend && col + 1 < cols && classes[row * cols + col + 1] === same;
      const blendS = canBlend && row + 1 < rows && classes[(row + 1) * cols + col] === same;
      const eastR = blendE ? colors[i + 3]! : baseR;
      const eastG = blendE ? colors[i + 4]! : baseG;
      const eastB = blendE ? colors[i + 5]! : baseB;
      const southI = i + cols * 3;
      const southR = blendS ? colors[southI]! : baseR;
      const southG = blendS ? colors[southI + 1]! : baseG;
      const southB = blendS ? colors[southI + 2]! : baseB;
      const southeastI = southI + 3;
      const blendSE = blendE
        && blendS
        && classes[(row + 1) * cols + col + 1] === same;
      const southeastR = blendSE ? colors[southeastI]! : baseR;
      const southeastG = blendSE ? colors[southeastI + 1]! : baseG;
      const southeastB = blendSE ? colors[southeastI + 2]! : baseB;
      const groundBilinear = same === GROUND_CELL_CLASS && blendSE;
      const rEastDelta = eastR - baseR;
      const rSouthDelta = southR - baseR;
      const rCornerDelta = southeastR - southR - eastR + baseR;
      const gEastDelta = eastG - baseG;
      const gSouthDelta = southG - baseG;
      const gCornerDelta = southeastG - southG - eastG + baseG;
      const bEastDelta = eastB - baseB;
      const bSouthDelta = southB - baseB;
      const bCornerDelta = southeastB - southB - eastB + baseB;
      const cellDist = clampShore(shoreDist[row * cols + col] ?? WATER_SHORE_MAX);
      const resourceAmount = same === ORE_CELL_CLASS ? resourceAt(state, gx, gy) : 0;
      const waterMask = same === WATER_CELL_CLASS ? sceneryGrid.waterNeighbors[row * cols + col] ?? 0 : 0;
      const feature = features[row * cols + col];
      const eastFeature = blendE ? features[row * cols + col + 1] : undefined;
      const southFeature = blendS ? features[(row + 1) * cols + col] : undefined;
      const southeastFeature = blendSE ? features[(row + 1) * cols + col + 1] : undefined;
      const featureCanBlend = same === GROUND_CELL_CLASS
        && blendSE
        && feature !== undefined
        && eastFeature?.kind === feature.kind
        && southFeature?.kind === feature.kind
        && southeastFeature?.kind === feature.kind;
      const featureIntensity = feature?.intensity ?? 0;
      const featureIntensityEastDelta = (eastFeature?.intensity ?? featureIntensity) - featureIntensity;
      const featureIntensitySouthDelta = (southFeature?.intensity ?? featureIntensity) - featureIntensity;
      const featureIntensityCornerDelta = (southeastFeature?.intensity ?? featureIntensity)
        - (southFeature?.intensity ?? featureIntensity)
        - (eastFeature?.intensity ?? featureIntensity)
        + featureIntensity;
      const featureDetail = feature?.detail ?? 0;
      const featureDetailEastDelta = (eastFeature?.detail ?? featureDetail) - featureDetail;
      const featureDetailSouthDelta = (southFeature?.detail ?? featureDetail) - featureDetail;
      const featureDetailCornerDelta = (southeastFeature?.detail ?? featureDetail)
        - (southFeature?.detail ?? featureDetail)
        - (eastFeature?.detail ?? featureDetail)
        + featureDetail;
      const n00 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col - 1, row - 1, cellDist) : 0;
      const n10 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col, row - 1, cellDist) : 0;
      const n20 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col + 1, row - 1, cellDist) : 0;
      const n01 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col - 1, row, cellDist) : 0;
      const n21 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col + 1, row, cellDist) : 0;
      const n02 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col - 1, row + 1, cellDist) : 0;
      const n12 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col, row + 1, cellDist) : 0;
      const n22 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col + 1, row + 1, cellDist) : 0;
      for (let ly = 0; ly < ATLAS_CELL; ly++) {
        const fy = ly / ATLAS_CELL;
        const mapY = gy + pixelFractions[ly]!;
        const py = row * ATLAS_CELL + ly;
        for (let lx = 0; lx < ATLAS_CELL; lx++) {
          const fx = lx / ATLAS_CELL;
          const mapX = gx + pixelFractions[lx]!;
          let r: number;
          let g: number;
          let b: number;
          if (same === WATER_CELL_CLASS) {
            const wet = tintWater(
              mats,
              Math.min(
                bilinearFromNeighborhood(pixelFractions[lx]!, pixelFractions[ly]!, n00, n10, n20, n01, cellDist, n21, n02, n12, n22),
                landEdgeDistFromMask(pixelFractions[lx]!, pixelFractions[ly]!, waterMask),
              ),
              mapX,
              mapY,
              salt,
            );
            r = wet.r;
            g = wet.g;
            b = wet.b;
          } else {
            if (groundBilinear) {
              r = baseR + rEastDelta * fx + rSouthDelta * fy + rCornerDelta * fx * fy;
              g = baseG + gEastDelta * fx + gSouthDelta * fy + gCornerDelta * fx * fy;
              b = baseB + bEastDelta * fx + bSouthDelta * fy + bCornerDelta * fx * fy;
            } else {
              r = baseR + (eastR - baseR) * fx * 0.28 + (southR - baseR) * fy * 0.28;
              g = baseG + (eastG - baseG) * fx * 0.28 + (southG - baseG) * fy * 0.28;
              b = baseB + (eastB - baseB) * fx * 0.28 + (southB - baseB) * fy * 0.28;
            }
          }
          if (same === GROUND_CELL_CLASS) {
            const patternX = gx + (lx + 0.5) / ATLAS_CELL;
            const patternY = gy + (ly + 0.5) / ATLAS_CELL;
            // Feature shading is subtle; only vary its scalars near atlas seams
            // so it follows the continuous ground color without adding a
            // second per-pixel feature allocation or noise pass.
            const featureBoundary = featureCanBlend
              && (lx < 2 || lx >= ATLAS_CELL - 2 || ly < 2 || ly >= ATLAS_CELL - 2);
            if (featureBoundary && feature !== undefined) {
              feature.intensity = featureIntensity
                + featureIntensityEastDelta * fx
                + featureIntensitySouthDelta * fy
                + featureIntensityCornerDelta * fx * fy;
              feature.detail = featureDetail
                + featureDetailEastDelta * fx
                + featureDetailSouthDelta * fy
                + featureDetailCornerDelta * fx * fy;
            } else if (featureCanBlend && feature !== undefined && lx === 2) {
              feature.intensity = featureIntensity;
              feature.detail = featureDetail;
            }
            const pat = applyBiomeGroundPattern({ r, g, b }, state.biome, patternX, patternY, salt, mats, feature);
            r = pat.r;
            g = pat.g;
            b = pat.b;
            const edgeFactor = edgeFactors[ly * ATLAS_CELL + lx]!;
            r *= edgeFactor;
            g *= edgeFactor;
            b *= edgeFactor;
          }
          if (same === ORE_CELL_CLASS) {
            const vein = oreVeinAt(
              state,
              gx + (lx + 0.5) / ATLAS_CELL,
              gy + (ly + 0.5) / ATLAS_CELL,
              { salt, amount: resourceAmount },
            );
            const metal = mixRgb(mats.ore, mats.light, 0.28 + vein.ridge * 0.45);
            const t = Math.min(1, vein.intensity);
            r += (metal.r - r) * t;
            g += (metal.g - g) * t;
            b += (metal.b - b) * t;
          }
          if (same === CONCRETE_CELL_CLASS) {
            const edge = lx === 0 || ly === 0 || lx === ATLAS_CELL - 1 || ly === ATLAS_CELL - 1;
            if (edge) {
              const t = 0.42;
              r += (CONCRETE_STEEL_DARK.r - r) * t;
              g += (CONCRETE_STEEL_DARK.g - g) * t;
              b += (CONCRETE_STEEL_DARK.b - b) * t;
            }
          }
          const px = col * ATLAS_CELL + lx;
          const grainScale = same === CONCRETE_CELL_CLASS ? 5 : same === WATER_CELL_CLASS ? 3 : same === GROUND_CELL_CLASS ? 11 : 13;
          let grain = (hash2(px, py, salt) - 0.5) * grainScale;
          if (same === GROUND_CELL_CLASS) {
            grain += (hash2(px, py, salt + 91) - 0.5) * 4;
            grain += (hash2(Math.floor(gx * 2 + lx / 4), Math.floor(gy * 2 + ly / 4), salt + 117) - 0.5) * 5;
          }
          const o = (py * width + px) * 4;
          if (same === WATER_CELL_CLASS) {
            data[o] = clampByte(r + grain * 0.35);
            data[o + 1] = clampByte(g + grain * 0.7);
            data[o + 2] = clampByte(b + grain);
          } else {
            data[o] = clampByte(r + grain);
            data[o + 1] = clampByte(g + grain * 0.82);
            data[o + 2] = clampByte(b + grain * 0.7);
          }
          data[o + 3] = 255;
        }
      }
    }
  }

  return {
    key: makeAtlasKey(state, grainGeneration),
    data,
    width,
    height,
    cell: ATLAS_CELL,
    mapWidth: state.width,
    mapHeight: state.height,
    waterCells,
  };
}

export function atlasPixelAtTile(atlas: TerrainAtlasData, tileX: number, tileY: number): [number, number, number] {
  const rect = atlasRectForTile(tileX, tileY, atlas.mapWidth);
  const px = Math.min(atlas.width - 1, Math.max(0, rect.sx + (rect.sw >> 1)));
  const py = Math.min(atlas.height - 1, Math.max(0, rect.sy + (rect.sh >> 1)));
  const i = (py * atlas.width + px) * 4;
  return [atlas.data[i] ?? 0, atlas.data[i + 1] ?? 0, atlas.data[i + 2] ?? 0];
}

export { sampleTerrainMaterial, waterShoreDist, waterNeighbor };
