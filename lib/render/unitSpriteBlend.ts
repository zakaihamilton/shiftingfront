import type { SpriteSpec } from "../types";
import { drawSprite } from "./sprites";

export type UnitSpriteLayer = { spec: SpriteSpec; img: HTMLCanvasElement; weight: number };
const blendCanvases = new Map<string, HTMLCanvasElement>();
const compositeCache = new Map<string, HTMLCanvasElement>();
let imageIds = new WeakMap<HTMLCanvasElement, number>();
let nextImageId = 0;
export const MAX_UNIT_COMPOSITES = 128;

/** Mix poses before drawing onto terrain, preserving opacity where silhouettes overlap. */
export function drawBlendedUnitSprites(
  ctx: CanvasRenderingContext2D,
  layers: UnitSpriteLayer[],
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  alpha: number,
): void {
  if (!layers.length) return;
  const totalWeight = layers.reduce((total, layer) => total + layer.weight, 0);
  if (totalWeight <= 0) return;
  const originalAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  if (layers.length === 1 || typeof document === "undefined") {
    const layer = layers.length === 1 ? layers[0]! : layers.reduce((a, b) => a.weight >= b.weight ? a : b);
    drawSprite(ctx, layer.spec, layer.img, dx, dy, dw, dh);
  } else {
    const width = Math.max(1, Math.round(dw * 2));
    const height = Math.max(1, Math.round(dh * 2));
    const key = `${width}:${height}`;
    const compositionKey = `${key}:${layers.map(layer => {
      let id = imageIds.get(layer.img);
      if (id === undefined) { id = nextImageId++; imageIds.set(layer.img, id); }
      return `${id}:${(layer.weight / totalWeight).toFixed(4)}:${layer.spec.rotation ?? 0}`;
    }).join("|")}`;
    const cached = compositeCache.get(compositionKey);
    if (cached) {
      compositeCache.delete(compositionKey); compositeCache.set(compositionKey, cached);
      drawSprite(ctx, { ...layers[0]!.spec, rotation: undefined }, cached, dx, dy, dw, dh);
      ctx.globalAlpha = originalAlpha;
      return;
    }
    let blendCanvas = blendCanvases.get(key);
    if (!blendCanvas) {
      blendCanvas = document.createElement("canvas");
      blendCanvas.width = width; blendCanvas.height = height;
      if (blendCanvases.size >= 8) blendCanvases.delete(blendCanvases.keys().next().value!);
      blendCanvases.set(key, blendCanvas);
    }
    const blendCtx = blendCanvas.getContext("2d");
    if (blendCtx) {
      blendCtx.clearRect(0, 0, width, height);
      blendCtx.globalCompositeOperation = "lighter";
      for (const layer of layers) {
        blendCtx.globalAlpha = layer.weight / totalWeight;
        drawSprite(blendCtx, layer.spec, layer.img, 0, 0, width, height);
      }
      blendCtx.globalAlpha = 1;
      blendCtx.globalCompositeOperation = "source-over";
      const passSpec = layers[0]!.spec.rotation !== undefined
        ? { ...layers[0]!.spec, rotation: undefined }
        : layers[0]!.spec;
      drawSprite(ctx, passSpec, blendCanvas, dx, dy, dw, dh);
      const retained = document.createElement("canvas");
      retained.width = width; retained.height = height;
      const retainedCtx = retained.getContext("2d");
      if (retainedCtx) {
        retainedCtx.drawImage(blendCanvas, 0, 0);
        if (compositeCache.size >= MAX_UNIT_COMPOSITES) compositeCache.delete(compositeCache.keys().next().value!);
        compositeCache.set(compositionKey, retained);
      }
    } else {
      // Preserve a visible unit if the temporary canvas cannot be allocated.
      const layer = layers.reduce((a, b) => a.weight >= b.weight ? a : b);
      drawSprite(ctx, layer.spec, layer.img, dx, dy, dw, dh);
    }
  }
  ctx.globalAlpha = originalAlpha;
}

export function resetUnitSpriteBlend(): void {
  blendCanvases.clear();
  compositeCache.clear(); imageIds = new WeakMap(); nextImageId = 0;
}
