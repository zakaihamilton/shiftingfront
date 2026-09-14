import { MAP_SKIRT } from "../gen/map";
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
import { atlasPixelAtTile, fogTerrainGain, getTerrainAtlas, terrainColors } from "./terrainAtlas";

const MINIMAP_RENDER_REV = "world-atlas-v4";
export const MINIMAP_OVERLAY_TICK_SHIFT = 1;
const MINIMAP_FOG_COLOR = { r: 7, g: 15, b: 21 };

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

function entityColor(e: Entity, state: SimState): string {
  if (e.marked) return "#ffe066";
  const pal = state.factions[e.owner]?.palette;
  if (!pal) return "#888";
  if (e.class === "building") {
    if (e.kind === "turret") return pal.accent;
    if (e.kind === "constructionYard" || e.kind === "objective") return pal.light;
    return pal.primary;
  }
  if (e.kind === "harvester") return pal.accent;
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

export function invalidateMinimap(): void {
  lastTerrainKey = "";
  lastOverlayKeys = new WeakMap<HTMLCanvasElement, string>();
  terrainCanvas = null;
}

function paintMinimapTerrain(ctx: CanvasRenderingContext2D, state: SimState, w: number, h: number): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const atlas = getTerrainAtlas(state);
  const colors = terrainColors(state.biome);
  ctx.fillStyle = colors.low;
  ctx.fillRect(0, 0, w, h);
  if (atlas.canvas) {
    const sx = MAP_SKIRT * atlas.cell;
    const sy = MAP_SKIRT * atlas.cell;
    const sw = state.width * atlas.cell;
    const sh = state.height * atlas.cell;
    ctx.drawImage(atlas.canvas, sx, sy, sw, sh, 0, 0, w, h);
    const cellW = w / state.width;
    const cellH = h / state.height;
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const fog = fogAt(state, x, y);
        if (fog >= 2) continue;
        const gain = fogTerrainGain(fog);
        ctx.fillStyle = fog === 0
          ? `rgb(${MINIMAP_FOG_COLOR.r},${MINIMAP_FOG_COLOR.g},${MINIMAP_FOG_COLOR.b})`
          : `rgba(${MINIMAP_FOG_COLOR.r},${MINIMAP_FOG_COLOR.g},${MINIMAP_FOG_COLOR.b},${1 - gain})`;
        ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
      }
    }
  } else {
    const cellW = w / state.width;
    const cellH = h / state.height;
    const baked = atlas;
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const [r, g, b] = atlasPixelAtTile(baked, x, y);
        const fogState = fogAt(state, x, y);
        if (fogState === 0) {
          ctx.fillStyle = `rgb(${MINIMAP_FOG_COLOR.r},${MINIMAP_FOG_COLOR.g},${MINIMAP_FOG_COLOR.b})`;
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
          continue;
        }
        const gain = fogTerrainGain(fogState);
        const fog = 1 - gain;
        ctx.fillStyle = `rgb(${Math.round(r * gain + MINIMAP_FOG_COLOR.r * fog)},${Math.round(g * gain + MINIMAP_FOG_COLOR.g * fog)},${Math.round(b * gain + MINIMAP_FOG_COLOR.b * fog)})`;
        ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
      }
    }
  }
}

function paintMinimapOverlay(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  view: { x: number; y: number }[],
  w: number,
  h: number,
  selectedIds: ReadonlySet<number>,
): void {
  const sx = w / state.width;
  const sy = h / state.height;
  const targetIds = new Set(state.runtime?.targetIds ?? []);
  for (const e of state.entities) {
    if (e.hp <= 0) continue;
    if (!minimapEntityVisible(state, e)) continue;
    const x = e.x * sx;
    const y = e.y * sy;
    ctx.fillStyle = entityColor(e, state);
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
): { terrainKey: string; overlayKey: string } {
  const viewKey = view.length
    ? `${view[0]!.x.toFixed(2)},${view[0]!.y.toFixed(2)}:${view[2] ? `${view[2].x.toFixed(2)},${view[2].y.toFixed(2)}` : ""}`
    : "";
  const palKey = `${state.factions[0]?.palette.primary ?? ""}:${state.factions[1]?.palette.primary ?? ""}`;
  const selectedKeyValue = selectedKey(selectedIds);
  const terrainKey = `${MINIMAP_RENDER_REV}:${state.seed}:${state.tick >> 4}:${state.biome}:${state.width}x${state.height}:${w}x${h}`;
  const overlayKey = `${terrainKey}:${state.tick >> MINIMAP_OVERLAY_TICK_SHIFT}:${state.result}:${viewKey}:${state.entities.length}:${palKey}:${selectedKeyValue}`;
  return { terrainKey, overlayKey };
}

export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  view: { x: number; y: number }[],
  selectedIds: ReadonlySet<number> = new Set(),
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const { terrainKey, overlayKey } = minimapCacheKeys(state, view, w, h, selectedIds);
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
  paintMinimapOverlay(ctx, state, view, w, h, selectedIds);
  lastOverlayKeys.set(ctx.canvas, overlayKey);
}
