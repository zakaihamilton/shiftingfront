import { MAP_SKIRT, sceneryAt } from "../../gen/map";
import { TILE_BLOCKED, TILE_WATER } from "../../types";
import { ATLAS_CELL, type AtlasWorld, type Rgb } from "../terrainMaterials";
import {
  WATER_SHORE_MAX,
  sampleTerrainMaterial,
  type TerrainMaterialContext,
} from "../terrainAtlasSurfaces";
import type { AtlasSceneryGrid } from "./constants";

export function bakeWaterShoreDist(grid: AtlasSceneryGrid): Uint8Array {
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

export function bakeAtlasSceneryGrid(state: AtlasWorld, cols: number, rows: number): AtlasSceneryGrid {
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

export function atlasKindAt(grid: AtlasSceneryGrid, col: number, row: number): number {
  return grid.kind[(row + 1) * (grid.cols + 2) + col + 1] ?? TILE_BLOCKED;
}

export function atlasSceneryAt(grid: AtlasSceneryGrid, col: number, row: number): { kind: number; elev: number } {
  const index = (row + 1) * (grid.cols + 2) + col + 1;
  return { kind: grid.kind[index] ?? TILE_BLOCKED, elev: grid.elev[index] ?? 0 };
}

export function atlasSize(state: AtlasWorld): { cols: number; rows: number; width: number; height: number } {
  const cols = state.width + MAP_SKIRT * 2;
  const rows = state.height + MAP_SKIRT * 2;
  return { cols, rows, width: cols * ATLAS_CELL, height: rows * ATLAS_CELL };
}

export function cellColor(state: AtlasWorld, gx: number, gy: number, context: TerrainMaterialContext): Rgb {
  const sample = sampleTerrainMaterial(state, gx, gy, context);
  return { r: sample.r, g: sample.g, b: sample.b };
}
