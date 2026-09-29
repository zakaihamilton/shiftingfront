import { cameraViewQuad, type Camera } from "@/lib/iso";
import { renderMinimap } from "@/lib/render/minimap";
import { renderWorld, type RenderExtras } from "@/lib/render/renderer";
import { drawPerfHud, isPerfHudEnabled } from "@/lib/render/perfHud";
import { cullFx, type FxBurst } from "@/lib/render/fx";
import type { BuildingKind, SimState } from "@/lib/types";
import { renderDimensions } from "./hooks/useGameCamera";
import { selectionBoxScreen, type SelectionBox } from "./hooks/selectionBox";

type Point = { x: number; y: number };
export type RenderFrameOptions = {
  state: SimState;
  canvas: HTMLCanvasElement;
  tooltipCanvas?: HTMLCanvasElement | null;
  host: HTMLElement;
  worldCtx: CanvasRenderingContext2D | null;
  tooltipCtx?: CanvasRenderingContext2D | null;
  miniCanvas: HTMLCanvasElement | null;
  miniCtx: CanvasRenderingContext2D | null;
  secondaryMiniCanvas: HTMLCanvasElement | null;
  secondaryMiniCtx: CanvasRenderingContext2D | null;
  cam: Camera;
  minimapCam: Camera;
  selected: Set<number>;
  hover: Point | null;
  cursor: Point | null;
  placeKind: BuildingKind | null;
  repairMode: boolean;
  sellMode: boolean;
  selectBox: SelectionBox | null;
  extras: RenderExtras;
  fx: FxBurst[];
  nowMs?: number;
  subTickAlpha?: number;
  colorblindMode?: import("@/lib/persist/settings").ColorblindMode;
};

export type RenderFrameResult = {
  worldCtx: CanvasRenderingContext2D | null;
  tooltipCtx: CanvasRenderingContext2D | null;
  miniCtx: CanvasRenderingContext2D | null;
  secondaryMiniCtx: CanvasRenderingContext2D | null;
  fx: FxBurst[];
};

/** Keeps canvas sizing, world rendering, minimap rendering, and frame diagnostics together. */
export function renderGameFrame(options: RenderFrameOptions): RenderFrameResult {
  const {
    state,
    canvas,
    host,
    cam,
    minimapCam,
    selected,
    hover,
    cursor,
    placeKind,
    repairMode,
    sellMode,
    selectBox,
    extras,
    nowMs,
    subTickAlpha = 0,
  } = options;

  const dimensions = renderDimensions(host);
  if (canvas.width !== dimensions.width || canvas.height !== dimensions.height) {
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
  }
  const tooltipCanvas = options.tooltipCanvas;
  if (tooltipCanvas && (tooltipCanvas.width !== dimensions.width || tooltipCanvas.height !== dimensions.height)) {
    tooltipCanvas.width = dimensions.width;
    tooltipCanvas.height = dimensions.height;
  }

  let worldCtx = options.worldCtx;
  if (!worldCtx || worldCtx.canvas !== canvas) {
    worldCtx = canvas.getContext("2d", { alpha: false });
  }
  if (!worldCtx) {
    return {
      worldCtx: null,
      tooltipCtx: options.tooltipCtx ?? null,
      miniCtx: options.miniCtx,
      secondaryMiniCtx: options.secondaryMiniCtx,
      fx: options.fx,
    };
  }

  let tooltipCtx: CanvasRenderingContext2D | null = worldCtx;
  if (tooltipCanvas) {
    const cachedTooltipCtx = options.tooltipCtx;
    tooltipCtx = cachedTooltipCtx?.canvas === tooltipCanvas
      ? cachedTooltipCtx
      : tooltipCanvas.getContext("2d");
    tooltipCtx?.clearRect(0, 0, tooltipCanvas.width, tooltipCanvas.height);
  }

  extras.cursor = cursor;
  extras.placeKind = placeKind;
  extras.repairMode = repairMode;
  extras.sellMode = sellMode;
  const now = nowMs ?? performance.now();
  extras.clockMs = now;
  extras.selectBox = selectBox ? selectionBoxScreen(selectBox, cam) : null;
  extras.subTickAlpha = subTickAlpha;
  const fx = cullFx(options.fx, now);
  extras.fx = fx;
  extras.colorblindMode = options.colorblindMode;

  const perfStarted = isPerfHudEnabled() ? performance.now() : 0;
  const worldTimings = renderWorld(worldCtx, state, cam, selected, hover, extras, tooltipCtx ?? worldCtx);
  let miniCtx = options.miniCtx;
  let secondaryMiniCtx = options.secondaryMiniCtx;
  let minimapMs = 0;
  if (options.miniCanvas) {
    if (!miniCtx || miniCtx.canvas !== options.miniCanvas) {
      miniCtx = options.miniCanvas.getContext("2d", { alpha: false });
    }
    if (miniCtx) {
      const miniStarted = worldTimings ? performance.now() : 0;
      renderMinimap(miniCtx, state, cameraViewQuad(minimapCam, canvas.width, canvas.height), selected, options.colorblindMode);
      if (worldTimings) minimapMs = performance.now() - miniStarted;
    }
  }
  if (options.secondaryMiniCanvas) {
    if (!secondaryMiniCtx || secondaryMiniCtx.canvas !== options.secondaryMiniCanvas) {
      secondaryMiniCtx = options.secondaryMiniCanvas.getContext("2d", { alpha: false });
    }
    if (secondaryMiniCtx) {
      const miniStarted = worldTimings ? performance.now() : 0;
      renderMinimap(secondaryMiniCtx, state, cameraViewQuad(minimapCam, canvas.width, canvas.height), selected, options.colorblindMode);
      if (worldTimings) minimapMs += performance.now() - miniStarted;
    }
  }
  if (worldTimings && isPerfHudEnabled()) {
    drawPerfHud(worldCtx, now, worldTimings, minimapMs);
  }
  if (perfStarted > 0) {
    canvas.dataset.perfFrameMs = (performance.now() - perfStarted).toFixed(2);
  }

  return { worldCtx, tooltipCtx, miniCtx, secondaryMiniCtx, fx };
}
