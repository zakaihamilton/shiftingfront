import type { PortraitAsset } from "../../gen/portraitCatalog";
import type { FaceTone, PortraitClip, PortraitFrameRect, PortraitOffset } from "./types";
import { PORTRAIT_OFFSET_NONE } from "./types";

function drawPortraitBooth(ctx: CanvasRenderingContext2D, tone: FaceTone): void {
  const booth = tone === "enemy" ? "#1c1210" : tone === "command" ? "#12160f" : "#10140c";
  const glow = tone === "enemy" ? "rgba(110, 38, 28, 0.34)" : "rgba(52, 72, 38, 0.28)";
  const rim = tone === "enemy" ? "#6a3428" : "#3d4633";

  ctx.fillStyle = booth;
  ctx.fillRect(-58, -74, 116, 152);
  const wash = ctx.createRadialGradient(-8, -18, 8, 0, 4, 70);
  wash.addColorStop(0, glow);
  wash.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(-58, -74, 116, 152);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2;
  ctx.strokeRect(-55, -71, 110, 146);
  ctx.fillStyle = rim;
  for (const [x, y] of [
    [-52, -68],
    [48, -68],
    [-52, 70],
    [48, 70],
  ]) {
    ctx.fillRect(x, y, 4, 4);
  }
  ctx.fillStyle = "rgba(8, 10, 8, 0.55)";
  ctx.beginPath();
  ctx.ellipse(0, 70, 44, 11, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPortraitBackdrop(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  tone: FaceTone,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 100, size / 100);
  drawPortraitBooth(ctx, tone);
  ctx.restore();
}

export function portraitFrameRect(
  imageWidth: number,
  imageHeight: number,
  frameCount: number,
  frame: number,
  destinationWidth?: number,
  destinationHeight?: number,
): PortraitFrameRect {
  const safeFrame = Math.max(0, Math.min(frameCount - 1, frame));
  const frameWidth = imageWidth / frameCount;
  let sourceWidth = frameWidth;
  let sourceHeight = imageHeight;
  let sourceY = 0;

  if (destinationWidth && destinationHeight && destinationWidth > 0 && destinationHeight > 0) {
    const sourceAspect = frameWidth / imageHeight;
    const destinationAspect = destinationWidth / destinationHeight;

    if (sourceAspect < destinationAspect) {
      sourceHeight = frameWidth / destinationAspect;
      sourceY = Math.max(0, Math.min(imageHeight - sourceHeight, imageHeight * 0.04));
    } else if (sourceAspect > destinationAspect) {
      sourceWidth = imageHeight * destinationAspect;
    }
  }

  return {
    sx: safeFrame * frameWidth + (frameWidth - sourceWidth) / 2,
    sy: sourceY,
    sw: sourceWidth,
    sh: sourceHeight,
  };
}

export function drawPortraitFrame(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  asset: PortraitAsset,
  frame: number,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const source = portraitFrameRect(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    asset.frameCount,
    frame,
    width,
    height,
  );
  ctx.drawImage(
    image,
    Math.round(source.sx),
    Math.round(source.sy),
    Math.round(source.sw),
    Math.round(source.sh),
    x,
    y,
    width,
    height,
  );
}

export function drawPortraitClippedFrame(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  asset: PortraitAsset,
  frame: number,
  x: number,
  y: number,
  width: number,
  height: number,
  clips: readonly PortraitClip[],
  offset: PortraitOffset = PORTRAIT_OFFSET_NONE,
  overlay?: HTMLCanvasElement | null,
): void {
  if (clips.length === 0) return;
  if (!overlay) {
    ctx.save();
    ctx.beginPath();
    for (const clip of clips) {
      const cx = x + width * clip.cx;
      const cy = y + height * clip.cy;
      const rx = width * clip.rx;
      const ry = height * clip.ry;
      ctx.moveTo(cx + rx, cy);
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.closePath();
    }
    ctx.clip();
    ctx.translate(offset.dx, offset.dy);
    drawPortraitFrame(ctx, image, asset, frame, x, y, width, height);
    ctx.restore();
    return;
  }

  if (overlay.width !== width) overlay.width = width;
  if (overlay.height !== height) overlay.height = height;
  const off = overlay.getContext("2d");
  if (!off) return;
  off.setTransform(1, 0, 0, 1, 0, 0);
  off.clearRect(0, 0, width, height);
  off.translate(offset.dx, offset.dy);
  drawPortraitFrame(off, image, asset, frame, 0, 0, width, height);
  off.setTransform(1, 0, 0, 1, 0, 0);
  off.globalCompositeOperation = "destination-in";
  for (const clip of clips) {
    const cx = width * clip.cx;
    const cy = height * clip.cy;
    const rx = width * clip.rx;
    const ry = height * clip.ry;
    off.save();
    off.translate(cx, cy);
    off.scale(rx, ry);
    const fade = off.createRadialGradient(0, 0, 0, 0, 0, 1);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(0.62, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    off.fillStyle = fade;
    off.beginPath();
    off.arc(0, 0, 1, 0, Math.PI * 2);
    off.fill();
    off.restore();
  }
  off.globalCompositeOperation = "source-over";
  ctx.drawImage(overlay, x, y);
}
