import type { SpriteSpec } from "../types";
import { drawSprite } from "./sprites";

export type UnitSpriteLayer = { spec: SpriteSpec; img: HTMLCanvasElement; weight: number };
let blendCanvas: HTMLCanvasElement | undefined;

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
  if (layers.length === 1) {
    drawSprite(ctx, layers[0]!.spec, layers[0]!.img, dx, dy, dw, dh);
  } else {
    blendCanvas ??= document.createElement("canvas");
    const width = Math.max(1, dw * 2);
    const height = Math.max(1, dh * 2);
    if (blendCanvas.width !== width) blendCanvas.width = width;
    if (blendCanvas.height !== height) blendCanvas.height = height;
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
      drawSprite(ctx, layers[0]!.spec, blendCanvas, dx, dy, dw, dh);
    } else {
      // Preserve a visible unit if the temporary canvas cannot be allocated.
      const layer = layers.reduce((a, b) => a.weight >= b.weight ? a : b);
      drawSprite(ctx, layer.spec, layer.img, dx, dy, dw, dh);
    }
  }
  ctx.globalAlpha = originalAlpha;
}

export function resetUnitSpriteBlend(): void {
  blendCanvas = undefined;
}
