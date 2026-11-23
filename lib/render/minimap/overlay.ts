import { TILE_H, TILE_W } from "../../iso";
import type { ColorblindMode } from "../../persist/settings";
import { missionUsesObjectiveZone, OBJECTIVE_ZONE_RADIUS, type SimState } from "../../types";
import { minimapMapRect } from "../camera";
import { entityColor, minimapEntityVisible } from "./classification";

export function paintMinimapOverlay(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  view: { x: number; y: number }[],
  w: number,
  h: number,
  selectedIds: ReadonlySet<number>,
  mode: ColorblindMode = "none",
): void {
  const mapRect = minimapMapRect(w, h, state.width, state.height);
  const sx = mapRect.width / state.width;
  const sy = mapRect.height / state.height;
  const mapX = (x: number) => mapRect.x + (x + 0.5) * sx;
  const mapY = (y: number) => mapRect.y + (y + 0.5) * sy;
  const targetIds = new Set(state.runtime?.targetIds ?? []);
  for (const e of state.entities) {
    if (e.hp <= 0) continue;
    if (!minimapEntityVisible(state, e)) continue;
    const x = mapX(e.x);
    const y = mapY(e.y);
    ctx.fillStyle = entityColor(e, state, mode);
    const size = e.class === "building" ? 6 : 3;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    if (selectedIds.has(e.id)) {
      ctx.strokeStyle = "#8ff9f2";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(4, size * 0.85), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (targetIds.has(e.id)) {
      ctx.strokeStyle = "#ffe066";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y - Math.max(4, size));
      ctx.lineTo(x + Math.max(4, size), y);
      ctx.lineTo(x, y + Math.max(4, size));
      ctx.lineTo(x - Math.max(4, size), y);
      ctx.closePath();
      ctx.stroke();
    }
  }
  for (const challenge of state.runtime?.secondary ?? []) {
    if (challenge.priority !== "optional" || !challenge.zone || challenge.completed) continue;
    ctx.save();
    ctx.strokeStyle = "#e8c86a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      mapX(challenge.zone.x),
      mapY(challenge.zone.y),
      Math.max(3, (challenge.radius ?? 3) * sx),
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  }
  const zone = state.runtime?.zone;
  if (zone && missionUsesObjectiveZone(state.runtime?.kind)) {
    const zx = mapX(zone.x);
    const zy = mapY(zone.y);
    const radiusX = Math.max(3, OBJECTIVE_ZONE_RADIUS * sx);
    const radiusY = Math.max(3, OBJECTIVE_ZONE_RADIUS * sy);
    ctx.fillStyle = "rgba(232, 200, 106, 0.08)";
    ctx.beginPath();
    ctx.ellipse(zx, zy, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e8c86a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(zx, zy, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(zx - 3, zy);
    ctx.lineTo(zx + 3, zy);
    ctx.moveTo(zx, zy - 3);
    ctx.lineTo(zx, zy + 3);
    ctx.stroke();
  }
  const viewRect = minimapViewRect(view, w, h, state.width, state.height);
  if (viewRect) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(mapRect.x, mapRect.y, mapRect.width, mapRect.height);
    ctx.clip();
    ctx.fillStyle = "rgba(143, 249, 242, 0.08)";
    ctx.fillRect(viewRect.x, viewRect.y, viewRect.width, viewRect.height);
    ctx.strokeStyle = "#f4ffff";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(143, 249, 242, 0.55)";
    ctx.shadowBlur = 4;
    ctx.strokeRect(viewRect.x, viewRect.y, viewRect.width, viewRect.height);
    ctx.restore();
  }
  // Keep the square map boundary readable even when unexplored fog makes the
  // terrain and the letterboxed radar background nearly the same color.
  ctx.strokeStyle = "rgba(143, 249, 242, 0.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    mapRect.x + 0.5,
    mapRect.y + 0.5,
    Math.max(0, mapRect.width - 1),
    Math.max(0, mapRect.height - 1),
  );
}

/** Show the axis-aligned map-space bounds of the isometric viewport on the minimap. */
export function minimapViewRect(
  view: { x: number; y: number }[],
  w: number,
  h: number,
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number; width: number; height: number } | null {
  if (view.length < 4) return null;
  const mapRect = minimapMapRect(w, h, mapWidth, mapHeight);
  const minTileX = Math.min(...view.map((point) => point.x));
  const maxTileX = Math.max(...view.map((point) => point.x));
  const minTileY = Math.min(...view.map((point) => point.y));
  const maxTileY = Math.max(...view.map((point) => point.y));
  const boundsWidth = maxTileX - minTileX;
  const boundsHeight = maxTileY - minTileY;
  // An isometric viewport's axis-aligned map bounds are always square, even
  // when the visible screen is a wide rectangle. Preserve the visible map
  // area while giving the radar window the same aspect ratio as the battlefield.
  const horizontalEdge = Math.hypot(view[1]!.x - view[0]!.x, view[1]!.y - view[0]!.y);
  const verticalEdge = Math.hypot(view[3]!.x - view[0]!.x, view[3]!.y - view[0]!.y);
  const viewportAspect =
    horizontalEdge > 0 && verticalEdge > 0
      ? (horizontalEdge / verticalEdge) * (TILE_W / TILE_H)
      : 1;
  const visibleMapArea = boundsWidth * boundsHeight;
  const widthTiles = Math.sqrt(visibleMapArea * viewportAspect);
  const heightTiles = Math.sqrt(visibleMapArea / viewportAspect);
  const width = (widthTiles / mapWidth) * mapRect.width;
  const height = (heightTiles / mapHeight) * mapRect.height;
  const centerTileX = (minTileX + maxTileX) / 2;
  const centerTileY = (minTileY + maxTileY) / 2;
  const centerX = mapRect.x + ((centerTileX + 0.5) / mapWidth) * mapRect.width;
  const centerY = mapRect.y + ((centerTileY + 0.5) / mapHeight) * mapRect.height;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}
