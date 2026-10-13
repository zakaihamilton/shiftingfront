import { UNIT_VEHICLE_LAYERS, type VehiclePart } from "../gen/unitAnimationAssets";
import { unitViewForFacing } from "../gen/visualAssets";
import { isoHeadingAngle, screenAngleToFacing } from "../iso";
import type { Facing, SpriteSpec } from "../types";
import { drawBlendedUnitSprites, type UnitSpriteLayer } from "./unitSpriteBlend";
import { unitFacingLayers } from "./unitFacingBlend";
import { isRasterReady, rasterize } from "./sprites";
import { litUnitRaster } from "./unitLighting";
import type { TerrainLightRig } from "./terrainLighting";

export const unitWeaponSockets = new Map<number, { x: number; y: number }>();
export function vehicleTurretFacing(yaw: number): Facing {
  const heading = yaw + Math.PI / 4;
  return screenAngleToFacing(isoHeadingAngle(Math.cos(heading), Math.sin(heading)));
}
export function vehiclePartSpec(base: SpriteSpec, source: string): SpriteSpec {
  return { ...base, id: `vehicle-part:${source}:${base.imageTint}`, w: base.w, h: base.w,
    anchorX: base.w / 2, anchorY: base.w / 2, imageAnchorX: 0.5, imageAnchorY: 0.5,
    imageSrc: source, imageCrop: undefined, imageTextureSrc: undefined, rotation: undefined };
}

/** Separate authored views preserve perspective while the hull and weapons aim independently. */
export function drawLayeredVehicle(ctx: CanvasRenderingContext2D, options: {
  id: number; kind: "tank" | "behemoth"; base: SpriteSpec; hullFacing: Facing; turretYaw: number;
  x: number; groundY: number; zoom: number; time: number; alpha: number; recoil: number;
  reducedMotion: boolean; rig: TerrainLightRig; flash: number;
  travel?: number; moving?: boolean;
}): boolean {
  const { id, kind, base, hullFacing, turretYaw, x, groundY, zoom, time, alpha, recoil, reducedMotion, rig, flash } = options;
  const turretFacing = vehicleTurretFacing(turretYaw), art = UNIT_VEHICLE_LAYERS[kind];
  const ready = (facing: Facing, parts: VehiclePart[]) => parts.map(part => {
    const spec = vehiclePartSpec(base, art[unitViewForFacing(facing)][part]);
    rasterize(spec); return isRasterReady(spec);
  }).every(Boolean);
  if (!ready(hullFacing, ["hull"]) || !ready(turretFacing, ["turret", "barrel"])) {
    unitWeaponSockets.delete(id); return false;
  }
  const hulls = unitFacingLayers(id, hullFacing, time, 140, true, reducedMotion);
  const turrets = unitFacingLayers(-id - 1, turretFacing, time, 110, true, reducedMotion);
  // A transition can come from the full-sprite fallback, whose facing was ready
  // before its articulated parts loaded. Never cache lighting from empty parts.
  const hullsReady = hulls.map(layer => ready(layer.facing, ["hull"])).every(Boolean);
  const turretsReady = turrets.map(layer => ready(layer.facing, ["turret", "barrel"])).every(Boolean);
  if (!hullsReady || !turretsReady) {
    unitWeaponSockets.delete(id); return false;
  }
  const size = base.w * zoom;
  const canvasSize = base.w * 2;
  const inset = Math.max(1, Math.round(canvasSize * 0.025)) / canvasSize;
  const point = (p: readonly number[]) => ({ x: (inset + p[0]! / 512 * (1 - inset * 2)) * size,
    y: (inset + p[1]! / 512 * (1 - inset * 2)) * size });
  const hullOrigin = { x: x - size / 2, y: groundY - point([256, 475]).y };
  const weighted = (layers: typeof hulls, key: "mount" | "socket" | "muzzle") => layers.reduce((p, layer) => {
    const a = point(art[unitViewForFacing(layer.facing)][key]);
    return { x: p.x + a.x * layer.weight, y: p.y + a.y * layer.weight };
  }, { x: 0, y: 0 });
  const mount = weighted(hulls, "mount"), socket = weighted(turrets, "socket"), muzzle = weighted(turrets, "muzzle");
  const turretPivot = point([256, 300]), barrelPivot = point([256, 256]);
  const turretOrigin = { x: hullOrigin.x + mount.x - turretPivot.x, y: hullOrigin.y + mount.y - turretPivot.y };
  const angle = turretYaw + Math.PI / 4;
  const heading = isoHeadingAngle(Math.cos(angle), Math.sin(angle));
  const barrelOrigin = { x: turretOrigin.x + socket.x - barrelPivot.x - Math.cos(heading) * recoil * 3 * zoom,
    y: turretOrigin.y + socket.y - barrelPivot.y - Math.sin(heading) * recoil * 1.5 * zoom };
  const draw = (part: VehiclePart, layers: typeof hulls, origin: { x: number; y: number }) => {
    const sprites: UnitSpriteLayer[] = layers.map(layer => {
      const spec = vehiclePartSpec(base, art[unitViewForFacing(layer.facing)][part]);
      const gear = part === "hull" && options.moving && !reducedMotion
        ? { phase: (options.travel ?? 0) * 3, tracked: true, side: layer.facing === 0 || layer.facing === 4 } : undefined;
      return { spec, img: litUnitRaster(rasterize(spec), rig, flash, gear), weight: layer.weight };
    });
    drawBlendedUnitSprites(ctx, sprites, origin.x, origin.y, size, size, alpha);
  };
  draw("hull", hulls, hullOrigin);
  if (turretFacing >= 5) { draw("barrel", turrets, barrelOrigin); draw("turret", turrets, turretOrigin); }
  else { draw("turret", turrets, turretOrigin); draw("barrel", turrets, barrelOrigin); }
  const p = { x: barrelOrigin.x + muzzle.x, y: barrelOrigin.y + muzzle.y };
  const t = ctx.getTransform();
  unitWeaponSockets.set(id, { x: t.a * p.x + t.c * p.y + t.e, y: t.b * p.x + t.d * p.y + t.f });
  return true;
}
export function clearUnitWeaponSockets(): void { unitWeaponSockets.clear(); }
