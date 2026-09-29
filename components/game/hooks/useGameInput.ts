import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type PointerEvent, type RefObject } from "react";
import { pickTile } from "@/lib/render/renderer";
import type { CommandMarker } from "@/lib/render/renderOverlays";
import { cameraPanBounds, panAvailability, panCamera, panDirFromPointer, EDGE_PAN_BAND, type PanAvailability, type PanDir } from "@/lib/render/camera";
import { type Camera } from "@/lib/iso";
import type { BuildingKind, Command, SimState } from "@/lib/types";
import type { MobileCommand } from "../mobileCommandTypes";
import { canvasPointerPos } from "./canvasPointer";
import { entityAt, pickSelectableEntity, pointerTile } from "./gameInputOrders";
import { battlefieldCursor } from "@/lib/ui/battlefieldCursor";
import { resolvePointerUp, isSameKindDoubleClick, isSameProducerDoubleClick, type LastProducerClick, type LastUnitClick } from "./gamePointerUp";
import { selectionBoxDistance, selectionProjectionPoint, type SelectionBox } from "./selectionBox";
import { useTouchGestures } from "./useTouchGestures";
import { useOrderDispatch } from "./useOrderDispatch";
import { usePointerUpHandler } from "./usePointerUpHandler";
import { createRuntimeCommandPort, type RuntimeCommandPort } from "./runtime/facade";
import type { CommandNoticeKind } from "./useGameChrome";
import type { MissionUxTelemetry } from "@/lib/persist/telemetry";
import { activeProducerFor, isSharedProducerKind } from "@/lib/sim/producerState";

const WHEEL_LINE_SIZE_PX = 16;

function wheelDeltaInPixels(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === 1) return delta * WHEEL_LINE_SIZE_PX;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
}

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
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const lastUnitClickRef = useRef<LastUnitClick | null>(null);
  const lastProducerClickRef = useRef<LastProducerClick | null>(null);

  const syncCursor = useCallback((canvas?: HTMLCanvasElement | null) => {
    if (canvas) canvasElRef.current = canvas;
    const target = canvasElRef.current;
    if (!target?.style) return;
    const s = stateRef.current;
    if (!s) {
      target.style.cursor = "";
      return;
    }
    const tile = hoverRef.current;
    target.style.cursor = battlefieldCursor({
      state: s,
      hoverTile: tile,
      hoverEntity: tile ? entityAt(s, tile.x, tile.y) : undefined,
      selectedIds: [...selectedRef.current],
      placeKind: placeRef.current,
      repairMode: repairRef.current,
      sellMode: sellRef.current,
    });
  }, [placeRef, repairRef, selectedRef, sellRef, stateRef]);

  useLayoutEffect(() => {
    syncCursor();
  }, [placeKind, repairMode, sellMode, selectedIds, syncCursor]);

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
  }, [beginTouch, camRef]);

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
  }, [hoverAtPointer]);

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

  const onUp = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    applyEdgePan(null);
    if (e.pointerType !== "touch") {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Synthetic pointer events used by accessibility and browser tests may not support capture.
      }
    }
    const p = canvasPointerPos(e);
    const s = stateRef.current;
    if (!s) return;
    if (e.pointerType === "touch" && endTouch(e, p)) return;
    const cam = camRef.current;
    const drag = Boolean(boxRef.current && selectionBoxDistance(boxRef.current, cam) > 8);
    const nowMs = performance.now();
    const { x: tx, y: ty } = pointerTile(s, p, cam);
    const hoverHit = !drag && (e.button === 0 || e.pointerType === "touch")
      ? pickSelectableEntity(s, p.x, p.y, tx, ty, cam)
      : undefined;
    const doubleClick = Boolean(
      hoverHit &&
        hoverHit.class === "unit" &&
        isSameKindDoubleClick(lastUnitClickRef.current, {
          atMs: nowMs,
          kind: hoverHit.kind,
          x: p.x,
          y: p.y,
        }),
    );
    const owner = s.viewOwner ?? 0;
    const producerHit = hoverHit?.class === "building" &&
      isSharedProducerKind(hoverHit.kind) &&
      hoverHit.owner === owner &&
      hoverHit.constructing <= 0 &&
      !placeRef.current && !repairRef.current && !sellRef.current && !mobileCommandRef.current &&
      (e.button === 0 || e.pointerType === "touch")
      ? (hoverHit as import("@/lib/types").BuildingEntity & { kind: import("@/lib/types").SharedProducerKind })
      : undefined;
    const activatesProducer = Boolean(
      producerHit &&
      isSameProducerDoubleClick(lastProducerClickRef.current, {
        atMs: nowMs,
        buildingId: producerHit.id,
        x: p.x,
        y: p.y,
      }) &&
      activeProducerFor(s, owner, producerHit.kind)?.id !== producerHit.id,
    );
    const effect = resolvePointerUp({
      pointerType: e.pointerType,
      button: e.button,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      p,
      state: s,
      cam,
      selectedIds: [...selectedRef.current],
      box: boxRef.current,
      selectionMode: selectionModeRef.current,
      mobileCommand: mobileCommandRef.current,
      placeKind: placeRef.current,
      repairMode: repairRef.current,
      sellMode: sellRef.current,
      doubleClick,
      viewport: { width: e.currentTarget.width, height: e.currentTarget.height },
    });
    const rememberUnitClick = () => {
      if (
        !drag &&
        hoverHit &&
        hoverHit.class === "unit" &&
        effect.select?.includes(hoverHit.id)
      ) {
        lastUnitClickRef.current = { atMs: nowMs, kind: hoverHit.kind, x: p.x, y: p.y };
      } else {
        lastUnitClickRef.current = null;
      }
    };
    if (effect.contextOrder) {
      lastUnitClickRef.current = null;
      lastProducerClickRef.current = null;
      if (effect.preventDefault) e.preventDefault();
      issueContextOrder(s, p, effect.attackMove);
      return;
    }
    applyPointerUp(effect, e);
    if (activatesProducer && producerHit && !effect.commands?.length) {
      resolvedCommandPort.enqueue({ type: "activateProducer", buildingId: producerHit.id });
      lastProducerClickRef.current = null;
    } else if (producerHit && !effect.commands?.length && effect.select?.includes(producerHit.id)) {
      lastProducerClickRef.current = { atMs: nowMs, buildingId: producerHit.id, x: p.x, y: p.y };
    } else {
      lastProducerClickRef.current = null;
    }
    rememberUnitClick();
  }, [applyEdgePan, applyPointerUp, camRef, endTouch, issueContextOrder, mobileCommandRef, placeRef, repairRef, resolvedCommandPort, selectedRef, selectionModeRef, sellRef, stateRef]);

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
    lastUnitClickRef.current = null;
    mobileCommandRef.current = null;
    setMobileCommandState(null);
    clearTools();
    setSelectionMode(false);
    applyEdgePan(null);
    if (e.currentTarget.style) e.currentTarget.style.cursor = "";
  }, [applyEdgePan, cancelTouch, clearTools, mobileCommandRef, setMobileCommandState, setSelectionMode]);

  const resetInput = useCallback(() => {
    cancelTouch();
    hoverRef.current = null;
    cursorRef.current = null;
    boxRef.current = null;
    commandMarkerRef.current = null;
    lastUnitClickRef.current = null;
  }, [cancelTouch]);

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
