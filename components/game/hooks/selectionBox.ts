import type { Camera } from "@/lib/iso";

type Point = { x: number; y: number };

/**
 * Marquee boxes keep their anchor in camera-independent projected
 * coordinates so the selection stays on the same ground while the camera pans.
 */
export type SelectionBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  anchor?: Point;
};

export function selectionProjectionPoint(point: Point, cam: Camera): Point {
  return {
    x: (point.x - cam.x) / cam.zoom,
    y: (point.y - cam.y) / cam.zoom,
  };
}

export function selectionBoxScreen(box: SelectionBox, cam: Camera): SelectionBox {
  const start = box.anchor
    ? { x: box.anchor.x * cam.zoom + cam.x, y: box.anchor.y * cam.zoom + cam.y }
    : { x: box.x0, y: box.y0 };
  return { x0: start.x, y0: start.y, x1: box.x1, y1: box.y1 };
}

export function selectionBoxProjection(box: SelectionBox, cam: Camera): SelectionBox {
  const start = box.anchor ?? selectionProjectionPoint({ x: box.x0, y: box.y0 }, cam);
  const end = selectionProjectionPoint({ x: box.x1, y: box.y1 }, cam);
  return { x0: start.x, y0: start.y, x1: end.x, y1: end.y };
}

export function selectionBoxDistance(box: SelectionBox, cam: Camera): number {
  const screen = selectionBoxScreen(box, cam);
  return Math.hypot(screen.x1 - screen.x0, screen.y1 - screen.y0);
}
