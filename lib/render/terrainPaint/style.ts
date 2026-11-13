import type { Rgb } from "../terrainMaterials";

export function rgbOf(c: Rgb): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const u = t < 0 ? 0 : Math.min(t , 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * u),
    g: Math.round(a.g + (b.g - a.g) * u),
    b: Math.round(a.b + (b.b - a.b) * u),
  };
}

/** Scale the current alpha for a nested fill without resetting parent fog. */
export function withAlpha(
  ctx: CanvasRenderingContext2D,
  alpha: number,
  paint: () => void,
): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  paint();
  ctx.restore();
}

export function fillPoly(ctx: CanvasRenderingContext2D, pts: number[]): void {
  if (pts.length < 6) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
  ctx.closePath();
  ctx.fill();
}
