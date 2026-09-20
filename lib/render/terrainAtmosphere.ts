import { fogAt } from "../sim/fog";
import type { SimState } from "../types";
import { expandIsoDiamond, TILE_H, TILE_W, tileToScreen, type Camera } from "../iso";
import { sceneryAt } from "../gen/map";
import { fogTerrainGain } from "./terrainAtlas";
import { isoDiamondPath } from "./isoDiamond";
import { terrainAtmosphereFrame, terrainLightRigForBiome, biomeAtmosphereColor } from "./terrainLighting";
import { visibleTileRange } from "./terrainPaint/world";

const MASK_SCALE = 0.25;
const MASK_CAMERA_QUANTUM = 8;

type AtmosphereCanvasCache = {
  key: string;
  canvas: HTMLCanvasElement;
};

let terrainMask: AtmosphereCanvasCache | null = null;
let atmosphereLayer: HTMLCanvasElement | null = null;

function rgba(color: { r: number; g: number; b: number }, alpha: number): string {
  return `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${alpha})`;
}

function cacheKey(state: SimState, cam: Camera, width: number, height: number): string {
  return [
    state.seed,
    state.tick >> 4,
    state.width,
    state.height,
    state.biome,
    Math.round(cam.x / MASK_CAMERA_QUANTUM),
    Math.round(cam.y / MASK_CAMERA_QUANTUM),
    cam.zoom.toFixed(2),
    width,
    height,
  ].join(":");
}

function ensureMask(state: SimState, cam: Camera, width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const key = cacheKey(state, cam, width, height);
  if (terrainMask?.key === key) return terrainMask.canvas;
  const canvas = terrainMask?.canvas ?? document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * MASK_SCALE));
  canvas.height = Math.max(1, Math.ceil(height * MASK_SCALE));
  const mask = canvas.getContext("2d");
  if (!mask) return null;
  mask.setTransform(1, 0, 0, 1, 0, 0);
  mask.globalAlpha = 1;
  mask.globalCompositeOperation = "source-over";
  mask.clearRect(0, 0, canvas.width, canvas.height);
  mask.save();
  mask.scale(MASK_SCALE, MASK_SCALE);
  const range = visibleTileRange(cam, width, height, state.width, state.height);
  const tw = TILE_W * cam.zoom;
  const th = TILE_H * cam.zoom;
  const depth0 = range.x0 + range.y0;
  const depth1 = (range.x1 - 1) + (range.y1 - 1);
  for (let depth = depth0; depth <= depth1; depth++) {
    const xs = Math.max(range.x0, depth - (range.y1 - 1));
    const xe = Math.min(range.x1 - 1, depth - range.y0);
    for (let x = xs; x <= xe; x++) {
      const y = depth - x;
      const scenery = sceneryAt(state, x, y);
      const gain = fogTerrainGain(fogAt(state, x, y));
      if (gain <= fogTerrainGain(0) + 0.01) continue;
      const screen = tileToScreen(x, y, cam, scenery.elev);
      const cover = expandIsoDiamond(screen.x, screen.y, tw, th, 1.08);
      isoDiamondPath(mask, cover.x, cover.y, cover.w, cover.h);
      mask.fillStyle = `rgba(255,255,255,${Math.max(0, gain - fogTerrainGain(0))})`;
      mask.fill();
    }
  }
  mask.restore();
  terrainMask = { key, canvas };
  return canvas;
}

function ensureLayer(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (!atmosphereLayer) atmosphereLayer = document.createElement("canvas");
  const layerWidth = Math.max(1, Math.ceil(width * MASK_SCALE));
  const layerHeight = Math.max(1, Math.ceil(height * MASK_SCALE));
  if (atmosphereLayer.width !== layerWidth || atmosphereLayer.height !== layerHeight) {
    atmosphereLayer.width = layerWidth;
    atmosphereLayer.height = layerHeight;
  }
  return atmosphereLayer;
}

export function clearTerrainAtmosphereCache(): void {
  terrainMask = null;
  atmosphereLayer = null;
}

export function paintTerrainAtmosphere(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  timeMs = 0,
  reducedMotion = false,
): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  if (width <= 0 || height <= 0 || typeof document === "undefined") return;
  const mask = ensureMask(state, cam, width, height);
  const layer = ensureLayer(width, height);
  if (!mask || !layer) return;
  const layerCtx = layer.getContext("2d");
  if (!layerCtx) return;
  const frame = terrainAtmosphereFrame(state.seed, timeMs, reducedMotion);
  const rig = terrainLightRigForBiome(state.seed, state.biome);
  const atmosphere = biomeAtmosphereColor(state.biome, rig);
  const layerWidth = layer.width;
  const layerHeight = layer.height;
  layerCtx.setTransform(1, 0, 0, 1, 0, 0);
  layerCtx.globalCompositeOperation = "source-over";
  layerCtx.globalAlpha = 1;
  layerCtx.clearRect(0, 0, layerWidth, layerHeight);

  const glowX = layerWidth * (0.5 + frame.driftX);
  const glowY = layerHeight * (0.28 + frame.driftY);
  const glowRadius = Math.max(layerWidth, layerHeight) * 0.62;
  const glow = layerCtx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowRadius);
  glow.addColorStop(0, rgba(rig.keyColor, frame.glowAlpha));
  glow.addColorStop(0.42, rgba(atmosphere, frame.glowAlpha * 0.38));
  glow.addColorStop(1, rgba(atmosphere, 0));
  layerCtx.fillStyle = glow;
  layerCtx.fillRect(0, 0, layerWidth, layerHeight);

  const haze = layerCtx.createLinearGradient(0, 0, layerWidth, layerHeight);
  haze.addColorStop(0, rgba(atmosphere, frame.hazeAlpha));
  haze.addColorStop(0.5, rgba(atmosphere, frame.hazeAlpha * 0.18));
  haze.addColorStop(1, rgba(atmosphere, 0));
  layerCtx.fillStyle = haze;
  layerCtx.fillRect(0, 0, layerWidth, layerHeight);

  layerCtx.globalCompositeOperation = "destination-in";
  layerCtx.drawImage(mask, 0, 0);
  layerCtx.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 1;
  ctx.drawImage(layer, 0, 0, width, height);
  ctx.restore();
}
