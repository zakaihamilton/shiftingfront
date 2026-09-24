import { useCallback, useRef, useSyncExternalStore, type MutableRefObject, type RefObject } from "react";
import type { Camera } from "@/lib/iso";
import type { FxBurst } from "@/lib/render/fx";
import type { RenderExtras } from "@/lib/render/renderer";
import type { CommandMarker } from "@/lib/render/renderOverlays/types";
import type { BuildingKind, SimState } from "@/lib/types";
import { renderGameFrame } from "../renderFrame";
import { createScreenShakeState, updateScreenShake, type ScreenShakeState } from "@/lib/render/screenShake";
import type { SelectionBox } from "./selectionBox";

type Point = { x: number; y: number };

const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia?.(REDUCE_MOTION_QUERY);
  if (!media) return () => {};
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function reducedMotionSnapshot() {
  return window.matchMedia?.(REDUCE_MOTION_QUERY)?.matches ?? false;
}

export function useGameRenderer({
  stateRef,
  hostRef,
  canvasRef,
  tooltipCanvasRef,
  miniRef,
  mobileMiniRef,
  camRef,
  selected,
  hoverRef,
  cursorRef,
  boxRef,
  commandMarkerRef,
  place,
  repair,
  sell,
  reducedMotionOverride = false,
  colorblindMode,
}: {
  stateRef: RefObject<SimState | null>;
  hostRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  tooltipCanvasRef: RefObject<HTMLCanvasElement | null>;
  miniRef: RefObject<HTMLCanvasElement | null>;
  mobileMiniRef: RefObject<HTMLCanvasElement | null>;
  camRef: MutableRefObject<Camera>;
  selected: MutableRefObject<Set<number>>;
  hoverRef: MutableRefObject<Point | null>;
  cursorRef: MutableRefObject<Point | null>;
  boxRef: MutableRefObject<SelectionBox | null>;
  commandMarkerRef?: MutableRefObject<CommandMarker | null>;
  place: MutableRefObject<BuildingKind | null>;
  repair: MutableRefObject<boolean>;
  sell: MutableRefObject<boolean>;
  reducedMotionOverride?: boolean;
  colorblindMode?: import("@/lib/persist/settings").ColorblindMode;
}) {
  const systemReducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
  const reducedMotion = systemReducedMotion || reducedMotionOverride;
  const extrasRef = useRef<RenderExtras>({
    cursor: null,
    placeKind: null,
    repairMode: false,
    sellMode: false,
  });
  const worldCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const tooltipCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const miniCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const mobileMiniCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const fxRef = useRef<FxBurst[]>([]);
  const fxSeq = useRef(1);
  const screenShakeRef = useRef<ScreenShakeState>(createScreenShakeState());

  const redraw = useCallback((nowMs?: number, subTickAlpha = 0) => {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!s || !canvas || !host) return;
    extrasRef.current.commandMarker = commandMarkerRef?.current ?? null;
    extrasRef.current.reducedMotion = reducedMotion;

    const currentNow = nowMs ?? performance.now();
    const shake = updateScreenShake(screenShakeRef.current, currentNow, reducedMotion);
    const renderCam = (shake.offsetX !== 0 || shake.offsetY !== 0)
      ? { ...camRef.current, x: camRef.current.x + shake.offsetX, y: camRef.current.y + shake.offsetY }
      : camRef.current;

    const frame = renderGameFrame({
      state: s,
      canvas,
      tooltipCanvas: tooltipCanvasRef.current,
      host,
      worldCtx: worldCtxRef.current,
      tooltipCtx: tooltipCtxRef.current,
      miniCanvas: miniRef.current,
      miniCtx: miniCtxRef.current,
      secondaryMiniCanvas: mobileMiniRef.current,
      secondaryMiniCtx: mobileMiniCtxRef.current,
      cam: renderCam,
      minimapCam: camRef.current,
      selected: selected.current,
      hover: hoverRef.current,
      cursor: cursorRef.current,
      placeKind: place.current,
      repairMode: repair.current,
      sellMode: sell.current,
      selectBox: boxRef.current,
      extras: extrasRef.current,
      fx: fxRef.current,
      nowMs: currentNow,
      subTickAlpha,
      colorblindMode,
    });
    worldCtxRef.current = frame.worldCtx;
    tooltipCtxRef.current = frame.tooltipCtx;
    miniCtxRef.current = frame.miniCtx;
    mobileMiniCtxRef.current = frame.secondaryMiniCtx;
    fxRef.current = frame.fx;
  }, [boxRef, camRef, canvasRef, colorblindMode, commandMarkerRef, cursorRef, hostRef, hoverRef, miniRef, mobileMiniRef, place, reducedMotion, repair, selected, sell, stateRef, tooltipCanvasRef]);

  return { extrasRef, fxRef, fxSeq, screenShakeRef, redraw };
}

export type GameRenderer = ReturnType<typeof useGameRenderer>;
