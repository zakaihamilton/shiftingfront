import { BUILDING_STATS, footprintOf } from "../../catalog";
import { tileToScreen, type Camera } from "../../iso";
import { lerpAngle } from "../gl/glMath";
import { isBuildingEntity, type Entity, type SimState } from "../../types";
import { iffColors } from "../iff";
import { entityElev } from "../renderPicking";
import { buildAntiAirTurretModel, buildTurretHeadModel, type UnitModel } from "../gl/modelLoader";
import { drawCachedTurretModel } from "../gl/turretRaster";
import { distToEntity } from "../../sim/world";

export const turretAimMap = new Map<number, { angle: number; lastMs: number }>();
export const TURRET_WEAPON_RANGE = 5.5;
/** Clearly visible upward elevation for anti-air barrels while tracking aircraft. */
export const ANTI_AIR_BARREL_PITCH = 0.34;

function turretRange(turret: Entity): number {
  return isBuildingEntity(turret) ? BUILDING_STATS[turret.kind].combat?.range ?? TURRET_WEAPON_RANGE : TURRET_WEAPON_RANGE;
}

/**
 * Render locks only while the target is a valid nearby enemy. Combat can leave
 * an attackTarget set for a frame while a target moves out of range; drawing
 * that stale lock makes the laser stretch across the battlefield.
 */
export function turretTargetInRange(turret: Entity, target: Entity): boolean {
  return turret.class === "building" &&
    (turret.kind === "turret" || turret.kind === "antiAirTurret") &&
    target.hp > 0 &&
    target.owner !== turret.owner &&
    !target.neutral &&
    distToEntity(turret, target) <= turretRange(turret);
}

/** Aim at the nearest cell of a building footprint instead of its top-left corner. */
export function turretTargetPoint(turret: Entity, target: Entity): { x: number; y: number } {
  if (!isBuildingEntity(target)) return { x: target.x, y: target.y };
  const footprint = footprintOf(target.kind);
  return {
    x: Math.max(target.x, Math.min(target.x + footprint.w - 1, turret.x)),
    y: Math.max(target.y, Math.min(target.y + footprint.h - 1, turret.y)),
  };
}

export function clearTurretAimCache(): void {
  turretAimMap.clear();
}

export function pruneTurretAimCache(liveIds: Iterable<number>): void {
  const live = liveIds instanceof Set ? liveIds : new Set(liveIds);
  for (const id of turretAimMap.keys()) {
    if (!live.has(id)) turretAimMap.delete(id);
  }
}

const cachedTurretModels = new Map<"turret" | "antiAirTurret", UnitModel>();
export function getTurretModel(kind: "turret" | "antiAirTurret" = "turret"): UnitModel {
  const cached = cachedTurretModels.get(kind);
  if (cached) return cached;
  const model = kind === "antiAirTurret" ? buildAntiAirTurretModel() : buildTurretHeadModel();
  cachedTurretModels.set(kind, model);
  return model;
}

export function drawTurretCannon(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  s: { x: number; y: number },
  z: number,
  state: SimState,
  cam: Camera,
  timeMs: number,
  targetEntity?: Entity,
  colorblindMode: import("../../persist/settings").ColorblindMode = "none",
): void {
  if (e.hp <= 0 || e.constructing > 0 || e.class !== "building" || (e.kind !== "turret" && e.kind !== "antiAirTurret")) return;
  const target = targetEntity && turretTargetInRange(e, targetEntity) ? targetEntity : undefined;
  const targetPoint = target ? turretTargetPoint(e, target) : undefined;

  const mountX = s.x + 1.67 * z;
  const mountY = s.y + 15.34 * z;

  let targetAngle: number;
  if (target && targetPoint) {
    const b = tileToScreen(targetPoint.x, targetPoint.y, cam, entityElev(state, target));
    const targetY = b.y + 6 * z;
    targetAngle = Math.atan2(targetY - mountY, b.x - mountX);
  } else {
    const sweep = Math.sin(timeMs * 0.0012 + e.id * 1.7) * 0.55;
    targetAngle = (e.owner === 0 ? Math.PI * 0.25 : -Math.PI * 0.75) + sweep;
  }

  let aim = turretAimMap.get(e.id);
  if (!aim) {
    aim = { angle: targetAngle, lastMs: timeMs };
    turretAimMap.set(e.id, aim);
  }
  const dt = Math.max(0.001, Math.min(0.1, (timeMs - aim.lastMs) * 0.001));
  aim.lastMs = timeMs;
  aim.angle = lerpAngle(aim.angle, targetAngle, Math.min(1, dt * 10.0));

  const angle = aim.angle;
  const barrelPitch = e.kind === "antiAirTurret" ? ANTI_AIR_BARREL_PITCH : 0;
  const cooldown = BUILDING_STATS[e.kind].combat?.cooldown ?? 14;
  const isFiring = e.cooldown >= Math.max(1, cooldown - 3);
  const recoil = isFiring ? ((e.cooldown - (cooldown - 3)) / 3) * 3 * z : 0;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const iff = iffColors(e.owner, false, colorblindMode);
  ctx.save();

  if (target && targetPoint) {
    const b = tileToScreen(targetPoint.x, targetPoint.y, cam, entityElev(state, target));
    const muzzleX = mountX + cos * (24 * z - recoil);
    const muzzleY = mountY + sin * (24 * z - recoil);
    ctx.strokeStyle = iff.laser;
    ctx.lineWidth = Math.max(1, 1.2 * z);
    ctx.setLineDash([4 * z, 4 * z]);
    ctx.beginPath();
    ctx.moveTo(muzzleX, muzzleY);
    ctx.lineTo(b.x, b.y + 6 * z);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = iff.hex;
    ctx.beginPath();
    ctx.arc(b.x, b.y + 6 * z, 2 * z, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.fillStyle = "rgba(8, 12, 16, 0.55)";
  ctx.beginPath();
  ctx.ellipse(mountX - 0.5 * z, mountY + 0.5 * z, 14 * z, 7.2 * z, 0, 0, Math.PI * 2);
  ctx.fill();

  const shadowOffsetX = -cos * 2.5 * z + 1.2 * z;
  const shadowOffsetY = -sin * 1.2 * z + 2.0 * z;
  ctx.fillStyle = "rgba(6, 9, 12, 0.35)";
  ctx.beginPath();
  ctx.ellipse(mountX + shadowOffsetX, mountY + shadowOffsetY, 11 * z, 5.5 * z, angle - Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const pal = state.factions[e.owner]?.palette ?? state.factions[0]?.palette;
  const model = getTurretModel(e.kind);
  const recoilRatio = isFiring ? (e.cooldown - (cooldown - 3)) / 3 : 0;
  drawCachedTurretModel(ctx, model, mountX, mountY - 3 * z, z, angle - Math.PI / 4, pal, recoilRatio, barrelPitch);

  const forwardDist = 26 * z - recoil;
  const pitchLift = Math.sin(barrelPitch) * 16 * z;
  const barrelSpread = 2.4 * z;
  const perpX = -sin * barrelSpread;
  const perpY = cos * barrelSpread * 0.5;

  const muzzleLX = mountX + cos * forwardDist + perpX;
  const muzzleLY = mountY + sin * forwardDist + perpY - 3 * z - pitchLift;
  const muzzleRX = mountX + cos * forwardDist - perpX;
  const muzzleRY = mountY + sin * forwardDist - perpY - 3 * z - pitchLift;

  if (target && target.hp > 0) {
    const b = tileToScreen(target.x, target.y, cam, entityElev(state, target));
    const targetY = b.y + 6 * z;

    ctx.save();
    ctx.strokeStyle = iff.laser;
    ctx.lineWidth = Math.max(1, 1.2 * z);
    ctx.setLineDash([4 * z, 4 * z]);

    ctx.beginPath();
    ctx.moveTo(muzzleLX, muzzleLY);
    ctx.lineTo(b.x, targetY);
    ctx.moveTo(muzzleRX, muzzleRY);
    ctx.lineTo(b.x, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = iff.laserFill;
    ctx.beginPath();
    ctx.arc(b.x, targetY, 4.2 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = iff.hex;
    ctx.beginPath();
    ctx.arc(b.x, targetY, 2.5 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (isFiring) {
    ctx.save();
    const flashStage = (e.cooldown - 11) / 3;
    const flashR = (3.5 + flashStage * 3.5) * z;

    for (const [mx, my] of [[muzzleLX, muzzleLY], [muzzleRX, muzzleRY]]) {
      ctx.fillStyle = "rgba(255, 170, 40, 0.22)";
      ctx.beginPath();
      ctx.arc(mx, my, flashR * 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 170, 40, 0.4)";
      ctx.beginPath();
      ctx.arc(mx, my, flashR * 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff8d6";
      ctx.beginPath();
      ctx.arc(mx, my, flashR * 0.7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#ffe49e";
      ctx.lineWidth = Math.max(1, 1.5 * z);
      ctx.beginPath();
      ctx.moveTo(mx + perpX * 0.8, my + perpY * 0.8);
      ctx.lineTo(mx + perpX * 2.2 + cos * 3 * z, my + perpY * 2.2 + sin * 3 * z);
      ctx.moveTo(mx - perpX * 0.8, my - perpY * 0.8);
      ctx.lineTo(mx - perpX * 2.2 + cos * 3 * z, my - perpY * 2.2 + sin * 3 * z);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();
}
