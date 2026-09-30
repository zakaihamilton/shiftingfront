import type { AtlasWorld } from "./terrainMaterials";
import type { TerrainAtlasData } from "./terrainAtlasBake";
import { makeAtlasKey } from "./terrainAtlasBake";

type Pending = { id: number; key: string; resolve: (atlas: TerrainAtlasData) => void; reject: (error: Error) => void; cleanup: () => void };
let worker: Worker | null = null;
let disabled = false;
let generation = 0;
let sequence = 0;
let pending: Pending | null = null;

function fail(): void {
  disabled = true;
  worker?.terminate();
  worker = null;
  pending?.cleanup();
  pending?.reject(new Error("Terrain worker unavailable"));
  pending = null;
}

export function disposeTerrainWorker(): void {
  generation++;
  worker?.terminate();
  worker = null;
  pending?.cleanup();
  pending?.reject(new DOMException("Terrain session disposed", "AbortError"));
  pending = null;
  disabled = false;
}

export function bakeTerrainInWorker(world: AtlasWorld, grainGeneration: number, signal: AbortSignal): Promise<TerrainAtlasData> | null {
  if (disabled) return null;
  if (typeof Worker === "undefined") {
    disabled = true;
    return null;
  }
  try {
    if (!worker) {
      worker = new Worker(new URL("./terrainWorker.ts", import.meta.url), { type: "module" });
      const activeWorker = worker;
      worker.onerror = () => { if (worker === activeWorker) fail(); };
      worker.onmessageerror = () => { if (worker === activeWorker) fail(); };
      worker.onmessage = ({ data }) => {
        if (!pending || data.id !== pending.id || data.generation !== generation) return;
        if (data.error || data.atlas?.key !== pending.key || !(data.atlas?.data instanceof Uint8ClampedArray)
          || !(data.atlas?.waterCells instanceof Uint8Array)) { fail(); return; }
        const completed = pending;
        pending = null;
        completed.cleanup();
        completed.resolve(data.atlas);
      };
    }
    pending?.cleanup();
    pending?.reject(new DOMException("Terrain request superseded", "AbortError"));
    const id = ++sequence;
    const key = makeAtlasKey(world, grainGeneration);
    return new Promise((resolve, reject) => {
      const abort = () => {
        if (pending?.id !== id) return;
        worker?.postMessage({ type: "cancel" });
        pending.cleanup();
        pending = null;
        reject(new DOMException("Terrain request cancelled", "AbortError"));
      };
      const timeout = setTimeout(fail, 15_000);
      pending = { id, key, resolve, reject, cleanup: () => { clearTimeout(timeout); signal.removeEventListener("abort", abort); } };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { abort(); return; }
      const terrain: AtlasWorld = { seed: world.seed, missionIndex: world.missionIndex, biome: world.biome,
        width: world.width, height: world.height, tiles: [...world.tiles], heights: [...world.heights],
        surfaces: [...world.surfaces], resourceAmount: [...world.resourceAmount] };
      try { worker!.postMessage({ type: "bake", id, atlasKey: key, generation, world: terrain, grainGeneration }); }
      catch { fail(); }
    });
  } catch { fail(); return null; }
}
