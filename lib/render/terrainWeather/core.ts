import type { SimState } from "../../types";
import { TILE_RESOURCE, TILE_WATER } from "../../types";
import type { FxTileIndex } from "./types";

let fxTileCache = new WeakMap<SimState, FxTileIndex>();

function buildFxTileIndex(state: SimState): FxTileIndex {
  const water: number[] = [];
  const ore: number[] = [];
  const size = state.width * state.height;
  for (let i = 0; i < size; i++) {
    const kind = state.tiles[i];
    if (kind === TILE_WATER) water.push(i);
    else if (kind === TILE_RESOURCE) ore.push(i);
  }
  return {
    water,
    ore,
    oreValidatedTick: state.tick,
    width: state.width,
    height: state.height,
  };
}

function pruneExhaustedOreTiles(state: SimState, index: FxTileIndex): void {
  for (let i = index.ore.length - 1; i >= 0; i--) {
    if (state.tiles[index.ore[i]!] !== TILE_RESOURCE) index.ore.splice(i, 1);
  }
  index.oreValidatedTick = state.tick;
}

function ensureFxTileIndex(state: SimState): FxTileIndex {
  let index = fxTileCache.get(state);
  if (!index || index.width !== state.width || index.height !== state.height) {
    index = buildFxTileIndex(state);
    fxTileCache.set(state, index);
    return index;
  }
  if (index.oreValidatedTick !== state.tick) pruneExhaustedOreTiles(state, index);
  return index;
}

export function resetFxTileIndex(): void {
  fxTileCache = new WeakMap();
}

export function forVisibleIndexedTiles(
  indices: number[],
  width: number,
  range: { x0: number; y0: number; x1: number; y1: number },
  visit: (x: number, y: number) => void,
): void {
  for (const i of indices) {
    const x = i % width;
    const y = (i - x) / width;
    if (x < range.x0 || x >= range.x1 || y < range.y0 || y >= range.y1) continue;
    visit(x, y);
  }
}

export { buildFxTileIndex, ensureFxTileIndex };
