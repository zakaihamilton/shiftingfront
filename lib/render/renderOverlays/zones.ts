import { missionUsesObjectiveZone, OBJECTIVE_ZONE_RADIUS, RESCUE_CONTACT_RADIUS } from "../../types";
import { selectionPulse } from "../anim";
import { TILE_H, TILE_W, tileToScreen, type Camera } from "../../iso";
import { fogAt } from "../../sim/fog";
import type { SimState } from "../../types";

function drawZoneHalo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  z: number,
  timeMs: number,
  radius: number,
  color: string,
): void {
  const pulse = selectionPulse(timeMs);
  ctx.save();
  ctx.globalAlpha = 0.14 + pulse * 0.08;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(
    x,
    y + (TILE_H / 2) * z,
    radius * (TILE_W / 2) * z,
    radius * (TILE_H / 2) * z,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.globalAlpha = 0.8 + pulse * 0.2;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, 2.5 * z);
  ctx.shadowColor = color;
  ctx.shadowBlur = 7 * z;
  ctx.setLineDash([4 * z, 4 * z]);
  ctx.stroke();
  ctx.restore();
}

export function drawRescueHalo(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, timeMs: number): void {
  drawZoneHalo(ctx, x, y, z, timeMs, RESCUE_CONTACT_RADIUS, "#67e0d0");
}

export function drawObjectiveZone(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  timeMs: number,
  heightAt: (state: SimState, x: number, y: number) => number,
): void {
  for (const challenge of state.runtime?.secondary ?? []) {
    if (challenge.priority !== "optional" || !challenge.zone || challenge.completed) continue;
    const point = tileToScreen(challenge.zone.x, challenge.zone.y, cam, heightAt(state, Math.round(challenge.zone.x), Math.round(challenge.zone.y)));
    drawZoneHalo(ctx, point.x, point.y, cam.zoom, timeMs, challenge.radius ?? 3, "#e8c86a");
  }
  const runtime = state.runtime;
  const zone = runtime?.zone;
  if (!zone || !missionUsesObjectiveZone(runtime?.kind)) return;
  if (runtime.kind === "escort" && fogAt(state, Math.round(zone.x), Math.round(zone.y)) === 0) return;
  const s = tileToScreen(zone.x, zone.y, cam, heightAt(state, Math.round(zone.x), Math.round(zone.y)));
  drawZoneHalo(ctx, s.x, s.y, cam.zoom, timeMs, OBJECTIVE_ZONE_RADIUS, "#e8c86a");
}
