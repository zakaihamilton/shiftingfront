import type { Palette } from "../../types";
import type { UnitModel } from "./modelLoader";
import { draw3dModel } from "./modelRenderer";

export const TURRET_YAW_STEPS = 32;
// Keep a true zero-pitch center pose while still allowing a modest upward/downward range.
export const TURRET_PITCH_STEPS = 17;
export const TURRET_RECOIL_STEPS = 4;
export const TURRET_ZOOM_SCALE = 4;
const CACHE_LIMIT = 384;

type TurretRaster = {
  canvas: HTMLCanvasElement;
  originX: number;
  originY: number;
};

const cache = new Map<string, TurretRaster>();

export function turretYawStep(yaw: number): number {
  const twoPi = Math.PI * 2;
  const yawNorm = ((yaw % twoPi) + twoPi) % twoPi;
  return Math.round((yawNorm / twoPi) * TURRET_YAW_STEPS) % TURRET_YAW_STEPS;
}

export function turretRecoilStep(recoil: number): number {
  const clamped = Math.max(0, Math.min(1, recoil));
  return Math.round(clamped * (TURRET_RECOIL_STEPS - 1));
}

export function turretPitchStep(pitch: number): number {
  const clamped = Math.max(-0.6, Math.min(0.6, pitch));
  return Math.round(((clamped + 0.6) / 1.2) * (TURRET_PITCH_STEPS - 1));
}

export function turretZoomStep(zoom: number): number {
  return Math.max(1, Math.round(Math.max(0.25, zoom) * TURRET_ZOOM_SCALE));
}

export function turretRasterKey(
  palette: Palette | undefined,
  yaw: number,
  recoil: number,
  zoom: number,
  modelKind: string = "turret",
  barrelPitch = 0,
): string {
  const pal = palette ? `${palette.primary}:${palette.secondary}` : "";
  return `${modelKind}:${turretYawStep(yaw)}:${turretRecoilStep(recoil)}:${turretPitchStep(barrelPitch)}:${turretZoomStep(zoom)}:${pal}`;
}

export function quantizedTurretPose(yaw: number, recoil: number, zoom: number, barrelPitch = 0): {
  yaw: number;
  recoil: number;
  barrelPitch: number;
  scale: number;
} {
  const pitchStep = turretPitchStep(barrelPitch);
  return {
    yaw: (turretYawStep(yaw) / TURRET_YAW_STEPS) * Math.PI * 2,
    recoil: turretRecoilStep(recoil) / (TURRET_RECOIL_STEPS - 1),
    barrelPitch: (pitchStep / (TURRET_PITCH_STEPS - 1)) * 1.2 - 0.6,
    scale: turretZoomStep(zoom) / TURRET_ZOOM_SCALE,
  };
}

export function clearTurretRasterCache(): void {
  cache.clear();
}

export function turretRasterCacheSize(): number {
  return cache.size;
}

function retainRaster(key: string, raster: TurretRaster): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, raster);
}

export function drawCachedTurretModel(
  ctx: CanvasRenderingContext2D,
  model: UnitModel,
  screenX: number,
  screenY: number,
  scale: number,
  yawAngle: number,
  palette?: Palette,
  recoil = 0,
  barrelPitch = 0,
): void {
  if (typeof document === "undefined") {
    draw3dModel(ctx, model, screenX, screenY, scale, yawAngle, palette, { recoil, barrelPitch });
    return;
  }
  const key = turretRasterKey(palette, yawAngle, recoil, scale, model.kind, barrelPitch);
  let hit = cache.get(key);
  if (!hit) {
    const pose = quantizedTurretPose(yawAngle, recoil, scale, barrelPitch);
    const pad = Math.ceil(80 * pose.scale);
    const canvas = document.createElement("canvas");
    canvas.width = pad * 2;
    canvas.height = pad * 2;
    const off = canvas.getContext("2d");
    if (!off) {
      draw3dModel(ctx, model, screenX, screenY, scale, yawAngle, palette, { recoil, barrelPitch });
      return;
    }
    draw3dModel(off, model, pad, pad, pose.scale, pose.yaw, palette, {
      recoil: pose.recoil,
      barrelPitch: pose.barrelPitch,
    });
    hit = { canvas, originX: pad, originY: pad };
    retainRaster(key, hit);
  }
  ctx.drawImage(hit.canvas, screenX - hit.originX, screenY - hit.originY);
}
