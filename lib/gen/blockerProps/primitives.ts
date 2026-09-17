import type { ShapeSpec } from "../../types";
import { ell, line, poly } from "../shapePrimitives";
import type { PropPrim } from "./types";

export const SHADOW = "#1a2523";
export const SHADOW_ALPHA = 0.2;
export const SNOW = "#ecf4f6";
export const CURVE_SAMPLES = 6;

export function detailHash(value: number, salt: number): number {
  return Math.imul((value ^ salt) >>> 0, 1597334677) >>> 0;
}

export function detailUnit(value: number, salt: number): number {
  return detailHash(value, salt) / 4294967296;
}

export function detailSigned(value: number, salt: number, span: number): number {
  return (detailUnit(value, salt) * 2 - 1) * span;
}

export function pe(
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  fill: string,
  alpha?: number,
): PropPrim {
  return { k: "ell", x, y, rx, ry, rot, fill, alpha };
}

export function pp(pts: number[], fill: string, alpha?: number): PropPrim {
  return { k: "poly", pts, fill, alpha };
}

export function pl(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stroke: string,
  width: number,
  extra?: { minWidth?: number; cap?: "butt" | "round" | "square"; alpha?: number },
): PropPrim {
  return { k: "line", x0, y0, x1, y1, stroke, width, ...extra };
}

export function pc(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  stroke: string,
  width: number,
  extra?: { minWidth?: number; cap?: "butt" | "round" | "square"; alpha?: number },
): PropPrim {
  return { k: "curve", x0, y0, cx, cy, x1, y1, stroke, width, ...extra };
}

export function shadow(rx: number, ry: number, dy = 6): PropPrim {
  return pe(0, dy, rx, ry, 0, SHADOW, SHADOW_ALPHA);
}

function parseHex(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

export function liftGreen(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  return `#${[r, Math.min(255, g + amount), b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;
}

export function quadPoint(
  t: number,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
): [number, number] {
  const u = 1 - t;
  return [
    u * u * x0 + 2 * u * t * cx + t * t * x1,
    u * u * y0 + 2 * u * t * cy + t * t * y1,
  ];
}

export function strokeWidth(prim: Extract<PropPrim, { k: "line" | "curve" }>): number {
  return Math.max(prim.minWidth ?? prim.width, prim.width);
}

/** Map shared prop prims into tile-sprite ShapeSpecs. Curves become sampled polylines. */
export function appendPropArtShapes(
  shapes: ShapeSpec[],
  prims: PropPrim[],
  ox: number,
  oy: number,
): void {
  for (const prim of prims) {
    if (prim.k === "ell") {
      const shape = ell(ox + prim.x - prim.rx, oy + prim.y - prim.ry, prim.rx * 2, prim.ry * 2, prim.fill);
      shapes.push(prim.alpha !== undefined ? { ...shape, alpha: prim.alpha } : shape);
      continue;
    }
    if (prim.k === "poly") {
      const pts: number[] = [];
      for (let i = 0; i < prim.pts.length; i += 2) {
        pts.push(ox + prim.pts[i]!, oy + prim.pts[i + 1]!);
      }
      const shape = poly(pts, prim.fill);
      shapes.push(prim.alpha !== undefined ? { ...shape, alpha: prim.alpha } : shape);
      continue;
    }
    if (prim.k === "line") {
      const shape = line(ox + prim.x0, oy + prim.y0, ox + prim.x1, oy + prim.y1, prim.stroke, strokeWidth(prim));
      shapes.push(prim.alpha !== undefined ? { ...shape, alpha: prim.alpha } : shape);
      continue;
    }
    let [px, py] = quadPoint(0, prim.x0, prim.y0, prim.cx, prim.cy, prim.x1, prim.y1);
    for (let i = 1; i <= CURVE_SAMPLES; i++) {
      const [nx, ny] = quadPoint(i / CURVE_SAMPLES, prim.x0, prim.y0, prim.cx, prim.cy, prim.x1, prim.y1);
      const shape = line(ox + px, oy + py, ox + nx, oy + ny, prim.stroke, strokeWidth(prim));
      shapes.push(prim.alpha !== undefined ? { ...shape, alpha: prim.alpha } : shape);
      px = nx;
      py = ny;
    }
  }
}
