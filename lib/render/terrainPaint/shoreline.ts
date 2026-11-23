import { TILE_H, TILE_W } from "../../iso";
import type { biomeMaterials } from "../terrainAtlas";
import { shorelineWarp } from "../terrainAtlasSurfaces";

const COASTLINE_EDGE_SEGMENTS = 16;

export type ScreenPoint = { x: number; y: number };

export function shorelineEdgePoints(
  start: ScreenPoint,
  end: ScreenPoint,
  startMap: ScreenPoint,
  endMap: ScreenPoint,
  center: ScreenPoint,
  zoom: number,
  salt: number,
  waterCell: boolean,
): ScreenPoint[] {
  const points: ScreenPoint[] = [];
  const midX = (start.x + end.x) * 0.5;
  const midY = (start.y + end.y) * 0.5;
  const normalX = center.x - midX;
  const normalY = center.y - midY;
  const normalLength = Math.hypot(normalX, normalY) || 1;
  const inwardX = normalX / normalLength;
  const inwardY = normalY / normalLength;
  const waterSign = waterCell ? -1 : 1;

  for (let step = 0; step <= COASTLINE_EDGE_SEGMENTS; step++) {
    const t = step / COASTLINE_EDGE_SEGMENTS;
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    const mapX = startMap.x + (endMap.x - startMap.x) * t;
    const mapY = startMap.y + (endMap.y - startMap.y) * t;
    const edgeFade = Math.sin(Math.PI * t) ** 2;
    const offset =
      shorelineWarp(mapX, mapY, salt) * Math.min(TILE_W, TILE_H) * zoom * edgeFade * waterSign;
    points.push({ x: x + inwardX * offset, y: y + inwardY * offset });
  }
  return points;
}

export function drawShorelineFoam(
  ctx: CanvasRenderingContext2D,
  edges: readonly (readonly ScreenPoint[] | null)[],
  mats: ReturnType<typeof biomeMaterials>,
  zoom: number,
): void {
  if (!edges.some(Boolean)) return;
  ctx.save();
  ctx.globalAlpha *= 0.6;
  ctx.strokeStyle = `rgb(${mats.waterHi.r},${mats.waterHi.g},${mats.waterHi.b})`;
  ctx.lineWidth = Math.max(1.25, Math.min(TILE_H * zoom * 0.075, 3 * zoom));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const edge of edges) {
    if (!edge || edge.length < 2) continue;
    ctx.moveTo(edge[0]!.x, edge[0]!.y);
    for (let i = 1; i < edge.length; i++) ctx.lineTo(edge[i]!.x, edge[i]!.y);
  }
  ctx.stroke();
  ctx.restore();
}
