import {
  buildingSprite,
} from "@/lib/gen/assets";
import { generateVisualProfile } from "@/lib/gen/visualProfile";
import { TILE_H, type Camera, tileToScreen } from "@/lib/iso";
import { rasterize } from "@/lib/render/sprites";
import { paintTerrainBlockers, paintTerrainSurface } from "@/lib/render/terrainPaint";
import type { AtlasWorld } from "@/lib/render/terrainAtlas";
import type { CinemaScene } from "./scene";

export function cinemaCamera(w: number, h: number, t: number): Camera {
  return {
    zoom: 0.92,
    x: w * 0.52 + Math.sin(t * 0.004) * 140,
    y: h * 0.08 + Math.cos(t * 0.0032) * 70,
  };
}

export function cinemaOrigin(w: number, h: number): { x: number; y: number } {
  return { x: w * 0.52, y: h * 0.08 };
}

export function cinemaGroundWorld(scene: CinemaScene): AtlasWorld {
  return scene.ground;
}

export function paintCinemaStatic(
  ctx: CanvasRenderingContext2D,
  scene: CinemaScene,
  cam: Camera,
): void {
  const { map, buildings, ground } = scene;
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";

  paintTerrainSurface(ctx, ground, cam);
  paintTerrainBlockers(ctx, ground, cam);

  const profile0 = generateVisualProfile(scene.seed, 0);
  const profile1 = generateVisualProfile(scene.seed, 1);
  for (const b of buildings) {
    const elev = map.heights[Math.floor(b.y) * map.width + Math.floor(b.x)] ?? 1;
    const s = tileToScreen(b.x, b.y, cam, elev);
    const pal = b.owner === 0 ? scene.us.palette : scene.them.palette;
    const spec = buildingSprite(b.kind, pal, { profile: b.owner === 0 ? profile0 : profile1 });
    const img = rasterize(spec);
    const ax = (spec.anchorX ?? spec.w / 2) * cam.zoom;
    const ay = (spec.anchorY ?? spec.h) * cam.zoom;
    ctx.drawImage(img, s.x - ax, s.y + (TILE_H / 2) * cam.zoom - ay, spec.w * cam.zoom, spec.h * cam.zoom);
  }
}
