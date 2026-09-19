import { BUILDING_STATS, isAirUnit, UNIT_STATS } from "../../catalog";
import { animClock, facingVector } from "../anim";
import { tileToScreen, type Camera } from "../../iso";
import { entityElev } from "../renderPicking";
import { turretAimMap, turretTargetInRange, turretTargetPoint } from "../renderStructures";
import { distToEntity } from "../../sim/world";
import { isBuildingEntity, type Entity, type Facing, type SimState, type UnitKind } from "../../types";

export function drawCombatProjectiles(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  drawList: Entity[],
  entityById: Map<number, Entity>,
  facingFor: (state: SimState, e: Entity) => Facing,
  clockMs?: number,
): void {
  const z = cam.zoom;
  const t = animClock(state.tick, clockMs);
  for (const e of drawList) {
    if (e.attackTarget === undefined || e.cooldown <= 0) continue;
    const target = entityById.get(e.attackTarget);
    if (!target || target.hp <= 0) continue;
    const buildingCombat = isBuildingEntity(e) ? BUILDING_STATS[e.kind].combat : undefined;
    const isTurret = buildingCombat !== undefined;
    if (isTurret && !turretTargetInRange(e, target)) continue;
    if (e.class === "unit") {
      const range = UNIT_STATS[e.kind as UnitKind].range;
      // Combat can leave a target assigned while the unit is chasing it, or
      // for the death/cleanup frame. Never render that stale lock as a
      // screen-spanning projectile.
      if (range <= 0 || target.owner === e.owner || target.neutral || distToEntity(e, target) > range) continue;
    }
    const maxCooldown = e.class === "unit" ? UNIT_STATS[e.kind as UnitKind].cooldown : buildingCombat?.cooldown ?? 0;
    if (maxCooldown <= 0 || e.cooldown < maxCooldown - 3) continue;
    const facing = facingFor(state, e);
    const dir = facingVector(facing);
    const a = tileToScreen(e.x, e.y, cam, entityElev(state, e));
    const targetPoint = isTurret ? turretTargetPoint(e, target) : { x: target.x, y: target.y };
    const b = tileToScreen(targetPoint.x, targetPoint.y, cam, entityElev(state, target));
    const age = maxCooldown - e.cooldown;
    const u = Math.max(0, Math.min(1, (age + (t % 80) / 80) / 2.4));
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
      const muzzle = e.class === "building" ? 18 : e.kind === "infantry" ? 14 : 20;
      ax = a.x + dir.x * muzzle * z;
      ay = a.y + 6 * z + dir.y * muzzle * z;
    }
    const bx = b.x;
    const by = b.y + 9 * z;
    const px = ax + (bx - ax) * u;
    const py = ay + (by - ay) * u;
    const anti = e.kind === "antiArmor" || e.kind === "antiAirTurret";
    const airStrike = e.class === "unit" && isAirUnit(e.kind);
    const heavy = e.kind === "tank" || e.kind === "turret" || e.kind === "antiAirTurret";
    const coreWidth = Math.max(1, Math.round(z * (heavy ? 3 : anti ? 2 : 1)));
    const glowWidth = coreWidth + Math.max(2, Math.round((heavy ? 5 : 3) * z));
    const coreColor = airStrike ? "#ffcc72" : anti ? "#ff8b3d" : heavy ? "#ffe08a" : "#f6d06c";
    const glowColor = airStrike ? "rgba(255, 185, 76, 0.36)" : anti ? "rgba(255, 90, 40, 0.32)" : "rgba(255, 213, 106, 0.34)";
    ctx.save();
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.55 + (1 - u) * 0.35;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = glowWidth;
    ctx.beginPath();
    ctx.moveTo(Math.round(ax), Math.round(ay));
    ctx.lineTo(Math.round(px), Math.round(py));
    ctx.stroke();
    ctx.strokeStyle = coreColor;
    ctx.lineWidth = coreWidth;
    ctx.beginPath();
    ctx.moveTo(Math.round(ax), Math.round(ay));
    ctx.lineTo(Math.round(px), Math.round(py));
    ctx.stroke();
    if (anti) {
      for (let i = 1; i <= 3; i++) {
        const trail = Math.max(0, u - i * 0.045);
        const tx = ax + (bx - ax) * trail;
        const ty = ay + (by - ay) * trail;
        ctx.globalAlpha = 0.22 * (1 - i / 4);
        ctx.fillStyle = "#9aa09a";
        ctx.beginPath();
        ctx.ellipse(tx, ty, (2 + i) * z, (1.2 + i * 0.55) * z, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 0.55 + (1 - u) * 0.35;
    ctx.fillStyle = heavy ? "#fff4c4" : "#fff0a0";
    const shell = heavy ? 5 : 3;
    ctx.fillRect(Math.round(px - shell / 2), Math.round(py - shell / 2), shell, shell);
    if (age < 1) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#fff8d0";
      ctx.beginPath();
      ctx.arc(ax, ay, Math.max(2, 3 * z), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = anti ? "#ff8b3d" : "#fff4c4";
      ctx.lineWidth = Math.max(1, z);
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 + facing * 0.3;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + Math.cos(ang) * 8 * z, ay + Math.sin(ang) * 5 * z);
        ctx.stroke();
      }
    }
    if (u > 0.72) {
      const burst = (u - 0.72) / 0.28;
      ctx.globalAlpha = 0.85 * (1 - burst);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + e.id;
        const rad = (4 + burst * 10) * z;
        ctx.fillStyle = i % 2 ? "#ffe08a" : "#a54b25";
        ctx.fillRect(
          Math.round(bx + Math.cos(ang) * rad - 2),
          Math.round(by + Math.sin(ang) * rad * 0.5 - 2),
          Math.max(2, 3 * z),
          Math.max(2, 3 * z),
        );
      }
    }
    ctx.restore();
  }
}
