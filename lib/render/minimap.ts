import {
  missionUsesObjectiveZone,
  OBJECTIVE_ZONE_RADIUS,
  TILE_BLOCKED,
  TILE_RESOURCE,
  TILE_WATER,
  type Entity,
  type SimState,
} from "../types";
import { fogAt } from "../sim/fog";
import { atlasPixelAtTile, atlasRectForTile, fogTerrainGain, getTerrainAtlas, isTerrainAtlasBaked, terrainColors } from "./terrainAtlas";
import type { ColorblindMode } from "../persist/settings";

const MINIMAP_RENDER_REV = "world-atlas-v9-incremental-visible-detail";
export const MINIMAP_OVERLAY_TICK_SHIFT = 1;
const MINIMAP_FOG_COLOR = { r: 7, g: 15, b: 21 };
const MINIMAP_SAMPLE_WEIGHTS = [1, 2, 3, 4, 3, 2, 1];

export type MinimapRegion = "ground" | "elevation-mid" | "elevation-high" | "water" | "resource" | "blocked" | "road" | "concrete";

export function minimapRegionForCell(state: SimState, x: number, y: number): MinimapRegion {
  const i = y * state.width + x;
  const surface = state.surfaces[i] ?? 0;
  if (surface === 1) return "road";
  if (surface === 2) return "concrete";
  const tile = state.tiles[i];
  if (tile === TILE_WATER) return "water";
  if (tile === TILE_RESOURCE) return "resource";
  if (tile === TILE_BLOCKED) return "blocked";
  const elev = state.heights[i] ?? 1;
  if (elev >= 3) return "elevation-high";
  if (elev === 2) return "elevation-mid";
  return "ground";
}

export { terrainColors };

export function entityColor(e: Entity, state: SimState, mode: ColorblindMode = "none"): string {
  if (e.marked) return "#ffe066";
  if (mode === "deuteranopia" || mode === "protanopia") {
    if (e.owner === 0) {
      return "#38bdf8";
    }
    return "#fb923c";
  }
  if (mode === "tritanopia") {
    if (e.owner === 0) {
      return "#14b8a6";
    }
    return "#f43f5e";
  }
  const pal = state.factions[e.owner]?.palette;
  if (!pal) return "#888";
  // Minimap color communicates ownership; size already distinguishes units
  // from buildings, so initial and newly created friendly entities should not
  // be split into different shades based on their role.
  return pal.light;
}

export function minimapEntityVisible(state: SimState, e: Entity): boolean {
  const fog = fogAt(state, Math.round(e.x), Math.round(e.y));
  if (e.owner === 1 && fog !== 2) return false;
  // Stranded units are owner-0 objective actors, so they need their own fog
  // check or their location would leak through the minimap.
  if (e.scenarioRole === "stranded" && fog !== 2) return false;
  return true;
}

let lastTerrainKey = "";
let lastOverlayKeys = new WeakMap<HTMLCanvasElement, string>();
let terrainCanvas: HTMLCanvasElement | null = null;
let terrainLayer: MinimapTerrainLayer | null = null;

type MinimapTerrainLayer = {
  sourceKey: string;
  sampleCanvas: HTMLCanvasElement;
  visibleCanvas: HTMLCanvasElement;
  fog: Uint8Array;
};

export function invalidateMinimap(): void {
  lastTerrainKey = "";
  lastOverlayKeys = new WeakMap<HTMLCanvasElement, string>();
  terrainCanvas = null;
  terrainLayer = null;
}

function paintMinimapTerrain(ctx: CanvasRenderingContext2D, state: SimState, w: number, h: number): void {
  // The full terrain atlas carries the battlefield's per-tile edge shading.
  // Scaling it into the radar makes those seams read as an unintended grid,
  // so sample one interior color per tile and scale a low-resolution raster
  // smoothly instead.
  const atlas = getTerrainAtlas(state);
  if (typeof document !== "undefined") {
    const sourceKey = `${atlas.key}:${atlas.canvas ? "canvas" : "pixels"}:${w}x${h}`;
    if (
      terrainLayer
      && terrainLayer.sourceKey === sourceKey
      && terrainLayer.sampleCanvas.width === state.width
      && terrainLayer.sampleCanvas.height === state.height
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

  const colors = terrainColors(state.biome);
  ctx.fillStyle = colors.low;
  ctx.fillRect(0, 0, w, h);
  const cellW = w / state.width;
  const cellH = h / state.height;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const [r, g, b] = minimapCellColor(atlas, state, x, y);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
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
  const cellW = w / state.width;
  const cellH = h / state.height;
  ctx.save();
  // Visible terrain should retain the atlas texture. The smoothed sample
  // raster underneath handles the shrouded bands, while nearest-neighbour
  // copies keep discovered cells from looking washed out.
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (fogAt(state, x, y) === 2) {
        drawMinimapVisibleTile(ctx, atlas, state, x, y, cellW, cellH);
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
): void {
  ctx.clearRect(x * cellW, y * cellH, cellW, cellH);
  if (!atlas.canvas || fogAt(state, x, y) !== 2) return;
  drawMinimapVisibleTile(ctx, atlas, state, x, y, cellW, cellH);
}

function drawMinimapVisibleTile(
  ctx: CanvasRenderingContext2D,
  atlas: ReturnType<typeof getTerrainAtlas>,
  state: SimState,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
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
    x * cellW,
    y * cellH,
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

  const cellW = w / state.width;
  const cellH = h / state.height;
  visibleCtx.save();
  visibleCtx.imageSmoothingEnabled = false;
  for (const cell of changed) {
    paintMinimapVisibleTile(visibleCtx, atlas, state, cell.x, cell.y, cellW, cellH);
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
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(layer.sampleCanvas, 0, 0, state.width, state.height, 0, 0, w, h);
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

function paintMinimapOverlay(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  view: { x: number; y: number }[],
  w: number,
  h: number,
  selectedIds: ReadonlySet<number>,
  mode: ColorblindMode = "none",
): void {
  const sx = w / state.width;
  const sy = h / state.height;
  const targetIds = new Set(state.runtime?.targetIds ?? []);
  for (const e of state.entities) {
    if (e.hp <= 0) continue;
    if (!minimapEntityVisible(state, e)) continue;
    const x = e.x * sx;
    const y = e.y * sy;
    ctx.fillStyle = entityColor(e, state, mode);
    const size = e.class === "building" ? 6 : 3;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    if (selectedIds.has(e.id)) {
      ctx.strokeStyle = "#8ff9f2";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(4, size * 0.85), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (targetIds.has(e.id)) {
      ctx.strokeStyle = "#ffe066";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y - Math.max(4, size));
      ctx.lineTo(x + Math.max(4, size), y);
      ctx.lineTo(x, y + Math.max(4, size));
      ctx.lineTo(x - Math.max(4, size), y);
      ctx.closePath();
      ctx.stroke();
    }
  }
  const zone = state.runtime?.zone;
  if (zone && missionUsesObjectiveZone(state.runtime?.kind)) {
    const zx = zone.x * sx;
    const zy = zone.y * sy;
    const radiusX = Math.max(3, OBJECTIVE_ZONE_RADIUS * sx);
    const radiusY = Math.max(3, OBJECTIVE_ZONE_RADIUS * sy);
    ctx.fillStyle = "rgba(232, 200, 106, 0.08)";
    ctx.beginPath();
    ctx.ellipse(zx, zy, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e8c86a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(zx, zy, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(zx - 3, zy);
    ctx.lineTo(zx + 3, zy);
    ctx.moveTo(zx, zy - 3);
    ctx.lineTo(zx, zy + 3);
    ctx.stroke();
  }
  if (view.length >= 2) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < view.length; i++) {
      const p = view[i]!;
      const px = p.x * sx;
      const py = p.y * sy;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(143, 249, 242, 0.08)";
    ctx.fill();
    ctx.strokeStyle = "#f4ffff";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(143, 249, 242, 0.55)";
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.restore();
  }
}

function selectedKey(selectedIds: ReadonlySet<number> | undefined): string {
  return selectedIds ? [...selectedIds].sort((a, b) => a - b).join(",") : "";
}

export function minimapCacheKeys(
  state: SimState,
  view: { x: number; y: number }[],
  w: number,
  h: number,
  selectedIds?: ReadonlySet<number>,
  mode: ColorblindMode = "none",
): { terrainKey: string; overlayKey: string } {
  const viewKey = view.length
    ? `${view[0]!.x.toFixed(2)},${view[0]!.y.toFixed(2)}:${view[2] ? `${view[2].x.toFixed(2)},${view[2].y.toFixed(2)}` : ""}`
    : "";
  const palKey = `${state.factions[0]?.palette.primary ?? ""}:${state.factions[1]?.palette.primary ?? ""}`;
  const selectedKeyValue = selectedKey(selectedIds);
  const terrainKey = `${MINIMAP_RENDER_REV}:${state.seed}:${state.tick >> 4}:${state.biome}:${state.width}x${state.height}:${w}x${h}:${isTerrainAtlasBaked(state) ? "ready" : "pending"}`;
  const overlayKey = `${terrainKey}:${state.tick >> MINIMAP_OVERLAY_TICK_SHIFT}:${state.result}:${viewKey}:${state.entities.length}:${palKey}:${selectedKeyValue}:${mode}`;
  return { terrainKey, overlayKey };
}

export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  view: { x: number; y: number }[],
  selectedIds: ReadonlySet<number> = new Set(),
  mode: ColorblindMode = "none",
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const { terrainKey, overlayKey } = minimapCacheKeys(state, view, w, h, selectedIds, mode);
  if (lastOverlayKeys.get(ctx.canvas) === overlayKey) return;

  let terrainReady = false;
  if (typeof document !== "undefined") {
    if (!terrainCanvas) terrainCanvas = document.createElement("canvas");
    if (terrainCanvas.width !== w || terrainCanvas.height !== h) {
      terrainCanvas.width = w;
      terrainCanvas.height = h;
      lastTerrainKey = "";
    }
    if (lastTerrainKey !== terrainKey) {
      const tctx = terrainCanvas.getContext("2d");
      if (tctx) {
        paintMinimapTerrain(tctx, state, w, h);
        lastTerrainKey = terrainKey;
      }
    }
    if (lastTerrainKey === terrainKey) {
      ctx.drawImage(terrainCanvas, 0, 0);
      terrainReady = true;
    }
  }
  if (!terrainReady) paintMinimapTerrain(ctx, state, w, h);
  paintMinimapOverlay(ctx, state, view, w, h, selectedIds, mode);
  lastOverlayKeys.set(ctx.canvas, overlayKey);
}
