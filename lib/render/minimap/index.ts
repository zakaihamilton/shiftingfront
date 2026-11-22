import type { ColorblindMode } from "../../persist/settings";
import type { SimState } from "../../types";
import { isTerrainAtlasBaked } from "../terrainAtlas";
import { minimapViewRect, paintMinimapOverlay } from "./overlay";
import { clearMinimapTerrainLayer, paintMinimapTerrain } from "./terrainLayer";

const MINIMAP_RENDER_REV = "world-atlas-v17-isometric-projection";
export const MINIMAP_OVERLAY_TICK_SHIFT = 1;

let lastTerrainKey = "";
let lastOverlayKeys = new WeakMap<HTMLCanvasElement, string>();
let terrainCanvas: HTMLCanvasElement | null = null;

export function invalidateMinimap(): void {
  lastTerrainKey = "";
  lastOverlayKeys = new WeakMap<HTMLCanvasElement, string>();
  terrainCanvas = null;
  clearMinimapTerrainLayer();
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
  const viewRect = minimapViewRect(view, w, h, state.width, state.height);
  const viewKey = viewRect
    ? `${viewRect.x.toFixed(2)},${viewRect.y.toFixed(2)},${viewRect.width.toFixed(2)},${viewRect.height.toFixed(2)}`
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
    // Shroud lives on the terrain bitmap. Refresh it whenever the overlay
    // redraws so blips and fog stay on the same tick, while unchanged cells
    // are still patched in place.
    const tctx = terrainCanvas.getContext("2d");
    if (tctx) {
      paintMinimapTerrain(tctx, state, w, h);
      lastTerrainKey = terrainKey;
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

export {
  entityColor,
  type MinimapRegion,
  minimapEntityVisible,
  minimapRegionForCell,
  terrainColors,
} from "./classification";
export { minimapViewRect } from "./overlay";
