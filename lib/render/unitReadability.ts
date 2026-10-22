import type { ColorblindMode } from "../persist/settings";
import type { Entity, Owner } from "../types";
import { iffColors } from "./iff";

/** Small role marks remain readable when authored infantry occupy few pixels. */
export function drawInfantryMarker(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  x: number,
  y: number,
  zoom: number,
  alpha: number,
  viewOwner: Owner,
  mode?: ColorblindMode,
): void {
  const size = Math.max(0.8, Math.min(1.3, zoom));
  ctx.save();
  ctx.translate(x, y + 3 * size);
  ctx.scale(size, size);
  ctx.globalAlpha = alpha * 0.85;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (entity.kind === "medic") {
    ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0);
    ctx.moveTo(0, -2.5); ctx.lineTo(0, 2.5);
  } else if (entity.kind === "antiArmor") {
    ctx.moveTo(-3, 1); ctx.lineTo(0, -1.5); ctx.lineTo(3, 1);
  } else {
    ctx.moveTo(-3, 0); ctx.lineTo(3, 0);
  }
  // A dark surround protects the mark against bright ore and paved ground.
  ctx.strokeStyle = "#071017";
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.strokeStyle = iffColors(entity.owner, entity.neutral, mode, viewOwner).hex;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}
