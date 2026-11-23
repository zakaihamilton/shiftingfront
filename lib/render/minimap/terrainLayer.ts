import { fogAt } from "../../sim/fog";
import type { SimState } from "../../types";
import { minimapMapRect } from "../camera";
import {
  atlasPixelAtTile,
  atlasRectForTile,
  fogTerrainGain,
  getTerrainAtlas,
} from "../terrainAtlas";

const MINIMAP_FOG_COLOR = { r: 7, g: 15, b: 21 };
const MINIMAP_SAMPLE_WEIGHTS = [1, 2, 3, 4, 3, 2, 1];

export type MinimapTerrainLayer = {
  sourceKey: string;
  sampleCanvas: HTMLCanvasElement;
  visibleCanvas: HTMLCanvasElement;
  fog: Uint8Array;
};

let terrainLayer: MinimapTerrainLayer | null = null;

export function clearMinimapTerrainLayer(): void {
  terrainLayer = null;
}

export function paintMinimapTerrain(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  w: number,
  h: number,
): void {
  const mapRect = minimapMapRect(w, h, state.width, state.height);
  const cellW = mapRect.width / state.width;
  const cellH = mapRect.height / state.height;
  // The full terrain atlas carries the battlefield's per-tile edge shading.
  // Scaling it into the radar makes those seams read as an unintended grid,
  // so sample one interior color per tile and scale a low-resolution raster
  // smoothly instead.
  const atlas = getTerrainAtlas(state);
  if (typeof document !== "undefined") {
    const sourceKey = `${atlas.key}:${atlas.canvas ? "canvas" : "pixels"}:${w}x${h}`;
    if (
      terrainLayer &&
      terrainLayer.sourceKey === sourceKey &&
      terrainLayer.sampleCanvas.width === state.width &&
      terrainLayer.sampleCanvas.height === state.height
    ) {
      if (updateMinimapTerrainLayer(terrainLayer, atlas, state, w, h)) {
        composeMinimapTerrain(ctx, terrainLayer, state, w, h);
      }
      return;
    }

    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = state.width;
    sampleCanvas.height = state.height;
    const visibleCanvas = document.createElement("canvas");
    visibleCanvas.width = w;
    visibleCanvas.height = h;
    const sampleCtx = sampleCanvas.getContext("2d", { alpha: false });
    const visibleCtx = visibleCanvas.getContext("2d");
    if (sampleCtx && visibleCtx) {
      const image = sampleCtx.createImageData(state.width, state.height);
      paintMinimapSamples(image.data, atlas, state);
      sampleCtx.putImageData(image, 0, 0);
      visibleCtx.clearRect(0, 0, w, h);
      paintMinimapVisibleTerrain(visibleCtx, atlas, state, w, h);
      terrainLayer = {
        sourceKey,
        sampleCanvas,
        visibleCanvas,
        fog: snapshotMinimapFog(state),
      };
      composeMinimapTerrain(ctx, terrainLayer, state, w, h);
      return;
    }
  }

  ctx.fillStyle = `rgb(${MINIMAP_FOG_COLOR.r},${MINIMAP_FOG_COLOR.g},${MINIMAP_FOG_COLOR.b})`;
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const [r, g, b] = minimapCellColor(atlas, state, x, y);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(mapRect.x + x * cellW, mapRect.y + y * cellH, cellW, cellH);
    }
  }
}

function paintMinimapVisibleTerrain(
  ctx: CanvasRenderingContext2D,
  atlas: ReturnType<typeof getTerrainAtlas>,
  state: SimState,
  w: number,
  h: number,
): void {
  if (!atlas.canvas) return;
  const mapRect = minimapMapRect(w, h, state.width, state.height);
  const cellW = mapRect.width / state.width;
  const cellH = mapRect.height / state.height;
  ctx.save();
  // Visible terrain should retain the atlas texture. The smoothed sample
  // raster underneath handles the shrouded bands, while nearest-neighbour
  // copies keep discovered cells from looking washed out.
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (fogAt(state, x, y) === 2) {
        drawMinimapVisibleTile(ctx, atlas, state, x, y, cellW, cellH, mapRect.x, mapRect.y);
      }
    }
  }
  ctx.restore();
}

function paintMinimapVisibleTile(
  ctx: CanvasRenderingContext2D,
  atlas: ReturnType<typeof getTerrainAtlas>,
  state: SimState,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  offsetX: number,
  offsetY: number,
): void {
  ctx.clearRect(offsetX + x * cellW, offsetY + y * cellH, cellW, cellH);
  if (!atlas.canvas || fogAt(state, x, y) !== 2) return;
  drawMinimapVisibleTile(ctx, atlas, state, x, y, cellW, cellH, offsetX, offsetY);
}

function drawMinimapVisibleTile(
  ctx: CanvasRenderingContext2D,
  atlas: ReturnType<typeof getTerrainAtlas>,
  state: SimState,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  offsetX: number,
  offsetY: number,
): void {
  if (!atlas.canvas) return;
  const rect = atlasRectForTile(x, y, state.width);
  const inset = Math.min(1, (rect.sw - 1) / 2, (rect.sh - 1) / 2);
  ctx.drawImage(
    atlas.canvas,
    rect.sx + inset,
    rect.sy + inset,
    Math.max(1, rect.sw - inset * 2),
    Math.max(1, rect.sh - inset * 2),
    offsetX + x * cellW,
    offsetY + y * cellH,
    cellW,
    cellH,
  );
}

function snapshotMinimapFog(state: SimState): Uint8Array {
  const fog = new Uint8Array(state.width * state.height);
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      fog[y * state.width + x] = fogAt(state, x, y);
    }
  }
  return fog;
}

function updateMinimapTerrainLayer(
  layer: MinimapTerrainLayer,
  atlas: ReturnType<typeof getTerrainAtlas>,
  state: SimState,
  w: number,
  h: number,
): boolean {
  const changed: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const index = y * state.width + x;
      const nextFog = fogAt(state, x, y);
      if (layer.fog[index] === nextFog) continue;
      changed.push({ x, y });
    }
  }
  if (changed.length === 0) return false;

  const sampleCtx = layer.sampleCanvas.getContext("2d", { alpha: false });
  const visibleCtx = layer.visibleCanvas.getContext("2d");
  if (!sampleCtx || !visibleCtx) return false;

  for (const cell of changed) {
    layer.fog[cell.y * state.width + cell.x] = fogAt(state, cell.x, cell.y);
  }

  const affected = new Set<number>();
  for (const cell of changed) {
    for (let y = Math.max(0, cell.y - 3); y <= Math.min(state.height - 1, cell.y + 3); y++) {
      for (let x = Math.max(0, cell.x - 3); x <= Math.min(state.width - 1, cell.x + 3); x++) {
        affected.add(y * state.width + x);
      }
    }
  }

  const image = sampleCtx.getImageData(0, 0, state.width, state.height);
  for (const index of affected) {
    const x = index % state.width;
    const y = Math.floor(index / state.width);
    paintMinimapSampleCell(image.data, atlas, state, x, y);
  }
  sampleCtx.putImageData(image, 0, 0);

  const mapRect = minimapMapRect(w, h, state.width, state.height);
  const cellW = mapRect.width / state.width;
  const cellH = mapRect.height / state.height;
  visibleCtx.save();
  visibleCtx.imageSmoothingEnabled = false;
  for (const cell of changed) {
    paintMinimapVisibleTile(
      visibleCtx,
      atlas,
      state,
      cell.x,
      cell.y,
      cellW,
      cellH,
      mapRect.x,
      mapRect.y,
    );
  }
  visibleCtx.restore();
  return true;
}

function composeMinimapTerrain(
  ctx: CanvasRenderingContext2D,
  layer: MinimapTerrainLayer,
  state: SimState,
  w: number,
  h: number,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = `rgb(${MINIMAP_FOG_COLOR.r},${MINIMAP_FOG_COLOR.g},${MINIMAP_FOG_COLOR.b})`;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const mapRect = minimapMapRect(w, h, state.width, state.height);
  ctx.drawImage(
    layer.sampleCanvas,
    0,
    0,
    state.width,
    state.height,
    mapRect.x,
    mapRect.y,
    mapRect.width,
    mapRect.height,
  );
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer.visibleCanvas, 0, 0, w, h);
  ctx.restore();
}

function paintMinimapSamples(
  pixels: Uint8ClampedArray,
  atlas: ReturnType<typeof getTerrainAtlas>,
  state: SimState,
): void {
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      paintMinimapSampleCell(pixels, atlas, state, x, y);
    }
  }
}

function paintMinimapSampleCell(
  pixels: Uint8ClampedArray,
  atlas: ReturnType<typeof getTerrainAtlas>,
  state: SimState,
  x: number,
  y: number,
): void {
  const fogState = fogAt(state, x, y);
  let red = 0;
  let green = 0;
  let blue = 0;
  let weightTotal = 0;
  if (fogState === 2) {
    const [r, g, b] = minimapCellColor(atlas, state, x, y);
    red = r;
    green = g;
    blue = b;
    weightTotal = 1;
  } else {
    for (let oy = -3; oy <= 3; oy++) {
      for (let ox = -3; ox <= 3; ox++) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        // Keep hidden terrain opaque and do not bleed discovered terrain
        // across fog boundaries while smoothing the partially known raster.
        if (fogAt(state, nx, ny) !== fogState) continue;
        const [r, g, b] = minimapCellColor(atlas, state, nx, ny);
        const weight = MINIMAP_SAMPLE_WEIGHTS[ox + 3]! * MINIMAP_SAMPLE_WEIGHTS[oy + 3]!;
        red += r * weight;
        green += g * weight;
        blue += b * weight;
        weightTotal += weight;
      }
    }
  }
  const i = (y * state.width + x) * 4;
  pixels[i] = Math.round(red / Math.max(1, weightTotal));
  pixels[i + 1] = Math.round(green / Math.max(1, weightTotal));
  pixels[i + 2] = Math.round(blue / Math.max(1, weightTotal));
  pixels[i + 3] = 255;
}

function minimapCellColor(
  atlas: ReturnType<typeof getTerrainAtlas>,
  state: SimState,
  x: number,
  y: number,
): [number, number, number] {
  const [r, g, b] = atlasPixelAtTile(atlas, x, y);
  const fogState = fogAt(state, x, y);
  if (fogState === 0) return [MINIMAP_FOG_COLOR.r, MINIMAP_FOG_COLOR.g, MINIMAP_FOG_COLOR.b];
  const gain = fogTerrainGain(fogState);
  const fog = 1 - gain;
  return [
    Math.round(r * gain + MINIMAP_FOG_COLOR.r * fog),
    Math.round(g * gain + MINIMAP_FOG_COLOR.g * fog),
    Math.round(b * gain + MINIMAP_FOG_COLOR.b * fog),
  ];
}
