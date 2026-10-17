export function isoDiamondPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w / 2, y + h / 2);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x - w / 2, y + h / 2);
  ctx.closePath();
}

export type IsoDiamondCornerRadii = readonly [number, number, number, number];

export function isoDiamondVertices(
  x: number,
  y: number,
  w: number,
  h: number,
): readonly [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] {
  return [
    { x, y },
    { x: x + w / 2, y: y + h / 2 },
    { x, y: y + h },
    { x: x - w / 2, y: y + h / 2 },
  ];
}

export function roundedIsoDiamondPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number | IsoDiamondCornerRadii,
): void {
  const pts = isoDiamondVertices(x, y, w, h);
  const radii: IsoDiamondCornerRadii = typeof radius === "number" ? [radius, radius, radius, radius] : radius;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const prev = pts[(i + 3) % 4]!;
    const curr = pts[i]!;
    const next = pts[(i + 1) % 4]!;
    const dPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dNext = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.max(0, Math.min(radii[i] ?? 0, dPrev * 0.5, dNext * 0.5));
    if (i === 0) {
      const t = dPrev === 0 ? 0 : r / dPrev;
      ctx.moveTo(curr.x + (prev.x - curr.x) * t, curr.y + (prev.y - curr.y) * t);
    }
    ctx.arcTo(curr.x, curr.y, next.x, next.y, r);
  }
  ctx.closePath();
}
