import {
  TILE_BLOCKED,
  TILE_CLEAR,
  TILE_RESOURCE,
  TILE_WATER,
  type BiomeName,
  type ReadonlyWinCategory,
} from "../../types";
import { biomeTuning } from "./config";
import { terrainFeatureAt } from "./features";
import { warpedFbm } from "./noise";
import { idx } from "./terrain";
import { type GeneratedMap } from "./generator";

export const MAP_SKIRT = 14;
export const MAP_SKIRT_ALPHA = 0.34;
const MAP_SKIRT_MIN_ALPHA = 0.08;
const MAP_SKIRT_FADE_END = 10;

export type ScenerySample = { kind: number; elev: number };

export type SceneryWorld = {
  seed?: number;
  missionIndex?: number;
  biome: BiomeName;
  width: number;
  height: number;
  tiles: number[];
  heights: number[];
};

export function outsideDist(x: number, y: number, w: number, h: number): number {
  const dx = x < 0 ? -x : x >= w ? x - w + 1 : 0;
  const dy = y < 0 ? -y : y >= h ? y - h + 1 : 0;
  return Math.max(dx, dy);
}

export function skirtAlpha(x: number, y: number, w: number, h: number): number {
  const dist = outsideDist(x, y, w, h);
  if (dist <= 0) return 1;
  const t = Math.max(0, Math.min(1, (dist - 1) / (MAP_SKIRT_FADE_END - 1)));
  const eased = t * t * (3 - 2 * t);
  return MAP_SKIRT_MIN_ALPHA + (MAP_SKIRT_ALPHA - MAP_SKIRT_MIN_ALPHA) * (1 - eased);
}

export function skirtSample(
  seed: number,
  biome: BiomeName,
  x: number,
  y: number,
  mapW: number,
  mapH: number,
  missionIndex = 0,
): ScenerySample {
  const dist = outsideDist(x, y, mapW, mapH);
  const salt = (Math.imul(seed ^ 0x9e3779b9, 747796405) >>> 0) % 1_000_000;
  const n = warpedFbm(x * 0.9, y * 0.9, salt);
  const n2 = warpedFbm(x * 1.65, y * 1.65, salt + 51);
  const riverBand = warpedFbm(x * 0.22, y * 0.22, salt + 113);
  const tuning = biomeTuning(biome);
  const feature = terrainFeatureAt({ seed, missionIndex, biome, width: mapW, height: mapH }, x, y);
  const river = Math.abs(riverBand - 0.5) < 0.08 + feature.wetness * 0.01 || n < tuning.water * 0.85 + feature.wetness * 0.04;
  if (river && dist <= 8 && n2 < 0.72) {
    return { kind: TILE_WATER, elev: 0 };
  }
  const mountain = tuning.mountain - feature.elevation * 0.1;
  if (dist >= 3 || n > mountain - 0.1) {
    const elev = dist >= 6 || n > mountain ? 3 : n > mountain - 0.2 ? 2 : 1;
    return { kind: TILE_BLOCKED, elev: Math.max(1, elev) };
  }
  if (n2 > tuning.blockers - feature.blockers * 0.04) return { kind: TILE_BLOCKED, elev: dist >= 2 ? 2 : 1 };
  return { kind: TILE_CLEAR, elev: dist >= 2 ? 2 : 1 };
}

export function isMountainScenery(sample: ScenerySample): boolean {
  return sample.elev >= 3 || (sample.kind === TILE_BLOCKED && sample.elev >= 2);
}

export function featureEdgeMask(
  state: SceneryWorld,
  x: number,
  y: number,
): { bank: number; ridge: number } {
  const here = sceneryAt(state, x, y);
  const water = here.kind === TILE_WATER;
  const mountain = isMountainScenery(here);
  let bank = 0;
  let ridge = 0;
  if (!water && !mountain) return { bank, ridge };
  const dirs: [number, number, number][] = [
    [0, -1, 1],
    [1, 0, 2],
    [0, 1, 4],
    [-1, 0, 8],
  ];
  for (const [dx, dy, bit] of dirs) {
    const n = sceneryAt(state, x + dx, y + dy);
    if (water && n.kind !== TILE_WATER) bank |= bit;
    if (mountain && !isMountainScenery(n)) ridge |= bit;
  }
  return { bank, ridge };
}

export function sceneryAt(
  state: SceneryWorld,
  x: number,
  y: number,
): ScenerySample {
  if (x >= 0 && y >= 0 && x < state.width && y < state.height) {
    const i = idx(x, y, state.width);
    return { kind: state.tiles[i]!, elev: state.heights[i] ?? 1 };
  }
  const sample = skirtSample(state.seed ?? 0, state.biome, x, y, state.width, state.height, state.missionIndex ?? 0);
  const cx = Math.max(0, Math.min(state.width - 1, x));
  const cy = Math.max(0, Math.min(state.height - 1, y));
  const edge = state.tiles[idx(cx, cy, state.width)];
  const dist = outsideDist(x, y, state.width, state.height);
  if (edge === TILE_WATER && dist <= 3) return { kind: TILE_WATER, elev: 0 };
  return sample;
}

export function describeMap(map: GeneratedMap): {
  width: number;
  height: number;
  water: number;
  resources: number;
  valley: number;
  plains: number;
  hills: number;
  mountain: number;
} {
  let water = 0;
  let resources = 0;
  let valley = 0;
  let plains = 0;
  let hills = 0;
  let mountain = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i]!;
    if (t === TILE_WATER) water++;
    if (t === TILE_RESOURCE) resources++;
    const el = map.heights[i] ?? 1;
    if (el <= 0) valley++;
    else if (el === 1) plains++;
    else if (el === 2) hills++;
    else mountain++;
  }
  return { width: map.width, height: map.height, water, resources, valley, plains, hills, mountain };
}

export function winNeedsMarked(win: ReadonlyWinCategory): boolean {
  return win.kind === "destroyMarked";
}
