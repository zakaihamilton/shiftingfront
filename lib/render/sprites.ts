import { rotatedSpriteBounds, type SpriteBounds } from "../gen/spriteBounds";
import type { ShapeSpec, SpriteSpec } from "../types";
import { paintSvg } from "./svgPaint";

export { rotatedSpriteBounds, type SpriteBounds };

export function paintShapes(ctx: CanvasRenderingContext2D, shapes: ShapeSpec[]): void {
  for (const s of shapes) {
    ctx.save();
    if (s.alpha !== undefined) ctx.globalAlpha = s.alpha;
    ctx.fillStyle = s.fill;
    ctx.strokeStyle = s.stroke ?? s.fill;
    ctx.lineWidth = s.strokeWidth ?? 1;
    ctx.beginPath();
    if (s.type === "rect") {
      if (s.fill !== "transparent") ctx.fillRect(s.x, s.y, s.w, s.h);
      if (s.stroke) ctx.strokeRect(s.x, s.y, s.w, s.h);
    } else if (s.type === "ellipse") {
      ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
      if (s.fill !== "transparent") ctx.fill();
      if (s.stroke) ctx.stroke();
    } else if (s.type === "diamond") {
      ctx.moveTo(s.x + s.w / 2, s.y);
      ctx.lineTo(s.x + s.w, s.y + s.h / 2);
      ctx.lineTo(s.x + s.w / 2, s.y + s.h);
      ctx.lineTo(s.x, s.y + s.h / 2);
      ctx.closePath();
      if (s.fill !== "transparent") ctx.fill();
      if (s.stroke) ctx.stroke();
    } else if (s.type === "line") {
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + s.w, s.y + s.h);
      ctx.stroke();
    } else if (s.type === "poly" && s.points) {
      ctx.moveTo(s.points[0]!, s.points[1]!);
      for (let i = 2; i < s.points.length; i += 2) {
        ctx.lineTo(s.points[i]!, s.points[i + 1]!);
      }
      ctx.closePath();
      if (s.fill !== "transparent") ctx.fill();
      if (s.stroke) ctx.stroke();
    }
    ctx.restore();
  }
}

const SPRITE_CACHE_LIMIT = 512;
const cache = new Map<string, HTMLCanvasElement>();
const readyKeys = new Set<string>();
const imageCache = new Map<string, HTMLImageElement>();
const imageReadyCallbacks = new Map<string, Set<() => void>>();
let rasterGeneration = 0;
const SVG_RASTER_SCALE = 2;

const CONTENT_ALPHA_MIN = 12;
const contentBoundsCache = new WeakMap<HTMLCanvasElement, SpriteBounds>();

export type SpriteRasterPlacement = {
  destX: number;
  destY: number;
  dw: number;
  dh: number;
};

/**
 * Resolve an image's draw rectangle independently of Canvas. Keeping this
 * calculation shared with rasterize makes directional contact-point tests
 * exercise the exact placement used in the game.
 */
export function spriteRasterPlacement(
  spec: SpriteSpec,
  sourceW: number,
  sourceH: number,
  canvasW: number,
  canvasH: number,
  inset: number,
): SpriteRasterPlacement {
  const crop = spec.imageCrop ?? {
    x: 0,
    y: 0,
    w: sourceW,
    h: sourceH,
    sourceW,
    sourceH,
  };
  const refW = crop.refW ?? (crop.sourceW > 0 ? crop.sourceW : crop.w);
  const refH = crop.refH ?? (crop.sourceH > 0 ? crop.sourceH : crop.h);
  const scale = Math.min((canvasW - inset * 2) / refW, (canvasH - inset * 2) / refH);
  const dw = Math.round(crop.w * scale);
  const dh = Math.round(crop.h * scale);
  const hasImageAnchor = spec.imageAnchorX !== undefined || spec.imageAnchorY !== undefined;
  if (!hasImageAnchor) {
    return {
      destX: Math.round((canvasW - dw) / 2),
      destY: Math.round(canvasH - dh - inset * 0.25),
      dw,
      dh,
    };
  }

  // Anchors are normalized against the complete source image. Convert them
  // into the selected crop before positioning so cropped anchored assets do
  // not acquire a view-dependent offset.
  const anchorInCropX = ((spec.imageAnchorX ?? 0.5) * crop.sourceW - crop.x) / crop.w;
  const anchorInCropY = ((spec.imageAnchorY ?? 1) * crop.sourceH - crop.y) / crop.h;
  return {
    destX: Math.round(((spec.anchorX ?? spec.w / 2) / spec.w) * canvasW - dw * anchorInCropX),
    destY: Math.round(((spec.anchorY ?? spec.h) / spec.h) * canvasH - dh * anchorInCropY),
    dw,
    dh,
  };
}

export function opaquePixelBounds(
  data: ArrayLike<number>,
  width: number,
  height: number,
  alphaMin = CONTENT_ALPHA_MIN,
): SpriteBounds | undefined {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) < alphaMin) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return undefined;
  return { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Tight box around painted pixels so sidebar previews can center the graphic, not the battlefield frame. */
export function spriteContentBounds(image: HTMLCanvasElement): SpriteBounds | undefined {
  const hit = contentBoundsCache.get(image);
  if (hit) return hit;
  const ctx = image.getContext("2d");
  if (!ctx || image.width <= 0 || image.height <= 0) return undefined;
  try {
    const bounds = opaquePixelBounds(ctx.getImageData(0, 0, image.width, image.height).data, image.width, image.height);
    if (bounds) contentBoundsCache.set(image, bounds);
    return bounds;
  } catch {
    return undefined;
  }
}

function rasterCacheKey(spec: SpriteSpec): string {
  const crop = spec.imageCrop
    ? `${spec.imageCrop.x},${spec.imageCrop.y},${spec.imageCrop.w},${spec.imageCrop.h}:${spec.imageCrop.sourceW},${spec.imageCrop.sourceH}:${spec.imageCrop.refW ?? ""}:${spec.imageCrop.refH ?? ""}`
    : "";
  const imageAnchor = spec.imageAnchorX !== undefined || spec.imageAnchorY !== undefined
    ? `:${spec.imageAnchorX ?? ""},${spec.imageAnchorY ?? ""}`
    : "";
  const texture = spec.imageTextureSrc
    ? `${spec.imageTextureSrc}:${spec.imageTextureOpacity ?? ""}:${spec.imageTextureOffset ?? 0}`
    : "";
  const shapes = spec.shapes.map((s) => `${s.type}:${s.x}:${s.y}:${s.w}:${s.h}`).join("|");
  return `image:${spec.imageSrc}:${spec.imageTint ?? ""}:${crop}${imageAnchor}:${spec.w}x${spec.h}:${spec.imageReveal ?? 1}:${shapes}:${texture}`;
}

function notifyImageReady(key: string, generation: number): void {
  if (generation !== rasterGeneration || !cache.has(key)) return;
  readyKeys.add(key);
  const callbacks = imageReadyCallbacks.get(key);
  if (!callbacks) return;
  imageReadyCallbacks.delete(key);
  for (const callback of callbacks) callback();
}

export function isRasterReady(spec: SpriteSpec): boolean {
  if (!spec.imageSrc) return true;
  const key = rasterCacheKey(spec);
  return cache.has(key) && readyKeys.has(key);
}

export function cachedImage(src: string): HTMLImageElement {
  const existing = imageCache.get(src);
  if (existing) return existing;
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  imageCache.set(src, image);
  return image;
}

export function areRasterSourcesReady(srcs: readonly string[]): boolean {
  if (typeof Image === "undefined") return true;
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) return true;
  for (const src of srcs) {
    const img = imageCache.get(src);
    if (!img || !img.complete || img.naturalWidth <= 0) return false;
  }
  return true;
}

export function preloadRasterSources(srcs: readonly string[]): void {
  if (typeof Image === "undefined") return;
  for (const src of srcs) cachedImage(src);
}

function paintTexture(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  spec: SpriteSpec,
  generation: number,
): void {
  if (!spec.imageTextureSrc) return;
  const image = cachedImage(spec.imageTextureSrc);
  const draw = () => {
    if (generation !== rasterGeneration) return;
    const overscan = 1.4;
    const dw = canvas.width * overscan;
    const dh = canvas.height * overscan;
    const offset = spec.imageTextureOffset ?? 0;
    const dx = -((offset >>> 3) % Math.max(1, Math.round(dw - canvas.width)));
    const dy = -((offset >>> 11) % Math.max(1, Math.round(dh - canvas.height)));
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = spec.imageTextureOpacity ?? 0.2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, dx, dy, dw, dh);
    ctx.restore();
  };
  if (image.complete && image.naturalWidth > 0) draw();
  else image.addEventListener("load", draw, { once: true });
}

export function rasterize(spec: SpriteSpec, onReady?: () => void): HTMLCanvasElement {
  const key = spec.imageSrc ? rasterCacheKey(spec) : spec.id;
  const hit = cache.get(key);
  if (spec.imageSrc && onReady) {
    const image = imageCache.get(spec.imageSrc);
    if (!image || !image.complete || image.naturalWidth <= 0) {
      const callbacks = imageReadyCallbacks.get(key) ?? new Set<() => void>();
      callbacks.add(onReady);
      imageReadyCallbacks.set(key, callbacks);
    }
  }
  if (hit) {
    retainRaster(key, hit);
    return hit;
  }
  const c = document.createElement("canvas");
  const generation = rasterGeneration;
  retainRaster(key, c);
  if (spec.imageSrc) {
    // Keep a high-resolution working canvas: the source sprites are raster art
    // and must remain crisp when the battlefield camera zooms in.
    c.width = spec.w * SVG_RASTER_SCALE;
    c.height = spec.h * SVG_RASTER_SCALE;
    const ctx = c.getContext("2d")!;
    const image = imageCache.get(spec.imageSrc) ?? new Image();
    image.decoding = "async";
    const paintImage = () => {
      if (generation !== rasterGeneration || cache.get(key) !== c) return;
      const inset = Math.max(1, Math.round(Math.min(c.width, c.height) * 0.025));
      const crop = spec.imageCrop ?? {
        x: 0,
        y: 0,
        w: image.naturalWidth,
        h: image.naturalHeight,
        sourceW: image.naturalWidth,
        sourceH: image.naturalHeight,
      };
      const { destX, destY, dw, dh } = spriteRasterPlacement(
        spec,
        image.naturalWidth,
        image.naturalHeight,
        c.width,
        c.height,
        inset,
      );
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.save();
      const reveal = spec.imageReveal ?? 1;
      if (reveal < 1) {
        const visible = Math.max(1, Math.round(dh * reveal));
        ctx.beginPath();
        ctx.rect(destX, destY + dh - visible, dw, visible);
        ctx.clip();
      }
      ctx.drawImage(
        image,
        crop.x,
        crop.y,
        crop.w,
        crop.h,
        destX,
        destY,
        dw,
        dh,
      );
      ctx.restore();
      if (spec.imageTint) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = spec.imageTint;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.globalCompositeOperation = "source-over";
      }
      paintTexture(ctx, c, spec, generation);
      if (spec.shapes.length) {
        ctx.save();
        ctx.scale(c.width / spec.w, c.height / spec.h);
        paintShapes(ctx, spec.shapes);
        ctx.restore();
      }
      notifyImageReady(key, generation);
    };
    if (!imageCache.has(spec.imageSrc)) {
      imageCache.set(spec.imageSrc, image);
      image.src = spec.imageSrc;
    }
    if (image.complete && image.naturalWidth > 0) paintImage();
    else image.addEventListener("load", paintImage, { once: true });
  } else if (spec.svg) {
    c.width = spec.w * SVG_RASTER_SCALE;
    c.height = spec.h * SVG_RASTER_SCALE;
    const ctx = c.getContext("2d")!;
    ctx.scale(SVG_RASTER_SCALE, SVG_RASTER_SCALE);
    paintSvg(ctx, spec.svg);
    readyKeys.add(key);
  } else {
    const scale = spec.imageTextureSrc ? SVG_RASTER_SCALE : 1;
    c.width = spec.w * scale;
    c.height = spec.h * scale;
    const ctx = c.getContext("2d")!;
    if (scale > 1) ctx.scale(scale, scale);
    paintShapes(ctx, spec.shapes);
    if (spec.imageTextureSrc) {
      ctx.scale(1 / scale, 1 / scale);
      paintTexture(ctx, c, spec, generation);
    }
    readyKeys.add(key);
  }
  return c;
}

function retainRaster(key: string, raster: HTMLCanvasElement): void {
  if (!cache.has(key) && cache.size >= SPRITE_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
      readyKeys.delete(oldest);
      imageReadyCallbacks.delete(oldest);
    }
  }
  cache.delete(key);
  cache.set(key, raster);
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  spec: SpriteSpec,
  img: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  source?: SpriteBounds,
): void {
  const smooth = Boolean(spec.svg || spec.imageSrc || spec.imageTextureSrc);
  ctx.imageSmoothingEnabled = smooth;
  if (smooth && "imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  const draw = (x: number, y: number, width: number, height: number) => {
    if (source) {
      ctx.drawImage(img, source.minX, source.minY, source.width, source.height, x, y, width, height);
    } else {
      ctx.drawImage(img, x, y, width, height);
    }
  };
  if (spec.rotation) {
    const scaleX = dw / spec.w;
    const scaleY = dh / spec.h;
    const ax = (spec.anchorX ?? spec.w / 2) * scaleX;
    const ay = (spec.anchorY ?? spec.h) * scaleY;
    ctx.save();
    ctx.translate(dx + ax, dy + ay);
    ctx.rotate(spec.rotation);
    draw(-ax, -ay, dw, dh);
    ctx.restore();
  } else {
    draw(dx, dy, dw, dh);
  }
  ctx.imageSmoothingEnabled = false;
}

export function cachedSprite(id: string): HTMLCanvasElement | undefined {
  return cache.get(id);
}

export function spriteCacheSize(): number {
  return cache.size;
}

export function clearSpriteCache(): void {
  rasterGeneration += 1;
  cache.clear();
  readyKeys.clear();
  imageCache.clear();
  imageReadyCallbacks.clear();
}
