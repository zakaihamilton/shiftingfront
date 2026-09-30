import { bakeTerrainInWorker, disposeTerrainWorker } from "./terrainWorkerClient";
import { biomeArt, TERRAIN_ART } from "../gen/visualAssets";
import { generateCampaignVisualProfile } from "../gen/visualProfile";
import { MAP_SKIRT } from "../gen/map";
import { ATLAS_CELL } from "./terrainMaterials";
import {
  bakeTerrainAtlasData as bakeAtlas,
  makeAtlasKey,
  type TerrainAtlasData,
  initAtlasBake,
  bakeAtlasRowSlice,
  finalizeAtlasBake,
} from "./terrainAtlasBake";
import type { AtlasWorld } from "./terrainMaterials";

export {
  ATLAS_CELL,
  TERRAIN_ATLAS_REV,
  CONCRETE_STEEL,
  CONCRETE_STEEL_LIGHT,
  CONCRETE_STEEL_DARK,
  biomeMaterials,
  fogTerrainGain,
  tileVariant,
  terrainColors,
} from "./terrainMaterials";
export type { AtlasWorld, TerrainSample } from "./terrainMaterials";
export {
  ORE_GLINT_RIDGE,
  ORE_CRYSTAL_MIN_AMOUNT,
  ORE_VEIN_PROBES,
  oreVeinAt,
  oreVeinPeak,
  oreShardCount,
  oreCrystalCluster,
} from "./terrainOre";
export type {
  OreVeinSample,
  OreVeinPeak,
  OreShardPose,
  OreBurstOrigin,
  OreCrystalCluster,
} from "./terrainOre";
export {
  resourceSignature,
  terrainLayoutSignature,
  atlasRectForTile,
  waterShoreDist,
  sampleTerrainMaterial,
  atlasPixelAtTile,
} from "./terrainAtlasBake";
export { tintGroundPatches, applyBiomeGroundPattern } from "./terrainPatches";
export type { TerrainAtlasData } from "./terrainAtlasBake";

export type TerrainAtlas = TerrainAtlasData & {
  canvas: HTMLCanvasElement | null;
};

let grainGeneration = 0;
const grainImages = new Map<string, HTMLImageElement>();
let atlasCache: TerrainAtlas | null = null;
let atlasCacheWorld: string | null = null;
const atlasBakePromises = new Map<string, Promise<TerrainAtlas>>();
const atlasBakeControllers = new Map<AtlasWorld, AbortController>();
const atlasPreloadPromises = new Map<string, Promise<boolean>>();
let atlasInvalidationGeneration = 0;

function atlasWorldIdentity(state: AtlasWorld): string {
  return `${state.seed}:${state.missionIndex ?? 0}:${state.biome}:${state.width}x${state.height}`;
}

export function terrainGrainGeneration(): number {
  return grainGeneration;
}

export function terrainAtlasKey(state: AtlasWorld): string {
  return makeAtlasKey(state, grainGeneration);
}

export function bakeTerrainAtlasData(state: AtlasWorld): TerrainAtlasData {
  return bakeAtlas(state, grainGeneration);
}

export function isTerrainAtlasReady(state: AtlasWorld): boolean {
  if (typeof Image === "undefined") return true;
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) return true;
  const biomeSrc = biomeArt(state.biome);
  const treatment = generateCampaignVisualProfile(state.seed).terrainTreatment;
  const plateSrc = TERRAIN_ART[treatment];
  const bImg = grainImages.get(biomeSrc);
  const pImg = grainImages.get(plateSrc);
  const bReady = Boolean(bImg && bImg.complete && bImg.naturalWidth > 0);
  const pReady = Boolean(pImg && pImg.complete && pImg.naturalWidth > 0);
  return bReady && pReady && isTerrainAtlasBaked(state);
}

export function isTerrainAtlasBaked(state: AtlasWorld): boolean {
  return Boolean(atlasCache && atlasCache.key === terrainAtlasKey(state));
}

export function preloadTerrainAtlas(
  state: AtlasWorld,
  options?: { rowsPerChunk?: number },
): Promise<boolean> {
  if (typeof Image === "undefined") return Promise.resolve(true);
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) return Promise.resolve(true);
  const preloadKey = makeAtlasKey(state, 0);
  const existing = atlasPreloadPromises.get(preloadKey);
  if (existing) return existing;
  const invalidationGeneration = atlasInvalidationGeneration;
  const biomeSrc = biomeArt(state.biome);
  const treatment = generateCampaignVisualProfile(state.seed).terrainTreatment;
  const plateSrc = TERRAIN_ART[treatment];

  const loadOne = (src: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      const cached = grainImages.get(src);
      // Failed optional textures have finished too; a later visit can still
      // bake the base terrain instead of waiting for an event that already fired.
      if (cached && cached.complete) {
        resolve();
        return;
      }
      const img = cached ?? new Image();
      if (!cached) {
        img.decoding = "async";
        grainImages.set(src, img);
      }
      if (img.complete && img.naturalWidth > 0) {
        resolve();
        return;
      }
      const onDone = () => {
        grainGeneration += 1;
        resolve();
      };
      img.addEventListener("load", onDone, { once: true });
      img.addEventListener("error", onDone, { once: true });
      if (!img.src) {
        img.src = src;
      }
    });
  };

  const promise = Promise.all([loadOne(biomeSrc), loadOne(plateSrc)]).then(async () => {
    if (invalidationGeneration !== atlasInvalidationGeneration) return false;
    if (typeof document !== "undefined") {
      await getTerrainAtlasAsync(state, options);
    }
    return true;
  });
  atlasPreloadPromises.set(preloadKey, promise);
  const clearPreload = () => {
    if (atlasPreloadPromises.get(preloadKey) === promise) atlasPreloadPromises.delete(preloadKey);
  };
  void promise.then(clearPreload, clearPreload);
  return promise;
}

function requestGrain(src: string): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  const cached = grainImages.get(src);
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    grainGeneration += 1;
  };
  img.src = src;
  grainImages.set(src, img);
  return null;
}

function overlayGrain(ctx: CanvasRenderingContext2D, state: AtlasWorld, width: number, height: number): void {
  const biomeImg = requestGrain(biomeArt(state.biome));
  const treatment = generateCampaignVisualProfile(state.seed).terrainTreatment;
  const plateImg = requestGrain(TERRAIN_ART[treatment]);
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  if (biomeImg) {
    ctx.globalAlpha = 0.26;
    const tw = biomeImg.naturalWidth || biomeImg.width;
    const th = biomeImg.naturalHeight || biomeImg.height;
    for (let y = 0; y < height; y += th) {
      for (let x = 0; x < width; x += tw) ctx.drawImage(biomeImg, x, y, tw, th);
    }
  }
  if (plateImg) {
    ctx.globalAlpha = 0.14;
    const tw = plateImg.naturalWidth || plateImg.width;
    const th = plateImg.naturalHeight || plateImg.height;
    for (let y = 0; y < height; y += th) {
      for (let x = 0; x < width; x += tw) ctx.drawImage(plateImg, x, y, tw, th);
    }
  }
  ctx.restore();
}


function createTerrainAtlas(state: AtlasWorld, baked: TerrainAtlasData): TerrainAtlas {
  let canvas: HTMLCanvasElement | null = null;
  if (typeof document !== "undefined") {
    canvas = document.createElement("canvas");
    canvas.width = baked.width;
    canvas.height = baked.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const image = ctx.createImageData(baked.width, baked.height);
      image.data.set(baked.data);
      ctx.putImageData(image, 0, 0);
      // Clip overlays to ground spans. No GPU pixel readback or water rewrite.
      ctx.save();
      ctx.beginPath();
      const cols = baked.width / baked.cell;
      const rows = baked.height / baked.cell;
      for (let row = 0; row < rows; row++) {
        let start = -1;
        for (let col = 0; col <= cols; col++) {
          const ground = col < cols && baked.waterCells[row * cols + col] !== 1;
          if (ground && start < 0) start = col;
          if (!ground && start >= 0) {
            ctx.rect(start * baked.cell, row * baked.cell, (col - start) * baked.cell, baked.cell);
            start = -1;
          }
        }
      }
      ctx.clip();
      overlayGrain(ctx, state, baked.width, baked.height);
      ctx.restore();
    }
  }
  return { ...baked, canvas };
}

function bakeAndCacheTerrainAtlas(state: AtlasWorld): TerrainAtlas {
  const key = terrainAtlasKey(state);
  if (atlasCache && atlasCache.key === key) return atlasCache;
  const atlas = createTerrainAtlas(state, bakeTerrainAtlasData(state));
  atlasCache = atlas;
  atlasCacheWorld = atlasWorldIdentity(state);
  return atlas;
}

export function invalidateTerrainAtlas(): void {
  disposeTerrainWorker();
  atlasCache = null;
  atlasCacheWorld = null;
  for (const controller of atlasBakeControllers.values()) controller.abort();
  atlasBakeControllers.clear();
  atlasBakePromises.clear();
  atlasPreloadPromises.clear();
  atlasInvalidationGeneration += 1;
}

export async function bakeTerrainAtlasDataAsync(
  state: AtlasWorld,
  options: { rowsPerChunk?: number; signal?: AbortSignal } = {},
): Promise<TerrainAtlasData> {
  const ctx = initAtlasBake(state, grainGeneration);
  const requestedRowsPerChunk = options.rowsPerChunk ?? 8;
  const rowsPerChunk = Number.isFinite(requestedRowsPerChunk)
    ? Math.max(1, Math.floor(requestedRowsPerChunk))
    : 8;
  while (ctx.currentRow < ctx.rows) {
    options.signal?.throwIfAborted();
    bakeAtlasRowSlice(ctx, rowsPerChunk);
    if (ctx.currentRow < ctx.rows) {
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
    }
  }
  return finalizeAtlasBake(ctx);
}

export async function getTerrainAtlasAsync(
  state: AtlasWorld,
  options?: { rowsPerChunk?: number },
): Promise<TerrainAtlas> {
  const key = terrainAtlasKey(state);
  if (atlasCache && atlasCache.key === key) return atlasCache;
  const existing = atlasBakePromises.get(key);
  if (existing) return existing;

  // Ore exhaustion can change the layout while a previous bake is yielding.
  // Keep only the newest request for this mutable world doing work.
  atlasBakeControllers.get(state)?.abort();
  const controller = new AbortController();
  atlasBakeControllers.set(state, controller);
  const invalidationGeneration = atlasInvalidationGeneration;
  const promise = (async () => {
    const workerBake = bakeTerrainInWorker(state, grainGeneration, controller.signal);
    let baked: TerrainAtlasData;
    try {
      baked = workerBake ? await workerBake : await bakeTerrainAtlasDataAsync(state, { ...options, rowsPerChunk: 1, signal: controller.signal });
    } catch (error) {
      controller.signal.throwIfAborted();
      if (error instanceof Error && error.name === "AbortError") throw error;
      baked = await bakeTerrainAtlasDataAsync(state, { ...options, rowsPerChunk: 1, signal: controller.signal });
    }
    const atlas = createTerrainAtlas(state, baked);
    if (invalidationGeneration === atlasInvalidationGeneration && terrainAtlasKey(state) === key) {
      atlasCache = atlas;
      atlasCacheWorld = atlasWorldIdentity(state);
    }
    return atlas;
  })();
  atlasBakePromises.set(key, promise);
  const clearBake = () => {
    if (atlasBakePromises.get(key) === promise) atlasBakePromises.delete(key);
    if (atlasBakeControllers.get(state) === controller) atlasBakeControllers.delete(state);
  };
  void promise.then(clearBake, clearBake);
  return promise;
}

export function getTerrainAtlas(state: AtlasWorld): TerrainAtlas {
  const key = terrainAtlasKey(state);
  if (atlasCache && atlasCache.key === key) return atlasCache;
  const preloading = atlasPreloadPromises.has(makeAtlasKey(state, 0));
  if (!preloading && !atlasBakePromises.has(key)
      && typeof document !== "undefined" && typeof requestAnimationFrame === "function"
      && !(typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom"))) {
    // Live layout changes need the same responsive preparation as initial load.
    void getTerrainAtlasAsync(state, { rowsPerChunk: 1 }).catch(() => undefined);
  }
  // Rendering may start while the grain textures are still loading. Reserve
  // the atlas for that preload instead of falling back to a synchronous bake.
  if (atlasBakePromises.has(key) || preloading) {
    // Keep the previous terrain visible during a live rebuild. Initial loads
    // and different missions still use the neutral pending-atlas fallback.
    if (atlasCache && atlasCacheWorld === atlasWorldIdentity(state)) return atlasCache;
    const cols = state.width + MAP_SKIRT * 2;
    const rows = state.height + MAP_SKIRT * 2;
    return {
      key,
      data: new Uint8ClampedArray(0),
      width: cols * ATLAS_CELL,
      height: rows * ATLAS_CELL,
      cell: ATLAS_CELL,
      mapWidth: state.width,
      mapHeight: state.height,
      waterCells: new Uint8Array(cols * rows),
      canvas: null,
    };
  }
  return bakeAndCacheTerrainAtlas(state);
}
