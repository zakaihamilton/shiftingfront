import type { Entity, SimState } from "../../types";
import type { SpriteSpec } from "../../types";
import {
  emptyScrollLayer,
  type ScrollLayer,
} from "../scrollLayer";
import type { Camera } from "../../iso";
import { isTerrainAtlasBaked, terrainGrainGeneration } from "../terrainAtlas";
import { terrainLayoutSignature } from "../terrainAtlasBake";

const TERRAIN_RENDER_REV = "world-atlas-v32-no-feature-boundaries";

export type TerrainRenderCache = {
  canvas: HTMLCanvasElement;
  scroll: ScrollLayer;
};

let terrainCaches = new WeakMap<HTMLCanvasElement, TerrainRenderCache>();
export const entityById = new Map<number, Entity>();
export const drawList: Entity[] = [];
export const entityDrawOrder = new Map<number, number>();
export const lastReadySprite = new Map<string, { spec: SpriteSpec; img: HTMLCanvasElement }>();

export function spriteSessionKey(state: SimState): string {
  return `${state.seed}:${state.missionIndex}:${state.tutorialStage !== undefined ? "tutorial" : "mission"}`;
}

export function spriteCacheKey(state: SimState, entity: Entity): string {
  return `${spriteSessionKey(state)}:${entity.id}`;
}

export function ensureTerrainRenderCache(
  ownerCanvas: HTMLCanvasElement,
  bw: number,
  bh: number,
): TerrainRenderCache | null {
  if (typeof document === "undefined") return null;
  let cache = terrainCaches.get(ownerCanvas);
  if (!cache) {
    cache = { canvas: document.createElement("canvas"), scroll: emptyScrollLayer() };
    terrainCaches.set(ownerCanvas, cache);
  }
  if (cache.canvas.width !== bw || cache.canvas.height !== bh) {
    cache.canvas.width = bw;
    cache.canvas.height = bh;
    cache.scroll.key = "";
  }
  return cache;
}

export function terrainContentKey(state: SimState, cam: Camera, w: number, h: number): string {
  const layout = terrainLayoutSignature(state.tiles, state.surfaces);
  const atlasState = isTerrainAtlasBaked(state) ? "ready" : "pending";
  return `${state.seed}:${state.missionIndex}:${state.tick >> 4}:${state.width}x${state.height}:${state.biome}:${TERRAIN_RENDER_REV}:${layout}:${terrainGrainGeneration()}:${atlasState}:${cam.zoom.toFixed(3)}:${w}x${h}`;
}

export function invalidateTerrainCache(): void {
  terrainCaches = new WeakMap<HTMLCanvasElement, TerrainRenderCache>();
}

export function clearRendererSessionCache(): void {
  terrainCaches = new WeakMap<HTMLCanvasElement, TerrainRenderCache>();
  entityById.clear();
  drawList.length = 0;
  entityDrawOrder.clear();
  lastReadySprite.clear();
}
