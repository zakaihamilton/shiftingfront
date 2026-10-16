import { useCallback, useMemo, useRef, type MutableRefObject, type PointerEvent, type RefObject } from "react";
import { pickTile } from "@/lib/render/renderer";
import type { CommandMarker } from "@/lib/render/renderOverlays";
import { panDirFromPointer, EDGE_PAN_BAND, type PanAvailability, type PanDir } from "@/lib/render/camera";
import { type Camera } from "@/lib/iso";
import type { BuildingKind, Command, SimState } from "@/lib/types";
import type { MobileCommand } from "../mobileCommandTypes";
import { canvasPointerPos } from "./canvasPointer";
import { selectionProjectionPoint, type SelectionBox } from "./selectionBox";
import { useTouchGestures } from "./useTouchGestures";
import { useOrderDispatch } from "./useOrderDispatch";
import { usePointerUpHandler } from "./usePointerUpHandler";
import { useGameInputCursor } from "./useGameInputCursor";
import { useGameInputPointerUp } from "./useGameInputPointerUp";
import { createRuntimeCommandPort, type RuntimeCommandPort } from "./runtime/facade";
import type { CommandNoticeKind } from "./useGameChrome";
import type { MissionUxTelemetry } from "@/lib/persist/telemetry";

export function useGameInput({
  stateRef,
  camRef,
  canvasRef,
  cancelCameraFocus,
  selectedRef,
  selectedIds,
  commitSelection,
  commandPort,
  cmdQRef,
  placeRef,
  placeKind,
  setPlaceKind,
  repairRef,
  repairMode,
  setRepairMode,
  sellRef,
  sellMode,
  setSellMode,
  clearTools,
  mobileCommandRef,
  setMobileCommandState,
  pausedRef,
  panAvailRef,
  setPanAvailability,
  applyEdgePan,
  selectionModeRef,
  setSelectionMode,
  onCommandNotice,
  onCommandRejection,
  uxRef,
}: {
  stateRef: MutableRefObject<SimState>;
  camRef: MutableRefObject<Camera>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cancelCameraFocus: () => void;
  selectedRef: MutableRefObject<Set<number>>;
  selectedIds?: readonly number[];
  commitSelection: (ids: number[]) => void;
  commandPort?: RuntimeCommandPort;
  /** Compatibility input for isolated hook consumers. */
  cmdQRef?: MutableRefObject<Command[]>;
  placeRef: MutableRefObject<BuildingKind | null>;
  placeKind?: BuildingKind | null;
  setPlaceKind: (v: BuildingKind | null) => void;
  repairRef: MutableRefObject<boolean>;
  repairMode?: boolean;
  setRepairMode: (v: boolean) => void;
  sellRef: MutableRefObject<boolean>;
  sellMode?: boolean;
  setSellMode: (v: boolean) => void;
  clearTools: () => void;
  mobileCommandRef: MutableRefObject<MobileCommand | null>;
  setMobileCommandState: (v: MobileCommand | null) => void;
  pausedRef: MutableRefObject<boolean>;
  panAvailRef: MutableRefObject<PanAvailability>;
  setPanAvailability: (availability: PanAvailability) => void;
  applyEdgePan: (dir: PanDir | null) => void;
  selectionModeRef: MutableRefObject<boolean>;
  setSelectionMode: (active: boolean) => void;
  onCommandNotice?: (text: string, kind?: CommandNoticeKind) => void;
  onCommandRejection?: (reason: string) => void;
  uxRef?: MutableRefObject<MissionUxTelemetry>;
}) {
  const resolvedCommandPort = useMemo(() => {
    if (commandPort) return commandPort;
    if (!cmdQRef) throw new Error("useGameInput requires a runtime command port");
    return createRuntimeCommandPort(cmdQRef);
  }, [cmdQRef, commandPort]);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const boxRef = useRef<SelectionBox | null>(null);
  const commandMarkerRef = useRef<CommandMarker | null>(null);
  const { canvasElRef, syncCursor } = useGameInputCursor({
    stateRef,
    camRef,
    canvasRef,
    hoverRef,
    selectedRef,
    selectedIds,
    cancelCameraFocus,
    placeRef,
    placeKind,
    repairRef,
    repairMode,
    sellRef,
    sellMode,
    pausedRef,
    panAvailRef,
    setPanAvailability,
  });

  const { markUnitCommand, markInvalidCommand, issueContextOrder } = useOrderDispatch({
    camRef,
    selectedRef,
    commandPort: resolvedCommandPort,
    repairRef,
    sellRef,
    clearTools,
    mobileCommandRef,
    setMobileCommandState,
    commandMarkerRef,
    onCommandNotice,
    onCommandRejection,
    uxRef,
    syncCursor,
  });

  const { beginTouch, moveTouch, endTouch, cancelTouch } = useTouchGestures({
    camRef,
    stateRef,
    selectionModeRef,
    boxRef,
    issueContextOrder,
    setSelectionMode,
  });

  const { applyPointerUp } = usePointerUpHandler({
    stateRef,
    commandPort: resolvedCommandPort,
    boxRef,
    commitSelection,
    setSelectionMode,
    mobileCommandRef,
    setMobileCommandState,
    placeRef,
    setPlaceKind,
    repairRef,
    setRepairMode,
    sellRef,
    setSellMode,
    markUnitCommand,
    markInvalidCommand,
    syncCursor,
    onCommandNotice,
    onCommandRejection,
    uxRef,
  });

  const { onPointerUp: onUp, resetUnitClick } = useGameInputPointerUp({
    stateRef,
    camRef,
    selectedRef,
    boxRef,
    selectionModeRef,
    mobileCommandRef,
    placeRef,
    repairRef,
    sellRef,
    commandPort: resolvedCommandPort,
    applyEdgePan,
    endTouch,
    issueContextOrder,
    applyPointerUp,
  });

  const onDown = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    canvasElRef.current = e.currentTarget;
    const p = canvasPointerPos(e);
    if (e.pointerType === "touch") {
      beginTouch(e, p);
      return;
    }
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointer events used by accessibility and browser tests may not support capture.
    }
    boxRef.current = {
      x0: p.x,
      y0: p.y,
      x1: p.x,
      y1: p.y,
      anchor: selectionProjectionPoint(p, camRef.current),
    };
  }, [beginTouch, camRef, canvasElRef]);

  const hoverAtPointer = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    const p = canvasPointerPos(e);
    const s = stateRef.current;
    cursorRef.current = p;
    if (s) hoverRef.current = pickTile(s, p.x, p.y, camRef.current);
    syncCursor(e.currentTarget);
    return p;
  }, [camRef, stateRef, syncCursor]);

  const onEnter = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    canvasElRef.current = e.currentTarget;
    hoverAtPointer(e);
  }, [canvasElRef, hoverAtPointer]);

  const onMove = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    if (e.type === "pointerenter") {
      hoverAtPointer(e);
      return;
    }
    const p = canvasPointerPos(e);
    const s = stateRef.current;
    if (e.pointerType === "touch" && moveTouch(e, p)) return;
    cursorRef.current = p;
    if (s) hoverRef.current = pickTile(s, p.x, p.y, camRef.current);
    syncCursor(e.currentTarget);
    if (e.pointerType !== "touch" && boxRef.current && e.buttons === 1) {
      boxRef.current.x1 = p.x;
      boxRef.current.y1 = p.y;
    }
    const r = e.currentTarget.getBoundingClientRect();
    applyEdgePan(
      e.pointerType === "touch" || pausedRef.current
        ? null
        : panDirFromPointer(e.clientX - r.left, e.clientY - r.top, r.width, r.height, EDGE_PAN_BAND, panAvailRef.current),
    );
  }, [applyEdgePan, camRef, hoverAtPointer, moveTouch, panAvailRef, pausedRef, stateRef, syncCursor]);

  const onLeave = useCallback((e?: PointerEvent<HTMLCanvasElement>) => {
    cursorRef.current = null;
    hoverRef.current = null;
    if (e?.currentTarget.style) e.currentTarget.style.cursor = "";
    applyEdgePan(null);
  }, [applyEdgePan]);

  const onCancel = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Synthetic pointer events used by accessibility and browser tests may not support capture.
    }
    cancelTouch();
    boxRef.current = null;
    hoverRef.current = null;
    cursorRef.current = null;
    commandMarkerRef.current = null;
    resetUnitClick();
    mobileCommandRef.current = null;
    setMobileCommandState(null);
    clearTools();
    setSelectionMode(false);
    applyEdgePan(null);
    if (e.currentTarget.style) e.currentTarget.style.cursor = "";
  }, [applyEdgePan, cancelTouch, clearTools, mobileCommandRef, resetUnitClick, setMobileCommandState, setSelectionMode]);

  const resetInput = useCallback(() => {
    cancelTouch();
    hoverRef.current = null;
    cursorRef.current = null;
    boxRef.current = null;
    commandMarkerRef.current = null;
    resetUnitClick();
  }, [cancelTouch, resetUnitClick]);

  return {
    hoverRef,
    cursorRef,
    boxRef,
    commandMarkerRef,
    resetInput,
    onDown,
    onEnter,
    onMove,
    onLeave,
    onUp,
    onCancel,
  };
}
