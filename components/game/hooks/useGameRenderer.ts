import { useCallback, useRef, useSyncExternalStore, type MutableRefObject, type RefObject } from "react";
import type { Camera } from "@/lib/iso";
import type { FxBurst } from "@/lib/render/fx";
import type { RenderExtras } from "@/lib/render/renderer";
import type { CommandMarker } from "@/lib/render/renderOverlays/types";
import type { BuildingKind, SimState } from "@/lib/types";
import { renderGameFrame } from "../renderFrame";
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
  const miniCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const mobileMiniCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const fxRef = useRef<FxBurst[]>([]);
  const fxSeq = useRef(1);

  const redraw = useCallback((nowMs?: number, subTickAlpha = 0) => {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!s || !canvas || !host) return;
    extrasRef.current.commandMarker = commandMarkerRef?.current ?? null;
    extrasRef.current.reducedMotion = reducedMotion;
    const frame = renderGameFrame({
      state: s,
      canvas,
      host,
      worldCtx: worldCtxRef.current,
      miniCanvas: miniRef.current,
      miniCtx: miniCtxRef.current,
      secondaryMiniCanvas: mobileMiniRef.current,
      secondaryMiniCtx: mobileMiniCtxRef.current,
      cam: camRef.current,
      selected: selected.current,
      hover: hoverRef.current,
      cursor: cursorRef.current,
      placeKind: place.current,
      repairMode: repair.current,
      sellMode: sell.current,
      selectBox: boxRef.current,
      extras: extrasRef.current,
      fx: fxRef.current,
      nowMs,
      subTickAlpha,
      colorblindMode,
    });
    worldCtxRef.current = frame.worldCtx;
    miniCtxRef.current = frame.miniCtx;
    mobileMiniCtxRef.current = frame.secondaryMiniCtx;
    fxRef.current = frame.fx;
  }, [boxRef, camRef, canvasRef, colorblindMode, commandMarkerRef, cursorRef, hostRef, hoverRef, miniRef, mobileMiniRef, place, reducedMotion, repair, selected, sell, stateRef]);

  return { extrasRef, fxRef, fxSeq, redraw };
}

export type GameRenderer = ReturnType<typeof useGameRenderer>;
