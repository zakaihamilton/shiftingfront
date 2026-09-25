import { useCallback, useMemo, useRef, type MutableRefObject, type PointerEvent } from "react";
import { cameraPanBounds, panCamera } from "@/lib/render/camera";
import type { Camera } from "@/lib/iso";
import type { SimState } from "@/lib/types";
import type { SelectionBox } from "./selectionBox";
import { triggerHaptic } from "@/lib/ui/haptics";

export function useTouchGestures({
  camRef,
  stateRef,
  selectionModeRef,
  boxRef,
  issueContextOrder,
  setSelectionMode,
}: {
  camRef: MutableRefObject<Camera>;
  stateRef: MutableRefObject<SimState>;
  selectionModeRef: MutableRefObject<boolean>;
  boxRef: MutableRefObject<SelectionBox | null>;
  issueContextOrder: (s: SimState, p: { x: number; y: number }, attackMove?: boolean) => void;
  setSelectionMode?: (active: boolean) => void;
}) {
  const touchPoints = useRef(new Map<number, { x: number; y: number }>());
  const touchSelection = useRef(false);
  const touchMultiTouch = useRef(false);
  const touchPan = useRef<{ pointerId: number; start: { x: number; y: number }; last: { x: number; y: number }; moved: boolean } | null>(null);
  const longPress = useRef<{ pointerId: number; timer: number; x: number; y: number; fired: boolean } | null>(null);

  const beginTouch = useCallback((e: PointerEvent<HTMLCanvasElement>, p: { x: number; y: number }) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointer events used by accessibility and browser tests do not have capture targets.
    }
    touchPoints.current.set(e.pointerId, p);
    if (touchPoints.current.size >= 2) {
      const points = [...touchPoints.current.values()];
      touchMultiTouch.current = true;
      touchSelection.current = true;
      selectionModeRef.current = true;
      setSelectionMode?.(true);
      triggerHaptic("selection");
      touchPan.current = null;
      boxRef.current = {
        x0: points[0]!.x,
        y0: points[0]!.y,
        x1: points[1]!.x,
        y1: points[1]!.y,
      };
      if (longPress.current) window.clearTimeout(longPress.current.timer);
      longPress.current = null;
      return;
    }
    touchPan.current = { pointerId: e.pointerId, start: p, last: p, moved: false };
    if (selectionModeRef.current) {
      boxRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      return;
    }
    const timer = window.setTimeout(() => {
      const held = longPress.current;
      if (held && held.pointerId === e.pointerId && !held.fired && !touchSelection.current && !selectionModeRef.current) {
        held.fired = true;
        triggerHaptic("order");
        issueContextOrder(stateRef.current, { x: held.x, y: held.y }, true);
      }
    }, 480);
    longPress.current = { pointerId: e.pointerId, timer, x: p.x, y: p.y, fired: false };
  }, [boxRef, issueContextOrder, selectionModeRef, setSelectionMode, stateRef]);

  const moveTouch = useCallback((e: PointerEvent<HTMLCanvasElement>, p: { x: number; y: number }): boolean => {
    const s = stateRef.current;
    const bounds = s
      ? cameraPanBounds(camRef.current, s.width, s.height, e.currentTarget.width, e.currentTarget.height)
      : undefined;
    touchPoints.current.set(e.pointerId, p);
    if (touchPoints.current.size >= 2) {
      const points = [...touchPoints.current.values()];
      if (touchSelection.current && boxRef.current) {
        boxRef.current.x0 = points[0]!.x;
        boxRef.current.y0 = points[0]!.y;
        boxRef.current.x1 = points[1]!.x;
        boxRef.current.y1 = points[1]!.y;
      }
      return true;
    }
    const held = longPress.current;
    if (held && Math.hypot(p.x - held.x, p.y - held.y) > 12) {
      held.fired = true;
      window.clearTimeout(held.timer);
    }
    if (selectionModeRef.current) {
      if (boxRef.current) {
        boxRef.current.x1 = p.x;
        boxRef.current.y1 = p.y;
      }
      return false;
    }
    const pan = touchPan.current;
    if (pan && pan.pointerId === e.pointerId) {
      const distance = Math.hypot(p.x - pan.start.x, p.y - pan.start.y);
      if (distance > 10) pan.moved = true;
      if (pan.moved) {
        panCamera(camRef.current, p.x - pan.last.x, p.y - pan.last.y, bounds);
        pan.last = p;
      }
    }
    return false;
  }, [boxRef, camRef, selectionModeRef, stateRef]);

  const endTouch = useCallback((e: PointerEvent<HTMLCanvasElement>, p?: { x: number; y: number }): boolean => {
    if (p) touchPoints.current.set(e.pointerId, p);
    if (touchSelection.current && boxRef.current) {
      const points = [...touchPoints.current.values()];
      if (points.length >= 2) {
        boxRef.current.x0 = points[0]!.x;
        boxRef.current.y0 = points[0]!.y;
        boxRef.current.x1 = points[1]!.x;
        boxRef.current.y1 = points[1]!.y;
      }
    }
    const held = longPress.current;
    touchPoints.current.delete(e.pointerId);
    if (held?.pointerId === e.pointerId) {
      window.clearTimeout(held.timer);
      longPress.current = null;
    }
    if (touchPoints.current.size > 0) return true;
    const wasSelection = touchSelection.current;
    const wasGesture = touchMultiTouch.current || !!touchPan.current?.moved;
    touchSelection.current = false;
    touchMultiTouch.current = false;
    touchPan.current = null;
    // Leave the final two-finger pointer-up for the normal input resolver so
    // the marquee is committed as a unit selection.
    return wasSelection ? false : Boolean(held?.fired || wasGesture);
  }, [boxRef]);

  const cancelTouch = useCallback(() => {
    if (longPress.current) window.clearTimeout(longPress.current.timer);
    longPress.current = null;
    touchPoints.current.clear();
    touchSelection.current = false;
    touchMultiTouch.current = false;
    touchPan.current = null;
  }, []);

  return useMemo(
    () => ({ beginTouch, moveTouch, endTouch, cancelTouch }),
    [beginTouch, moveTouch, endTouch, cancelTouch],
  );
}
