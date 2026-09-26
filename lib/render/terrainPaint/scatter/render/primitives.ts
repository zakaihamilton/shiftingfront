import { mixRgb, rgbOf, withAlpha } from "../../style";

export function detailHash(value: number, salt: number): number {
  return Math.imul((value ^ salt) >>> 0, 1597334677) >>> 0;
}

export function detailUnit(value: number, salt: number): number {
  return detailHash(value, salt) / 4294967296;
}

export function detailSigned(value: number, salt: number, span: number): number {
  return (detailUnit(value, salt) * 2 - 1) * span;
}

export function paintDabs(
  ctx: CanvasRenderingContext2D,
  s: number,
  variant: number,
  tone: { r: number; g: number; b: number },
  count: number,
  xSpan: number,
  ySpan: number,
  radius: number,
  alpha: number,
): void {
  withAlpha(ctx, alpha, () => {
    ctx.fillStyle = rgbOf(tone);
    for (let i = 0; i < count; i++) {
      const x = detailSigned(variant, 701 + i * 13, xSpan) * s;
      const y = detailSigned(variant, 739 + i * 17, ySpan) * s;
      const rx = (0.45 + detailUnit(variant, 773 + i * 19) * 0.9) * radius * s;
      const ry = (0.28 + detailUnit(variant, 809 + i * 23) * 0.55) * radius * s;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, detailSigned(variant, 853 + i * 29, 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function paintCrack(
  ctx: CanvasRenderingContext2D,
  s: number,
  variant: number,
  tone: { r: number; g: number; b: number },
  x: number,
  y: number,
  length: number,
  alpha = 0.34,
): void {
  const lean = detailSigned(variant, 887, 1.8);
  withAlpha(ctx, alpha, () => {
    ctx.strokeStyle = rgbOf(tone);
    ctx.lineWidth = Math.max(0.45, 0.48 * s);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x * s, y * s);
    ctx.quadraticCurveTo((x + length * 0.42 + lean) * s, (y - length * 0.16) * s, (x + length) * s, (y - length * 0.48) * s);
    ctx.stroke();
  });
}

export function paintLayeredShadow(
  ctx: CanvasRenderingContext2D,
  s: number,
  rx: number,
  ry: number,
  dy: number,
  tone?: { r: number; g: number; b: number },
): void {
  shadow(ctx, s, rx, ry, dy, tone);
  if (!tone) return;
  withAlpha(ctx, 0.22, () => {
    ctx.fillStyle = rgbOf(mixRgb(tone, { r: 8, g: 12, b: 12 }, 0.62));
    ctx.beginPath();
    ctx.ellipse(0, (dy - 0.1) * s, rx * 0.56 * s, ry * 0.68 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function shadow(
  ctx: CanvasRenderingContext2D,
  z: number,
  rx: number,
  ry: number,
  dy = 5,
  tone?: { r: number; g: number; b: number },
): void {
  const paint = () => {
    ctx.fillStyle = tone ? rgbOf(mixRgb(tone, { r: 14, g: 20, b: 20 }, 0.5)) : "rgba(6,10,12,0.14)";
    ctx.beginPath();
    ctx.ellipse(0, dy * z, rx * z, ry * z, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  if (tone) withAlpha(ctx, 0.28, paint);
  else paint();
}
