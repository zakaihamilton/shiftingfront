import { TILE_H, TILE_W, tileToScreen, type Camera } from "../../iso";
import { heightAt } from "../../sim/world";
import type { SimState } from "../../types";

export function footprintPath(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const e0 = heightAt(state, Math.round(x), Math.round(y));
  const e1 = heightAt(state, Math.min(state.width - 1, Math.round(x + w - 1)), Math.round(y));
  const e2 = heightAt(state, Math.min(state.width - 1, Math.round(x + w - 1)), Math.min(state.height - 1, Math.round(y + h - 1)));
  const e3 = heightAt(state, Math.round(x), Math.min(state.height - 1, Math.round(y + h - 1)));
  const top = tileToScreen(x, y, cam, e0);
  const right = tileToScreen(x + w, y, cam, e1);
  const bot = tileToScreen(x + w, y + h, cam, e2);
  const left = tileToScreen(x, y + h, cam, e3);
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(right.x + (TILE_W / 2) * cam.zoom, right.y + (TILE_H / 2) * cam.zoom);
  ctx.lineTo(bot.x, bot.y + TILE_H * cam.zoom);
  ctx.lineTo(left.x - (TILE_W / 2) * cam.zoom, left.y + (TILE_H / 2) * cam.zoom);
  ctx.closePath();
}

export function strokeFootprint(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  footprintPath(ctx, state, cam, x, y, w, h);
  ctx.stroke();
}
