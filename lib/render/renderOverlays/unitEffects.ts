import type { SpriteSpec } from "../../types";
import { selectionPulse } from "../anim";
import { drawSprite } from "../sprites";

export function drawUnitGlow(
  ctx: CanvasRenderingContext2D,
  spec: SpriteSpec,
  img: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  timeMs: number,
  alpha: number,
  z: number,
): void {
  const pulse = selectionPulse(timeMs);
  ctx.save();
  ctx.globalAlpha = alpha * (0.72 + pulse * 0.28);
  ctx.shadowColor = "#f6e39a";
  ctx.shadowBlur = (14 + pulse * 10) * Math.max(1, z);
  drawSprite(ctx, spec, img, dx, dy, dw, dh);
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowBlur = (7 + pulse * 5) * Math.max(1, z);
  ctx.globalAlpha = alpha * (0.28 + pulse * 0.22);
  drawSprite(ctx, spec, img, dx, dy, dw, dh);
  ctx.restore();
}

export function drawDamageOverlay(
  ctx: CanvasRenderingContext2D,
  spec: { w: number; h: number; rotation?: number; anchorX?: number; anchorY?: number },
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  damageStage: 0 | 1 | 2,
  timeMs: number,
  id: number,
  baseAlpha: number,
): void {
  if (damageStage <= 0) return;
  const sx = dw / spec.w;
  const sy = dh / spec.h;
  const ax = (spec.anchorX ?? spec.w / 2) * sx;
  const ay = (spec.anchorY ?? spec.h) * sy;
  const pulse = (Math.sin(timeMs * 0.006 + id * 1.7) + 1) * 0.5;
  ctx.save();
  ctx.translate(dx + ax, dy + ay);
  if (spec.rotation) ctx.rotate(spec.rotation);
  ctx.globalAlpha = baseAlpha * 0.6;
  ctx.fillStyle = "#2b2520";
  ctx.beginPath();
  ctx.ellipse(-8 * sx, -8 * sy, 9 * sx, 4 * sy, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#171514";
  ctx.lineWidth = Math.max(1, 1.8 * sx);
  ctx.beginPath();
  ctx.moveTo(-4 * sx, -20 * sy);
  ctx.lineTo(4 * sx, 5 * sy);
  ctx.lineTo(13 * sx, -1 * sy);
  ctx.stroke();
  if (damageStage > 1) {
    ctx.globalAlpha = baseAlpha * (0.22 + pulse * 0.16);
    ctx.fillStyle = "#1b1d1c";
    for (let i = 0; i < 3; i++) {
      const rise = (i * 8 + pulse * 5) * sy;
      ctx.beginPath();
      ctx.arc((8 + i * 5) * sx, -22 * sy - rise, (3 + i) * sx, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
