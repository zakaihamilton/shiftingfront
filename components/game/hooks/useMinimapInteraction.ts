import { useCallback, useRef, useState, type RefObject } from "react";
import {
  cameraPanBounds,
  clampCamera,
  minimapPoint,
  MINIMAP_DRAG_THRESHOLD,
  panCameraByMinimapDelta,
} from "@/lib/render/camera";
import { tileToScreen, TILE_H, type Camera } from "@/lib/iso";
import { heightAt } from "@/lib/sim/world";
import type { SimState } from "@/lib/types";

type MinimapDragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPointerX: number;
  startPointerY: number;
  startCameraX: number;
  startCameraY: number;
  dragging: boolean;
};

export function useMinimapInteraction({
  stateRef,
  canvasRef,
  camRef,
  cancelCameraFocus,
}: {
  stateRef: RefObject<SimState | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  camRef: RefObject<Camera>;
  cancelCameraFocus?: () => void;
}) {
  const minimapDrag = useRef<MinimapDragState | null>(null);
  const [isMinimapDragging, setIsMinimapDragging] = useState(false);

  const minimapPointFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const mini = e.currentTarget;
    const r = mini.getBoundingClientRect();
    return minimapPoint(
      (e.clientX - r.left) * (mini.width / Math.max(1, r.width)),
      (e.clientY - r.top) * (mini.height / Math.max(1, r.height)),
      mini.width,
      mini.height,
      stateRef.current?.width ?? 1,
      stateRef.current?.height ?? 1,
    );
  }, [stateRef]);

  const focusFromMinimap = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    cancelCameraFocus?.();
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!s || !canvas) return;
    const point = minimapPointFromEvent(e);
    const tx = Math.max(0, Math.min(s.width - 1, Math.floor(point.x)));
    const ty = Math.max(0, Math.min(s.height - 1, Math.floor(point.y)));
    const elev = heightAt(s, tx, ty);
    const anchor = tileToScreen(tx, ty, { x: 0, y: 0, zoom: camRef.current.zoom }, elev);
    camRef.current.x = canvas.width / 2 - anchor.x;
    camRef.current.y = canvas.height / 2 - anchor.y - (TILE_H * camRef.current.zoom) / 2;
    const bounds = cameraPanBounds(camRef.current, s.width, s.height, canvas.width, canvas.height);
    clampCamera(camRef.current, bounds);
  }, [cancelCameraFocus, canvasRef, camRef, minimapPointFromEvent, stateRef]);

  const onMinimapPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    cancelCameraFocus?.();
    const point = minimapPointFromEvent(e);
    minimapDrag.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPointerX: point.x,
      startPointerY: point.y,
      startCameraX: camRef.current.x,
      startCameraY: camRef.current.y,
      dragging: false,
    };
    setIsMinimapDragging(false);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [camRef, cancelCameraFocus, minimapPointFromEvent]);

  const onMinimapPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = minimapDrag.current;
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !s || !canvas) return;
    if (!drag.dragging) {
      const distance = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
      if (distance < MINIMAP_DRAG_THRESHOLD) return;
      drag.dragging = true;
      setIsMinimapDragging(true);
    }
    const point = minimapPointFromEvent(e);
    const bounds = cameraPanBounds(camRef.current, s.width, s.height, canvas.width, canvas.height);
    camRef.current.x = drag.startCameraX;
    camRef.current.y = drag.startCameraY;
    panCameraByMinimapDelta(
      camRef.current,
      point.x - drag.startPointerX,
      point.y - drag.startPointerY,
      bounds,
    );
  }, [camRef, canvasRef, minimapPointFromEvent, stateRef]);

  const onMinimapPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = minimapDrag.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (e.type !== "pointercancel" && !drag.dragging) focusFromMinimap(e);
    minimapDrag.current = null;
    setIsMinimapDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, [focusFromMinimap]);

  return {
    isMinimapDragging,
    onMinimapPointerDown,
    onMinimapPointerMove,
    onMinimapPointerUp,
  };
}
