import { tileCliffGeometry } from "../../gen/cliffGeometry";
import { cliffFaces, mixHex } from "../../gen/tilePalette";
import type { TerrainLightRig } from "../terrainLighting";

const SOFT_RAMP_LIGHT = "#f2efe4";
const SOFT_RAMP_SHADOW = "#0d1519";

function blendElevationColor(color: string, target: string, amount: number): string {
  return color.startsWith("#") ? mixHex(color, target, amount) : color;
}

export function softElevationRampStops(color: string): [string, string] {
  return [
    blendElevationColor(color, SOFT_RAMP_LIGHT, 0.16),
    blendElevationColor(color, SOFT_RAMP_SHADOW, 0.08),
  ];
}

function shadeHex(value: string, factor: number): string {
  const r = Number.parseInt(value.slice(1, 3), 16);
  const g = Number.parseInt(value.slice(3, 5), 16);
  const b = Number.parseInt(value.slice(5, 7), 16);
  return `#${[r, g, b].map((channel) => Math.max(0, Math.min(255, Math.round(channel * factor))).toString(16).padStart(2, "0")).join("")}`;
}

export function drawElevationFaces(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  tw: number,
  th: number,
  heightStep: number,
  dropE: number,
  dropS: number,
  seed: number,
  colors: ReturnType<typeof cliffFaces>,
  tileX = 0,
  tileY = 0,
  light?: TerrainLightRig,
): void {
  const geo = tileCliffGeometry(tw, th, heightStep, dropE, dropS, seed, tileX, tileY);
  const shadowY = originY + Math.max(1, heightStep * 0.08);
  const southColor = light ? shadeHex(colors.south, 0.91 + light.directionY * 0.07) : colors.south;
  const eastColor = light ? shadeHex(colors.east, 0.96 + light.directionX * 0.07) : colors.east;
  const southSoft = dropS === 1;
  const eastSoft = dropE === 1;
  if (geo.south) {
    if (!southSoft) fillElevationPoly(ctx, originX, shadowY, geo.south.points, mixHex(southColor, SOFT_RAMP_SHADOW, 0.24));
    fillElevationPoly(
      ctx,
      originX,
      originY,
      geo.south.points,
      southSoft ? blendElevationColor(southColor, SOFT_RAMP_LIGHT, 0.1) : southColor,
    );
    if (!southSoft) {
      fillFaceStrata(ctx, originX, originY, geo.south.points, southColor, 0.28, 0.46, 0.11);
      fillFaceStrata(ctx, originX, originY, geo.south.points, southColor, 0.6, 0.7, 0.06);
      strokeRim(ctx, originX, originY, geo.south.points, southColor);
      strokeCracks(ctx, originX, originY, geo.south.cracks, colors.southInk);
    }
  }
  if (geo.east) {
    if (!eastSoft) fillElevationPoly(ctx, originX, shadowY, geo.east.points, mixHex(eastColor, SOFT_RAMP_SHADOW, 0.24));
    fillElevationPoly(
      ctx,
      originX,
      originY,
      geo.east.points,
      eastSoft ? blendElevationColor(eastColor, SOFT_RAMP_LIGHT, 0.1) : eastColor,
    );
    if (!eastSoft) {
      fillFaceStrata(ctx, originX, originY, geo.east.points, eastColor, 0.28, 0.46, 0.11);
      fillFaceStrata(ctx, originX, originY, geo.east.points, eastColor, 0.6, 0.7, 0.06);
      strokeRim(ctx, originX, originY, geo.east.points, eastColor);
      strokeCracks(ctx, originX, originY, geo.east.cracks, colors.eastInk);
    }
  }
  if (geo.wedge) {
    const fill = mixHex(southColor, eastColor, 0.42);
    const softWedge = dropE === 1 && dropS === 1;
    if (!softWedge) fillElevationPoly(ctx, originX, shadowY, geo.wedge, mixHex(fill, SOFT_RAMP_SHADOW, 0.34));
    fillElevationPoly(ctx, originX, originY, geo.wedge, softWedge ? blendElevationColor(fill, SOFT_RAMP_LIGHT, 0.08) : mixHex(fill, SOFT_RAMP_LIGHT, 0.08));
  }
}

export function fillElevationPoly(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  points: number[],
  fill?: string | CanvasGradient | CanvasPattern,
  stroke = false,
): void {
  if (points.length < 6) return;
  ctx.beginPath();
  ctx.moveTo(ox + points[0]!, oy + points[1]!);
  for (let i = 2; i < points.length; i += 2) {
    ctx.lineTo(ox + points[i]!, oy + points[i + 1]!);
  }
  ctx.closePath();
  if (fill !== undefined) ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) ctx.stroke();
}

export function fillElevationRamp(
  ctx: CanvasRenderingContext2D,
  points: number[],
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromColor: string,
  toColor: string,
): void {
  if (points.length < 6) return;
  const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
  if (!gradient || typeof gradient.addColorStop !== "function") {
    fillElevationPoly(ctx, 0, 0, points, fromColor);
    return;
  }
  gradient.addColorStop(0, fromColor);
  gradient.addColorStop(1, toColor);
  fillElevationPoly(ctx, 0, 0, points, gradient);
}

function fillFaceStrata(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  points: number[],
  color: string,
  t0: number,
  t1: number,
  shade: number,
): void {
  if (points.length < 12 || points.length % 4 !== 0) return;
  const samples = points.length / 4;
  const band: number[] = [];
  for (let i = 0; i < samples; i++) {
    const tx = points[i * 2]!;
    const ty = points[i * 2 + 1]!;
    const botIndex = points.length / 2 - 1 - i;
    const bx = points[botIndex * 2]!;
    const by = points[botIndex * 2 + 1]!;
    band.push(tx + (bx - tx) * t0, ty + (by - ty) * t0);
  }
  for (let i = samples - 1; i >= 0; i--) {
    const tx = points[i * 2]!;
    const ty = points[i * 2 + 1]!;
    const botIndex = points.length / 2 - 1 - i;
    const bx = points[botIndex * 2]!;
    const by = points[botIndex * 2 + 1]!;
    band.push(tx + (bx - tx) * t1, ty + (by - ty) * t1);
  }
  fillElevationPoly(ctx, ox, oy, band, mixHex(color, "#0d1519", shade));
}

function strokeRim(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  points: number[],
  color: string,
): void {
  if (points.length < 8 || points.length % 4 !== 0) return;
  const samples = points.length / 4;
  const previousAlpha = typeof ctx.globalAlpha === "number" ? ctx.globalAlpha : 1;
  ctx.globalAlpha = previousAlpha * 0.34;
  ctx.strokeStyle = mixHex(color, "#e2ebe4", 0.24);
  ctx.lineWidth = 0.7;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(ox + points[0]!, oy + points[1]!);
  for (let i = 1; i < samples; i++) {
    ctx.lineTo(ox + points[i * 2]!, oy + points[i * 2 + 1]!);
  }
  ctx.stroke();
  ctx.globalAlpha = previousAlpha;
}

function strokeCracks(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  cracks: number[][],
  stroke: string,
): void {
  if (!cracks.length) return;
  const previousAlpha = typeof ctx.globalAlpha === "number" ? ctx.globalAlpha : 1;
  ctx.globalAlpha = previousAlpha * 0.38;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 0.6;
  for (const crack of cracks) {
    ctx.beginPath();
    ctx.moveTo(ox + crack[0]!, oy + crack[1]!);
    ctx.lineTo(ox + crack[2]!, oy + crack[3]!);
    ctx.stroke();
  }
  ctx.globalAlpha = previousAlpha;
}
