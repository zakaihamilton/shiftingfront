import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { cameraPanBounds, panAvailability, panCamera, type PanAvailability } from "@/lib/render/camera";
import type { Camera } from "@/lib/iso";
import type { BuildingKind, SimState } from "@/lib/types";
import { battlefieldCursor } from "@/lib/ui/battlefieldCursor";
import { entityAt } from "./gameInputOrders";

const WHEEL_LINE_SIZE_PX = 16;

function wheelDeltaInPixels(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === 1) return delta * WHEEL_LINE_SIZE_PX;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
}

/** Cursor styling and trackpad/mouse-wheel camera movement for the game canvas. */
export function useGameInputCursor(options: {
  stateRef: MutableRefObject<SimState>;
  camRef: MutableRefObject<Camera>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  hoverRef: MutableRefObject<{ x: number; y: number } | null>;
  selectedRef: MutableRefObject<Set<number>>;
  selectedIds?: readonly number[];
  cancelCameraFocus: () => void;
  placeRef: MutableRefObject<BuildingKind | null>;
  placeKind?: BuildingKind | null;
  repairRef: MutableRefObject<boolean>;
  repairMode?: boolean;
  sellRef: MutableRefObject<boolean>;
  sellMode?: boolean;
  pausedRef: MutableRefObject<boolean>;
  panAvailRef: MutableRefObject<PanAvailability>;
  setPanAvailability: (availability: PanAvailability) => void;
}) {
  const {
    stateRef, camRef, canvasRef, hoverRef, selectedRef, placeRef, repairRef, sellRef,
    cancelCameraFocus, pausedRef, panAvailRef, setPanAvailability,
  } = options;
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  const syncCursor = useCallback((canvas?: HTMLCanvasElement | null) => {
    if (canvas) canvasElRef.current = canvas;
    const target = canvasElRef.current;
    if (!target?.style) return;
    const state = stateRef.current;
    if (!state) {
      target.style.cursor = "";
      return;
    }
    const tile = hoverRef.current;
    target.style.cursor = battlefieldCursor({
      state,
      hoverTile: tile,
      hoverEntity: tile ? entityAt(state, tile.x, tile.y) : undefined,
      selectedIds: [...selectedRef.current],
      placeKind: placeRef.current,
      repairMode: repairRef.current,
      sellMode: sellRef.current,
    });
  }, [hoverRef, placeRef, repairRef, selectedRef, sellRef, stateRef]);

  useLayoutEffect(() => {
    syncCursor();
  }, [options.placeKind, options.repairMode, options.sellMode, options.selectedIds, syncCursor]);

  const onWheel = useCallback((event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();

    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || pausedRef.current || state.result !== "playing") return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const deltaX = wheelDeltaInPixels(event.deltaX, event.deltaMode, rect.width) * canvas.width / rect.width;
    const deltaY = wheelDeltaInPixels(event.deltaY, event.deltaMode, rect.height) * canvas.height / rect.height;
    if (deltaX === 0 && deltaY === 0) return;

    cancelCameraFocus();
    const bounds = cameraPanBounds(camRef.current, state.width, state.height, canvas.width, canvas.height);
    panCamera(camRef.current, -deltaX, -deltaY, bounds);
    const nextAvailability = panAvailability(camRef.current, bounds);
    panAvailRef.current = nextAvailability;
    setPanAvailability(nextAvailability);
  }, [camRef, cancelCameraFocus, canvasRef, panAvailRef, pausedRef, setPanAvailability, stateRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [canvasRef, onWheel]);

  return { canvasElRef, syncCursor };
}
