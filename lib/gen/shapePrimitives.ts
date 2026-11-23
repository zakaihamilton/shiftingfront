import type { ShapeSpec } from "../types";

export function poly(points: number[], fill: string, stroke?: string, strokeWidth = 1): ShapeSpec {
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    type: "poly",
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
    fill,
    stroke,
    strokeWidth,
    points,
  };
}

export function ell(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke?: string,
): ShapeSpec {
  return { type: "ellipse", x, y, w, h, fill, stroke, strokeWidth: stroke ? 1 : undefined };
}

export function line(
  x: number,
  y: number,
  x2: number,
  y2: number,
  stroke: string,
  width = 2,
): ShapeSpec {
  return {
    type: "line",
    x,
    y,
    w: x2 - x,
    h: y2 - y,
    fill: "transparent",
    stroke,
    strokeWidth: width,
  };
}

export function irregularIso(cx: number, cy: number, w: number, h: number, out = 1): number[] {
  const hw = w / 2;
  const hh = h / 2;
  const bevel = Math.max(1, out);
  return [
    cx,
    cy - hh,
    cx + hw - bevel,
    cy - bevel * 0.45,
    cx + hw,
    cy,
    cx + hw - bevel,
    cy + bevel * 0.45,
    cx,
    cy + hh,
    cx - hw + bevel,
    cy + bevel * 0.45,
    cx - hw,
    cy,
    cx - hw + bevel,
    cy - bevel * 0.45,
  ];
}
