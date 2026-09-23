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

const terrainScroll: ScrollLayer = emptyScrollLayer();
let terrainCanvas: HTMLCanvasElement | null = null;
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

export function ensureTerrainCanvas(bw: number, bh: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (!terrainCanvas) {
    terrainCanvas = document.createElement("canvas");
  }
  if (terrainCanvas.width !== bw || terrainCanvas.height !== bh) {
    terrainCanvas.width = bw;
    terrainCanvas.height = bh;
    terrainScroll.key = "";
  }
  return terrainCanvas;
}

export function terrainContentKey(state: SimState, cam: Camera, w: number, h: number): string {
  const layout = terrainLayoutSignature(state.tiles, state.surfaces);
  const atlasState = isTerrainAtlasBaked(state) ? "ready" : "pending";
  return `${state.seed}:${state.missionIndex}:${state.tick >> 4}:${state.width}x${state.height}:${state.biome}:${TERRAIN_RENDER_REV}:${layout}:${terrainGrainGeneration()}:${atlasState}:${cam.zoom.toFixed(3)}:${w}x${h}`;
}

export function invalidateTerrainCache(): void {
  terrainScroll.key = "";
}

export function clearRendererSessionCache(): void {
  terrainScroll.key = "";
  terrainCanvas = null;
  entityById.clear();
  drawList.length = 0;
  entityDrawOrder.clear();
  lastReadySprite.clear();
}

export { terrainScroll };
