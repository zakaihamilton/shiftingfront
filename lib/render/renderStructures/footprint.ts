import { TILE_H, TILE_W, tileToScreen, type Camera } from "../../iso";
import type { SimState } from "../../types";

export function footprintPath(
  ctx: CanvasRenderingContext2D,
  _state: SimState,
  cam: Camera,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const top = tileToScreen(x, y, cam);
  ctx.beginPath();
  ctx.rect(
    top.x - (TILE_W / 2) * cam.zoom,
    top.y,
    w * TILE_W * cam.zoom,
    h * TILE_H * cam.zoom,
  );
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
