import { type Camera, TILE_W } from "../iso";

export type ScrollLayer = {
  key: string;
  originX: number;
  originY: number;
  pad: number;
};

export const CINEMA_SCROLL_PAD = 160;

export function terrainScrollPad(zoom: number): number {
  return Math.max(96, Math.ceil(TILE_W * Math.max(0.25, zoom) * 4));
}

export function scrollLayerNeedsRebuild(
  layer: ScrollLayer,
  contentKey: string,
  camX: number,
  camY: number,
): boolean {
  if (!layer.key || layer.key !== contentKey) return true;
  const limit = layer.pad * 0.5;
  return Math.abs(camX - layer.originX) > limit || Math.abs(camY - layer.originY) > limit;
}

export function scrollLayerBlitOffset(
  layer: Pick<ScrollLayer, "originX" | "originY" | "pad">,
  camX: number,
  camY: number,
): { x: number; y: number } {
  return {
    x: camX - layer.originX - layer.pad,
    y: camY - layer.originY - layer.pad,
  };
}

export function scrollLayerPaintCamera(cam: Camera, pad: number): Camera {
  return { x: cam.x + pad, y: cam.y + pad, zoom: cam.zoom };
}

export function emptyScrollLayer(): ScrollLayer {
  return { key: "", originX: 0, originY: 0, pad: 0 };
}
