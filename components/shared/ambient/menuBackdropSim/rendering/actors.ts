import { unitSprite } from "@/lib/gen/assets";
import { generateVisualProfile } from "@/lib/gen/visualProfile";
import { TILE_H, tileToScreen, toIsometricFacing, type Camera } from "@/lib/iso";
import { animFrame, unitMovementOffset, unitWalkCycle } from "@/lib/render/anim";
import { drawSprite, isRasterReady, rasterize } from "@/lib/render/sprites";
import { drawUnitShadow } from "@/lib/render/unitMotion";
import type { Facing } from "@/lib/types";
import type { Actor, CinemaScene } from "../scene";

export function actorFacing(actor: Actor): Facing {
  const dest = actor.waypoints[actor.wi]!;
  let dx = dest.x - actor.x;
  let dy = dest.y - actor.y;
  if (Math.hypot(dx, dy) < 0.05) {
    const next = actor.waypoints[(actor.wi + 1) % actor.waypoints.length]!;
    dx = next.x - actor.x;
    dy = next.y - actor.y;
  }
  return toIsometricFacing(dx, dy);
}

export function paintCinemaActor(
  ctx: CanvasRenderingContext2D,
  scene: CinemaScene,
  cam: Camera,
  actor: Actor,
  t: number,
  preview: boolean,
  profile0: ReturnType<typeof generateVisualProfile>,
  profile1: ReturnType<typeof generateVisualProfile>,
): void {
  const elev = scene.map.heights[Math.floor(actor.y) * scene.map.width + Math.floor(actor.x)] ?? 1;
  const s = tileToScreen(actor.x, actor.y, cam, elev);
  const pal = actor.owner === 0 ? scene.us.palette : scene.them.palette;
  const facing = preview ? actorFacing(actor) : 0;
  const isWalker = actor.kind === "infantry" || actor.kind === "antiArmor" || actor.kind === "medic";
  const walkCycle = preview && isWalker ? unitWalkCycle(actor.kind, t * 17) : undefined;
  const frame = walkCycle?.frame ?? (preview ? animFrame(t * 17, actor.kind === "antiArmor" ? 105 : 90, 4) : 0);
  const spec = unitSprite(actor.kind, pal, {
    profile: actor.owner === 0 ? profile0 : profile1,
    facing,
    animationFrame: frame,
    motion: preview ? "walk" : undefined,
  });
  const img = rasterize(spec);
  const frameBlend = walkCycle?.frameBlend ?? 1;
  const previousSpec = walkCycle && frameBlend < 1
    ? unitSprite(actor.kind, pal, {
        profile: actor.owner === 0 ? profile0 : profile1,
        facing,
        animationFrame: walkCycle.previousFrame,
        motion: "walk",
      })
    : undefined;
  const previousImg = previousSpec ? rasterize(previousSpec) : undefined;
  const ax = (spec.anchorX ?? spec.w / 2) * cam.zoom;
  const ay = (spec.anchorY ?? spec.h) * cam.zoom;
  const groundX = s.x;
  const groundY = s.y + (TILE_H / 2) * cam.zoom;
  if (preview) {
    drawUnitShadow(ctx, actor.kind, groundX, groundY, cam.zoom, 1, true);
  }
  const bob = walkCycle ? unitMovementOffset(actor.kind, frame, walkCycle.phase).bobY * cam.zoom : 0;
  const dx = s.x - ax;
  const dy = groundY - ay + bob;
  if (previousSpec && previousImg && isRasterReady(previousSpec) && frameBlend < 1) {
    ctx.globalAlpha = 1 - frameBlend;
    drawSprite(ctx, previousSpec, previousImg, dx, dy, spec.w * cam.zoom, spec.h * cam.zoom);
    ctx.globalAlpha = frameBlend;
    drawSprite(ctx, spec, img, dx, dy, spec.w * cam.zoom, spec.h * cam.zoom);
    ctx.globalAlpha = 1;
  } else {
    drawSprite(ctx, spec, img, dx, dy, spec.w * cam.zoom, spec.h * cam.zoom);
  }
}
