import { ACTIVE_TERRAIN_RULE_INTENSITY, MAP_SKIRT, sceneryAt, terrainFeatureSamplerFor, type TerrainFeatureSample } from "../gen/map";
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
  terrainLightRigForBiome,
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

// Mixed-material transitions are intentionally narrower than the existing
// same-ground feather. At the default tile scale this projects to roughly
// 6–10 screen pixels, enough to break the grid without muddying the materials.
const MATERIAL_EDGE_RADIUS_MIN = 0.14;
const MATERIAL_EDGE_RADIUS_RANGE = 0.08;
const MATERIAL_EDGE_WARP_RANGE = 0.18;
const MATERIAL_CORNER_BLEND_CAP = 0.42;
const MATERIAL_CORNER_SPREAD_SCALE = 64;

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

type OrganicCornerBridges = {
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

function bakeOrganicCornerBridges(
  colors: Float32Array,
  classes: Uint8Array,
  cols: number,
  rows: number,
  salt: number,
): OrganicCornerBridges {
  const cornerCols = cols + 1;
  const cornerRows = rows + 1;
  const count = cornerCols * cornerRows;
  const valid = new Uint8Array(count);
  const r = new Float32Array(count);
  const g = new Float32Array(count);
  const b = new Float32Array(count);
  const radius = new Float32Array(count);
  const warpX = new Float32Array(count);
  const warpY = new Float32Array(count);
  const phase = new Float32Array(count);
  const blend = new Float32Array(count);

  for (let row = 1; row < rows; row++) {
    for (let col = 1; col < cols; col++) {
      const topLeft = (row - 1) * cols + col - 1;
      const topRight = topLeft + 1;
      const bottomLeft = row * cols + col - 1;
      const bottomRight = bottomLeft + 1;
      const cornerClasses = [
        classes[topLeft]!,
        classes[topRight]!,
        classes[bottomLeft]!,
        classes[bottomRight]!,
      ];
      const allLand = cornerClasses.every(isLandMaterialClass);
      const allGround = cornerClasses.every((cellClass) => cellClass === GROUND_CELL_CLASS);
      const mixedLand = allLand && new Set(cornerClasses).size > 1;
      if (
        !allGround
        && !mixedLand
      ) continue;

      const corner = row * cornerCols + col;
      const topLeftColor = topLeft * 3;
      const topRightColor = topRight * 3;
      const bottomLeftColor = bottomLeft * 3;
      const bottomRightColor = bottomRight * 3;
      const topLeftR = colors[topLeftColor]!;
      const topRightR = colors[topRightColor]!;
      const bottomLeftR = colors[bottomLeftColor]!;
      const bottomRightR = colors[bottomRightColor]!;
      const topLeftG = colors[topLeftColor + 1]!;
      const topRightG = colors[topRightColor + 1]!;
      const bottomLeftG = colors[bottomLeftColor + 1]!;
      const bottomRightG = colors[bottomRightColor + 1]!;
      const topLeftB = colors[topLeftColor + 2]!;
      const topRightB = colors[topRightColor + 2]!;
      const bottomLeftB = colors[bottomLeftColor + 2]!;
      const bottomRightB = colors[bottomRightColor + 2]!;
      r[corner] = (topLeftR + topRightR + bottomLeftR + bottomRightR) * 0.25;
      g[corner] = (topLeftG + topRightG + bottomLeftG + bottomRightG) * 0.25;
      b[corner] = (topLeftB + topRightB + bottomLeftB + bottomRightB) * 0.25;
      const colorSpread = Math.max(topLeftR, topRightR, bottomLeftR, bottomRightR)
        - Math.min(topLeftR, topRightR, bottomLeftR, bottomRightR)
        + Math.max(topLeftG, topRightG, bottomLeftG, bottomRightG)
        - Math.min(topLeftG, topRightG, bottomLeftG, bottomRightG)
        + Math.max(topLeftB, topRightB, bottomLeftB, bottomRightB)
        - Math.min(topLeftB, topRightB, bottomLeftB, bottomRightB);
      const worldX = col - MAP_SKIRT;
      const worldY = row - MAP_SKIRT;
      valid[corner] = 1;
      radius[corner] = 0.28 + hash2(worldX, worldY, salt + 601) * 0.12;
      warpX[corner] = (hash2(worldX, worldY, salt + 602) - 0.5) * 0.22;
      warpY[corner] = (hash2(worldX, worldY, salt + 603) - 0.5) * 0.22;
      phase[corner] = hash2(worldX, worldY, salt + 604) * Math.PI * 2;
      blend[corner] = mixedLand
        ? MATERIAL_CORNER_BLEND_CAP * Math.min(1, colorSpread / MATERIAL_CORNER_SPREAD_SCALE)
        : 0.6 * Math.min(1, colorSpread / 64);
    }
  }

  return { cols: cornerCols, valid, r, g, b, radius, warpX, warpY, phase, blend };
}

function isLandMaterialClass(cellClass: number | undefined): boolean {
  return cellClass === ROAD_CELL_CLASS
    || cellClass === CONCRETE_CELL_CLASS
    || cellClass === ORE_CELL_CLASS
    || cellClass === GROUND_CELL_CLASS;
}

function organicCornerMask(
  dx: number,
  dy: number,
  radius: number,
  warpX: number,
  warpY: number,
  phase: number,
): number {
  const warpedX = dx + Math.sin(dy * 6.2 + phase) * warpX;
  const warpedY = dy + Math.sin(dx * 5.1 - phase * 0.75) * warpY;
  const distance = Math.sqrt(warpedX * warpedX + warpedY * warpedY);
  const edge = Math.max(0, Math.min(1, (radius + 0.08 - distance) / 0.08));
  return edge * edge * (3 - edge * 2);
}

function organicEdgeMask(
  distance: number,
  along: number,
  radius: number,
  warp: number,
  phase: number,
): number {
  const boundary = radius
    + 0.08
    + Math.sin(along * 2.35 + phase) * warp
    + Math.sin(along * 5.15 - phase * 0.7) * warp * 0.35;
  const edge = Math.max(0, Math.min(1, (boundary - distance) / 0.08));
  return edge * edge * (3 - edge * 2);
}

function organicEdgeBlendStrength(
  baseR: number,
  baseG: number,
  baseB: number,
  neighborR: number,
  neighborG: number,
  neighborB: number,
  blendCap = 0.6,
  spreadScale = 40,
): number {
  const difference = Math.abs(baseR - neighborR)
    + Math.abs(baseG - neighborG)
    + Math.abs(baseB - neighborB);
  return blendCap * Math.min(1, difference / spreadScale);
}

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
  ruleRegions: Uint8Array;
  waterCells: Uint8Array;
  sceneryGrid: AtlasSceneryGrid;
  shoreDist: Uint8Array;
  salt: number;
  mats: ReturnType<typeof materialsFor>;
  rig: ReturnType<typeof terrainLightRigForBiome>;
  pixelFractions: number[];
  edgeFactors: number[];
  organicCorners: ReturnType<typeof bakeOrganicCornerBridges>;
  data: Uint8ClampedArray;
  currentRow: number;
};

export function initAtlasBake(state: AtlasWorld, grainGeneration = 0): AtlasBakeContext {
  const { cols, rows, width, height } = atlasSize(state);
  const colors = new Float32Array(cols * rows * 3);
  const classes = new Uint8Array(cols * rows);
  const features = new Array<TerrainFeatureSample>(cols * rows);
  const ruleRegions = new Uint8Array(cols * rows);
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
      ruleRegions[cellIndex] = feature.intensity >= ACTIVE_TERRAIN_RULE_INTENSITY ? 1 : 0;
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
    ruleRegions,
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

export function bakeAtlasRowSlice(ctx: AtlasBakeContext, rowCount: number): boolean {
  const {
    state,
    cols,
    rows,
    width,
    colors,
    classes,
    features,
    sceneryGrid,
    shoreDist,
    salt,
    mats,
    pixelFractions,
    edgeFactors,
    organicCorners,
    data,
  } = ctx;
  const startRow = ctx.currentRow;
  const sliceSize = Number.isFinite(rowCount) ? Math.max(1, Math.floor(rowCount)) : 1;
  const endRow = Math.min(rows, startRow + sliceSize);

  for (let row = startRow; row < endRow; row++) {
    for (let col = 0; col < cols; col++) {
      const gx = col - MAP_SKIRT;
      const gy = row - MAP_SKIRT;
      const i = (row * cols + col) * 3;
      const baseR = colors[i]!;
      const baseG = colors[i + 1]!;
      const baseB = colors[i + 2]!;
      const same = classes[row * cols + col]!;
      const cornerNW = row * organicCorners.cols + col;
      const cornerNE = cornerNW + 1;
      const cornerSW = cornerNW + organicCorners.cols;
      const cornerSE = cornerSW + 1;
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
      const westEdgeValid = same === GROUND_CELL_CLASS
        && col > 0
        && classes[row * cols + col - 1] === GROUND_CELL_CLASS;
      const eastEdgeValid = same === GROUND_CELL_CLASS
        && col + 1 < cols
        && classes[row * cols + col + 1] === GROUND_CELL_CLASS;
      const northEdgeValid = same === GROUND_CELL_CLASS
        && row > 0
        && classes[(row - 1) * cols + col] === GROUND_CELL_CLASS;
      const southEdgeValid = same === GROUND_CELL_CLASS
        && row + 1 < rows
        && classes[(row + 1) * cols + col] === GROUND_CELL_CLASS;
      const westI = i - 3;
      const northI = i - cols * 3;
      const westR = westEdgeValid ? colors[westI]! : baseR;
      const westG = westEdgeValid ? colors[westI + 1]! : baseG;
      const westB = westEdgeValid ? colors[westI + 2]! : baseB;
      const northR = northEdgeValid ? colors[northI]! : baseR;
      const northG = northEdgeValid ? colors[northI + 1]! : baseG;
      const northB = northEdgeValid ? colors[northI + 2]! : baseB;
      const westBlend = westEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, westR, westG, westB)
        : 0;
      const eastBlend = eastEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, eastR, eastG, eastB)
        : 0;
      const northBlend = northEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, northR, northG, northB)
        : 0;
      const southBlend = southEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, southR, southG, southB)
        : 0;
      const westRadius = westEdgeValid ? 0.24 + hash2(gx, 0, salt + 651) * 0.16 : 0;
      const eastRadius = eastEdgeValid ? 0.24 + hash2(gx + 1, 0, salt + 651) * 0.16 : 0;
      const northRadius = northEdgeValid ? 0.24 + hash2(0, gy, salt + 701) * 0.16 : 0;
      const southRadius = southEdgeValid ? 0.24 + hash2(0, gy + 1, salt + 701) * 0.16 : 0;
      const westWarp = westEdgeValid ? (hash2(gx, 0, salt + 652) - 0.5) * 0.34 : 0;
      const eastWarp = eastEdgeValid ? (hash2(gx + 1, 0, salt + 652) - 0.5) * 0.34 : 0;
      const northWarp = northEdgeValid ? (hash2(0, gy, salt + 702) - 0.5) * 0.34 : 0;
      const southWarp = southEdgeValid ? (hash2(0, gy + 1, salt + 702) - 0.5) * 0.34 : 0;
      const westPhase = westEdgeValid ? hash2(gx, 0, salt + 653) * Math.PI * 2 : 0;
      const eastPhase = eastEdgeValid ? hash2(gx + 1, 0, salt + 653) * Math.PI * 2 : 0;
      const northPhase = northEdgeValid ? hash2(0, gy, salt + 703) * Math.PI * 2 : 0;
      const southPhase = southEdgeValid ? hash2(0, gy + 1, salt + 703) * Math.PI * 2 : 0;
      const westClass = col > 0 ? classes[row * cols + col - 1] : undefined;
      const eastClass = col + 1 < cols ? classes[row * cols + col + 1] : undefined;
      const northClass = row > 0 ? classes[(row - 1) * cols + col] : undefined;
      const southClass = row + 1 < rows ? classes[(row + 1) * cols + col] : undefined;
      const westMaterialEdgeValid = isLandMaterialClass(same)
        && isLandMaterialClass(westClass)
        && westClass !== same;
      const eastMaterialEdgeValid = isLandMaterialClass(same)
        && isLandMaterialClass(eastClass)
        && eastClass !== same;
      const northMaterialEdgeValid = isLandMaterialClass(same)
        && isLandMaterialClass(northClass)
        && northClass !== same;
      const southMaterialEdgeValid = isLandMaterialClass(same)
        && isLandMaterialClass(southClass)
        && southClass !== same;
      const hasMaterialEdge = westMaterialEdgeValid
        || eastMaterialEdgeValid
        || northMaterialEdgeValid
        || southMaterialEdgeValid;
      const westMaterialR = westMaterialEdgeValid ? colors[westI]! : baseR;
      const westMaterialG = westMaterialEdgeValid ? colors[westI + 1]! : baseG;
      const westMaterialB = westMaterialEdgeValid ? colors[westI + 2]! : baseB;
      const eastMaterialR = eastMaterialEdgeValid ? colors[i + 3]! : baseR;
      const eastMaterialG = eastMaterialEdgeValid ? colors[i + 4]! : baseG;
      const eastMaterialB = eastMaterialEdgeValid ? colors[i + 5]! : baseB;
      const northMaterialR = northMaterialEdgeValid ? colors[northI]! : baseR;
      const northMaterialG = northMaterialEdgeValid ? colors[northI + 1]! : baseG;
      const northMaterialB = northMaterialEdgeValid ? colors[northI + 2]! : baseB;
      const southMaterialR = southMaterialEdgeValid ? colors[southI]! : baseR;
      const southMaterialG = southMaterialEdgeValid ? colors[southI + 1]! : baseG;
      const southMaterialB = southMaterialEdgeValid ? colors[southI + 2]! : baseB;
      const westMaterialBlend = westMaterialEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, westMaterialR, westMaterialG, westMaterialB)
        : 0;
      const eastMaterialBlend = eastMaterialEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, eastMaterialR, eastMaterialG, eastMaterialB)
        : 0;
      const northMaterialBlend = northMaterialEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, northMaterialR, northMaterialG, northMaterialB)
        : 0;
      const southMaterialBlend = southMaterialEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, southMaterialR, southMaterialG, southMaterialB)
        : 0;
      const westMaterialRadius = westMaterialEdgeValid
        ? MATERIAL_EDGE_RADIUS_MIN + hash2(gx, 0, salt + 751) * MATERIAL_EDGE_RADIUS_RANGE
        : 0;
      const eastMaterialRadius = eastMaterialEdgeValid
        ? MATERIAL_EDGE_RADIUS_MIN + hash2(gx + 1, 0, salt + 751) * MATERIAL_EDGE_RADIUS_RANGE
        : 0;
      const northMaterialRadius = northMaterialEdgeValid
        ? MATERIAL_EDGE_RADIUS_MIN + hash2(0, gy, salt + 761) * MATERIAL_EDGE_RADIUS_RANGE
        : 0;
      const southMaterialRadius = southMaterialEdgeValid
        ? MATERIAL_EDGE_RADIUS_MIN + hash2(0, gy + 1, salt + 761) * MATERIAL_EDGE_RADIUS_RANGE
        : 0;
      const westMaterialWarp = westMaterialEdgeValid
        ? (hash2(gx, 0, salt + 752) - 0.5) * MATERIAL_EDGE_WARP_RANGE
        : 0;
      const eastMaterialWarp = eastMaterialEdgeValid
        ? (hash2(gx + 1, 0, salt + 752) - 0.5) * MATERIAL_EDGE_WARP_RANGE
        : 0;
      const northMaterialWarp = northMaterialEdgeValid
        ? (hash2(0, gy, salt + 762) - 0.5) * MATERIAL_EDGE_WARP_RANGE
        : 0;
      const southMaterialWarp = southMaterialEdgeValid
        ? (hash2(0, gy + 1, salt + 762) - 0.5) * MATERIAL_EDGE_WARP_RANGE
        : 0;
      const westMaterialPhase = westMaterialEdgeValid
        ? hash2(gx, 0, salt + 753) * Math.PI * 2
        : 0;
      const eastMaterialPhase = eastMaterialEdgeValid
        ? hash2(gx + 1, 0, salt + 753) * Math.PI * 2
        : 0;
      const northMaterialPhase = northMaterialEdgeValid
        ? hash2(0, gy, salt + 763) * Math.PI * 2
        : 0;
      const southMaterialPhase = southMaterialEdgeValid
        ? hash2(0, gy + 1, salt + 763) * Math.PI * 2
        : 0;
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
      const ruleIndex = row * cols + col;
      const activeRuleRegion = ctx.ruleRegions[ruleIndex] === 1;
      const westRuleRegion = col > 0 && ctx.ruleRegions[ruleIndex - 1] === 1;
      const eastRuleRegion = col + 1 < cols && ctx.ruleRegions[ruleIndex + 1] === 1;
      const northRuleRegion = row > 0 && ctx.ruleRegions[ruleIndex - cols] === 1;
      const southRuleRegion = row + 1 < rows && ctx.ruleRegions[ruleIndex + cols] === 1;
      for (let ly = 0; ly < ATLAS_CELL; ly++) {
        const fy = ly / ATLAS_CELL;
        const pixelFy = pixelFractions[ly]!;
        const mapY = gy + pixelFy;
        const py = row * ATLAS_CELL + ly;
        for (let lx = 0; lx < ATLAS_CELL; lx++) {
          const fx = lx / ATLAS_CELL;
          const pixelFx = pixelFractions[lx]!;
          const mapX = gx + pixelFx;
          let r: number;
          let g: number;
          let b: number;
          let materialEdgeStrength = 0;
          let materialEdgeR = baseR;
          let materialEdgeG = baseG;
          let materialEdgeB = baseB;
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

            // Same-material feathering is only meaningful for ground cells.
            // Other land materials only need the more expensive organic branch
            // when they touch a different land material.
            if (same === GROUND_CELL_CLASS || hasMaterialEdge) {
              const nearWest = pixelFx < 0.5;
              const nearNorth = pixelFy < 0.5;
              const verticalDistance = nearWest ? pixelFx : 1 - pixelFx;
              const horizontalDistance = nearNorth ? pixelFy : 1 - pixelFy;
              if (same === GROUND_CELL_CLASS) {
                const verticalSameMask = nearWest
                  ? westEdgeValid
                    ? organicEdgeMask(verticalDistance, mapY, westRadius, westWarp, westPhase)
                    : 0
                  : eastEdgeValid
                    ? organicEdgeMask(verticalDistance, mapY, eastRadius, eastWarp, eastPhase)
                    : 0;
                const horizontalSameMask = nearNorth
                  ? northEdgeValid
                    ? organicEdgeMask(horizontalDistance, mapX, northRadius, northWarp, northPhase)
                    : 0
                  : southEdgeValid
                    ? organicEdgeMask(horizontalDistance, mapX, southRadius, southWarp, southPhase)
                    : 0;
                const verticalSameStrength = verticalSameMask * (nearWest ? westBlend : eastBlend);
                const horizontalSameStrength = horizontalSameMask * (nearNorth ? northBlend : southBlend);
                let edgeStrength = 0;
                let edgeR = baseR;
                let edgeG = baseG;
                let edgeB = baseB;
                if (verticalSameStrength >= horizontalSameStrength && verticalSameStrength > 0) {
                  edgeStrength = verticalSameStrength;
                  edgeR = nearWest ? westR : eastR;
                  edgeG = nearWest ? westG : eastG;
                  edgeB = nearWest ? westB : eastB;
                } else if (horizontalSameStrength > 0) {
                  edgeStrength = horizontalSameStrength;
                  edgeR = nearNorth ? northR : southR;
                  edgeG = nearNorth ? northG : southG;
                  edgeB = nearNorth ? northB : southB;
                }
                if (edgeStrength > 0) {
                  const targetR = (baseR + edgeR) * 0.5;
                  const targetG = (baseG + edgeG) * 0.5;
                  const targetB = (baseB + edgeB) * 0.5;
                  r += (targetR - r) * edgeStrength;
                  g += (targetG - g) * edgeStrength;
                  b += (targetB - b) * edgeStrength;
                }
              }
              if (hasMaterialEdge) {
                const verticalMaterialMask = nearWest
                  ? westMaterialEdgeValid
                    ? organicEdgeMask(verticalDistance, mapY, westMaterialRadius, westMaterialWarp, westMaterialPhase)
                    : 0
                  : eastMaterialEdgeValid
                    ? organicEdgeMask(verticalDistance, mapY, eastMaterialRadius, eastMaterialWarp, eastMaterialPhase)
                    : 0;
                const horizontalMaterialMask = nearNorth
                  ? northMaterialEdgeValid
                    ? organicEdgeMask(horizontalDistance, mapX, northMaterialRadius, northMaterialWarp, northMaterialPhase)
                    : 0
                  : southMaterialEdgeValid
                    ? organicEdgeMask(horizontalDistance, mapX, southMaterialRadius, southMaterialWarp, southMaterialPhase)
                    : 0;
                const verticalMaterialStrength = verticalMaterialMask * (nearWest ? westMaterialBlend : eastMaterialBlend);
                const horizontalMaterialStrength = horizontalMaterialMask * (nearNorth ? northMaterialBlend : southMaterialBlend);
                if (verticalMaterialStrength >= horizontalMaterialStrength && verticalMaterialStrength > 0) {
                  materialEdgeStrength = verticalMaterialStrength;
                  materialEdgeR = nearWest ? westMaterialR : eastMaterialR;
                  materialEdgeG = nearWest ? westMaterialG : eastMaterialG;
                  materialEdgeB = nearWest ? westMaterialB : eastMaterialB;
                } else if (horizontalMaterialStrength > 0) {
                  materialEdgeStrength = horizontalMaterialStrength;
                  materialEdgeR = nearNorth ? northMaterialR : southMaterialR;
                  materialEdgeG = nearNorth ? northMaterialG : southMaterialG;
                  materialEdgeB = nearNorth ? northMaterialB : southMaterialB;
                }
              }

              const nearestCorner = (pixelFx < 0.5 ? 0 : 1) + (pixelFy < 0.5 ? 0 : 2);
              const corner = nearestCorner === 0
                ? cornerNW
                : nearestCorner === 1
                  ? cornerNE
                  : nearestCorner === 2
                    ? cornerSW
                    : cornerSE;
              if (organicCorners.valid[corner] !== 0) {
                const dx = pixelFx < 0.5 ? pixelFx : 1 - pixelFx;
                const dy = pixelFy < 0.5 ? pixelFy : 1 - pixelFy;
                const mask = organicCornerMask(
                  dx,
                  dy,
                  organicCorners.radius[corner]!,
                  organicCorners.warpX[corner]!,
                  organicCorners.warpY[corner]!,
                  organicCorners.phase[corner]!,
                );
                if (mask > 0) {
                  const strength = mask * organicCorners.blend[corner]!;
                  r += (organicCorners.r[corner]! - r) * strength;
                  g += (organicCorners.g[corner]! - g) * strength;
                  b += (organicCorners.b[corner]! - b) * strength;
                }
              }
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
          if (materialEdgeStrength > 0) {
            const targetR = (baseR + materialEdgeR) * 0.5;
            const targetG = (baseG + materialEdgeG) * 0.5;
            const targetB = (baseB + materialEdgeB) * 0.5;
            r += (targetR - r) * materialEdgeStrength;
            g += (targetG - g) * materialEdgeStrength;
            b += (targetB - b) * materialEdgeStrength;
          }
          if (same !== WATER_CELL_CLASS) {
            const ruleEdge = (lx === 0 && activeRuleRegion !== westRuleRegion)
              || (lx === ATLAS_CELL - 1 && activeRuleRegion !== eastRuleRegion)
              || (ly === 0 && activeRuleRegion !== northRuleRegion)
              || (ly === ATLAS_CELL - 1 && activeRuleRegion !== southRuleRegion);
            if (ruleEdge) {
              const edge = 0.48;
              r += (236 - r) * edge;
              g += (208 - g) * edge;
              b += (137 - b) * edge;
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

  ctx.currentRow = endRow;
  return ctx.currentRow >= rows;
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

export function atlasPixelAtTile(atlas: TerrainAtlasData, tileX: number, tileY: number): [number, number, number] {
  const rect = atlasRectForTile(tileX, tileY, atlas.mapWidth);
  const px = Math.min(atlas.width - 1, Math.max(0, rect.sx + (rect.sw >> 1)));
  const py = Math.min(atlas.height - 1, Math.max(0, rect.sy + (rect.sh >> 1)));
  const i = (py * atlas.width + px) * 4;
  return [atlas.data[i] ?? 0, atlas.data[i + 1] ?? 0, atlas.data[i + 2] ?? 0];
}

export { sampleTerrainMaterial, waterShoreDist, waterNeighbor };
