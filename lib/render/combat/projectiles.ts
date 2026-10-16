import { BUILDING_STATS, UNIT_STATS, ammoEffectForWeapon } from "../../catalog";
import { animClock, facingVector } from "../anim";
import { tileToScreen, type Camera } from "../../iso";
import { entityElev } from "../renderPicking";
import { turretAimMap, turretTargetInRange, turretTargetPoint } from "../renderStructures";
import { distToEntity } from "../../sim/world";
import { isBuildingEntity, isUnitEntity, type AmmoEffect, type Entity, type Facing, type SimState } from "../../types";
import type { FxBurst } from "../fx";
import { unitWeaponSockets } from "../unitVehicleLayers";

const launchOffsets = new WeakMap<FxBurst, { x: number; y: number }>();

function ammoEffectFor(entity: Entity): AmmoEffect {
  if (isBuildingEntity(entity)) {
    const stats = BUILDING_STATS[entity.kind];
    return stats.ammoEffect ?? ammoEffectForWeapon(stats.weapon ?? "cannon");
  }
  if (isUnitEntity(entity)) {
    const stats = UNIT_STATS[entity.kind];
    return stats.ammoEffect ?? ammoEffectForWeapon(stats.weapon);
  }
  return "shell";
}

function flightDuration(effect: AmmoEffect, distance: number): number {
  if (effect === "bullet") return 1.2 + Math.min(0.4, distance * 0.04);
  if (effect === "missile") return 4.4 + Math.min(1.5, distance * 0.16);
  if (effect === "bomb") return 3.3 + Math.min(1.1, distance * 0.12);
  if (effect === "beam") return 2.4;
  return 2.4 + Math.min(0.8, distance * 0.08);
}

function drawProjectile(
  ctx: CanvasRenderingContext2D,
  effect: AmmoEffect,
  x: number,
  y: number,
  angle: number,
  originX: number,
  originY: number,
  progress: number,
  zoom: number,
  alpha: number,
): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const scale = Math.max(0.72, zoom);

  ctx.save();
  ctx.globalAlpha = alpha;

  if (effect === "bullet") {
    const trail = (8 + progress * 8) * zoom;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(255, 212, 125, 0.62)";
    ctx.lineWidth = Math.max(1, 1.2 * zoom);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - c * trail, y - s * trail);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = "#fff4c2";
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(1.2, 2 * zoom), Math.max(1, 1.25 * zoom), angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (effect === "beam") {
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(89, 225, 255, 0.3)";
    ctx.lineWidth = Math.max(3, 7 * zoom);
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.strokeStyle = "#b9f5ff";
    ctx.lineWidth = Math.max(1, 2 * zoom);
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.translate(x, y);
  ctx.rotate(angle);

  if (effect === "missile") {
    ctx.globalCompositeOperation = "source-over";
    // Short smoke puffs follow the rocket, replacing the old battlefield-long laser line.
    for (let i = 1; i <= 4; i++) {
      const back = 5 + i * 5;
      ctx.globalAlpha = alpha * (0.32 - i * 0.045);
      ctx.fillStyle = i % 2 ? "#737b78" : "#a5a8a0";
      ctx.beginPath();
      ctx.ellipse(-back * scale, Math.sin(progress * 8 + i) * scale, (2.1 + i * 0.55) * scale, (1.5 + i * 0.35) * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(255, 113, 42, 0.8)";
    ctx.beginPath();
    ctx.moveTo(-2 * scale, -2.4 * scale);
    ctx.lineTo(-11 * scale, 0);
    ctx.lineTo(-2 * scale, 2.4 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#c9ceca";
    ctx.beginPath();
    ctx.moveTo(-5 * scale, -2.2 * scale);
    ctx.lineTo(3.4 * scale, -1.5 * scale);
    ctx.lineTo(6 * scale, 0);
    ctx.lineTo(3.4 * scale, 1.5 * scale);
    ctx.lineTo(-5 * scale, 2.2 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff0b0";
    ctx.fillRect(2 * scale, -0.55 * scale, 2.4 * scale, 1.1 * scale);
    ctx.restore();
    return;
  }

  if (effect === "bomb") {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(22, 29, 30, 0.24)";
    ctx.beginPath();
    ctx.ellipse(0, 5 * scale, 5 * scale, 1.8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#46504d";
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.5 * scale, 2.25 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#bdc2b3";
    ctx.fillRect(-2.8 * scale, -1.2 * scale, 3.2 * scale, 0.75 * scale);
    ctx.fillStyle = "#d58a4a";
    ctx.beginPath();
    ctx.moveTo(-5 * scale, 0);
    ctx.lineTo(-7.4 * scale, -1.6 * scale);
    ctx.lineTo(-6.7 * scale, 0);
    ctx.lineTo(-7.4 * scale, 1.6 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }

  // Shells retain a compact tracer and a hot, rounded projectile head.
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(255, 159, 70, 0.42)";
  ctx.lineWidth = Math.max(2, 4 * zoom);
  ctx.beginPath();
  ctx.moveTo(-13 * scale, 0);
  ctx.lineTo(-3 * scale, 0);
  ctx.stroke();
  ctx.fillStyle = "#ffb34d";
  ctx.beginPath();
  ctx.ellipse(0, 0, 3.3 * scale, 2.5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff2bd";
  ctx.beginPath();
  ctx.arc(1.2 * scale, 0, 1.15 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draws each shot from its launch-time source and target snapshot. */
export function drawCombatProjectileBursts(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  fx: FxBurst[] | undefined,
  nowMs: number,
): void {
  if (!fx?.length) return;
  const z = cam.zoom;
  for (const burst of fx) {
    const duration = burst.projectileDurationMs;
    if (
      burst.kind !== "muzzle" ||
      duration === undefined ||
      burst.sourceX === undefined ||
      burst.sourceY === undefined ||
      burst.targetX === undefined ||
      burst.targetY === undefined
    ) continue;
    const age = nowMs - burst.bornMs;
    if (age < 0 || age >= duration) continue;
    const progress = Math.max(0, Math.min(1, age / duration));
    const source = tileToScreen(burst.sourceX, burst.sourceY, cam, burst.sourceElev ?? burst.elev);
    const target = tileToScreen(burst.targetX, burst.targetY, cam, burst.targetElev ?? burst.elev);
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.001) continue;

    let ax: number;
    let ay: number;
    if (burst.entityKind === "turret" || burst.entityKind === "antiAirTurret") {
      const mountX = source.x + 1.67 * z;
      const mountY = source.y + 15.34 * z;
      const aim = Math.atan2(target.y + 6 * z - mountY, target.x - mountX);
      ax = mountX + Math.cos(aim) * 24 * z;
      ay = mountY + Math.sin(aim) * 24 * z;
    } else {
      const muzzle = burst.entityKind === "infantry" ? 14 : burst.entityKind === "behemoth" ? 28 : burst.entityClass === "building" ? 18 : 20;
      ax = source.x + dx / distance * muzzle * z;
      ay = source.y + 6 * z + dy / distance * muzzle * z;
    }

    // Preserve the authored muzzle at launch, then keep the shot's source fixed
    // even when its firing unit moves or the camera pans and zooms.
    let offset = launchOffsets.get(burst);
    if (!offset) {
      const socket = burst.sourceEntityId !== undefined ? unitWeaponSockets.get(burst.sourceEntityId) : undefined;
      offset = { x: ((socket?.x ?? ax) - source.x) / z, y: ((socket?.y ?? ay) - source.y) / z };
      launchOffsets.set(burst, offset);
    }
    ax = source.x + offset.x * z;
    ay = source.y + offset.y * z;

    const bx = target.x;
    const by = target.y + 9 * z;
    const px = ax + (bx - ax) * progress;
    const py = ay + (by - ay) * progress;
    const angle = Math.atan2(by - ay, bx - ax);
    const effect = burst.ammoEffect ?? ammoEffectForWeapon(burst.weapon ?? "cannon");
    drawProjectile(ctx, effect, px, py, angle, ax, ay, progress, z, 0.55 + (1 - progress) * 0.35);
  }
}

export function drawCombatProjectiles(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  drawList: Entity[],
  entityById: Map<number, Entity>,
  facingFor: (state: SimState, e: Entity) => Facing,
  clockMs?: number,
  projectileBursts?: FxBurst[],
): void {
  if (projectileBursts !== undefined) {
    drawCombatProjectileBursts(ctx, cam, projectileBursts, clockMs ?? animClock(state.tick));
    return;
  }
  const z = cam.zoom;
  const t = animClock(state.tick, clockMs);
  const tickProgress = (t % 80) / 80;
  for (const e of drawList) {
    if (e.attackTarget === undefined || e.cooldown <= 0) continue;
    const target = entityById.get(e.attackTarget);
    if (!target || target.hp <= 0) continue;
    const buildingCombat = isBuildingEntity(e) ? BUILDING_STATS[e.kind].combat : undefined;
    const isTurret = buildingCombat !== undefined;
    if (isTurret && !turretTargetInRange(e, target)) continue;
    if (isUnitEntity(e)) {
      const range = UNIT_STATS[e.kind].range;
      // Combat can leave a target assigned while the unit is chasing it, or
      // for the death/cleanup frame. Never render a stale lock as a projectile.
      if (range <= 0 || target.owner === e.owner || target.neutral || distToEntity(e, target) > range) continue;
    }
    const maxCooldown = isUnitEntity(e) ? UNIT_STATS[e.kind].cooldown : buildingCombat?.cooldown ?? 0;
    if (maxCooldown <= 0) continue;

    const effect = ammoEffectFor(e);
    const age = maxCooldown - e.cooldown;
    const a = tileToScreen(e.x, e.y, cam, entityElev(state, e));
    const targetPoint = isTurret ? turretTargetPoint(e, target) : { x: target.x, y: target.y };
    const b = tileToScreen(targetPoint.x, targetPoint.y, cam, entityElev(state, target));
    const distance = Math.hypot(target.x - e.x, target.y - e.y);
    const duration = flightDuration(effect, distance);
    // Cooldowns advance in whole ticks, so keep the endpoint visible through
    // the first rendered frame after a fractional travel duration.
    if (age > Math.ceil(duration)) continue;
    const u = Math.max(0, Math.min(1, (age + tickProgress) / duration));
    let ax: number;
    let ay: number;
    if (isTurret) {
      const aim = turretAimMap.get(e.id);
      const mountX = a.x + 1.67 * z;
      const mountY = a.y + 15.34 * z;
      const angle = aim ? aim.angle : Math.atan2(b.y + 6 * z - mountY, b.x - mountX);
      ax = mountX + Math.cos(angle) * 24 * z;
      ay = mountY + Math.sin(angle) * 24 * z;
    } else {
      const dir = facingVector(facingFor(state, e));
      const muzzle = e.kind === "infantry" ? 14 : e.kind === "behemoth" ? 28 : 20;
      ax = a.x + dir.x * muzzle * z;
      ay = a.y + 6 * z + dir.y * muzzle * z;
      const socket = unitWeaponSockets.get(e.id);
      if (socket) { ax = socket.x; ay = socket.y; }
    }
    const bx = b.x;
    const by = b.y + 9 * z;
    const px = ax + (bx - ax) * u;
    const py = ay + (by - ay) * u;
    const angle = Math.atan2(by - ay, bx - ax);
    drawProjectile(ctx, effect, px, py, angle, ax, ay, u, z, 0.55 + (1 - u) * 0.35);
  }
}
