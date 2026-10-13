import { UNIT_STATS } from "../catalog";
import { distToEntity } from "../sim/world";
import { fogAt } from "../sim/fog";
import { isoHeadingAngle } from "../iso";
import type { Entity, SimState, UnitKind } from "../types";
import type { UnitAnim } from "./anim";
import type { UnitDynamicTransform } from "./gl/unitTransformTracker";

export function activeUnitSupport(provider: Entity, target: Entity | undefined): boolean {
  if (provider.class !== "unit" || !target || provider.hp <= 0 || target.hp <= 0 || provider.path.length || provider.supportMode === "hold") return false;
  const stats = UNIT_STATS[provider.kind as UnitKind];
  return Boolean(stats.supportRange && target.owner === provider.owner &&
    ((provider.kind === "medic" && target.class === "unit" && UNIT_STATS[target.kind as UnitKind].domain === "human") ||
     (provider.kind === "repairTruck" && target.class === "unit" && UNIT_STATS[target.kind as UnitKind].domain === "vehicle")) &&
    distToEntity(provider, target) <= stats.supportRange && (target.hp < target.maxHp || provider.cooldown > 0));
}

export function unitBodyMotion(e: Entity, anim: UnitAnim, dyn: Pick<UnitDynamicTransform, "recoil" | "moveSpeed" | "suspensionY" | "chassisLean" | "roll">, now: number, reducedMotion = false): { lift: number; lean: number; scaleY: number } {
  if (reducedMotion || e.kind === "strikePlane") return { lift: 0, lean: 0, scaleY: 1 };
  const walker = ["infantry", "antiArmor", "medic"].includes(e.kind);
  const phase = now * 0.0022 + e.id * 2.399;
  if (walker) return { lift: 0, lean: anim.pose === "attack" ? dyn.recoil * 0.014 : 0,
    scaleY: anim.pose === "idle" ? 1 + Math.sin(phase) * 0.006 : 1 };
  const moving = dyn.moveSpeed > 0.025;
  const vibration = Math.sin(now * 0.035 + e.id) * (moving ? 0.15 : 0.045);
  return { lift: dyn.suspensionY + vibration,
    lean: dyn.chassisLean + Math.max(-0.025, Math.min(0.025, dyn.roll * 0.10)), scaleY: 1 };
}

export function activeUnitGathering(state: SimState, e: Entity): boolean {
  if (e.kind !== "harvester" || e.path.length || e.gatherX === undefined || e.gatherY === undefined || e.carry >= UNIT_STATS.harvester.carryMax) return false;
  const amount = state.resourceAmount[Math.round(e.gatherY) * state.width + Math.round(e.gatherX)] ?? 0;
  return amount > 0 && Math.hypot(e.x - e.gatherX, e.y - e.gatherY) <= 1.5;
}

export function drawUnitWorkFx(ctx: CanvasRenderingContext2D, e: Entity, target: Entity | undefined, x: number, groundY: number, scale: number, now: number, reducedMotion: boolean, options: { gathering?: boolean; targetScreen?: { x: number; y: number }; state?: SimState; alpha?: number } = {}): void {
  const alpha = Math.max(0, Math.min(1, options.alpha ?? 1));
  if (alpha <= 0 || (options.state && fogAt(options.state, Math.round(e.x), Math.round(e.y)) !== 2)) return;
  const targetVisible = !options.state || !target || fogAt(options.state, Math.round(target.x), Math.round(target.y)) === 2;
  const support = targetVisible && activeUnitSupport(e, target);
  const gathering = options.gathering ?? false;
  const vehicle = UNIT_STATS[e.kind as UnitKind].domain === "vehicle";
  const phase = now * 0.001 + e.id * 0.31;
  ctx.save();
  if (vehicle && !reducedMotion) {
    for (let i = 0; i < 2; i++) {
      const age = ((phase * 0.7 + i * 0.5) % 1 + 1) % 1;
      ctx.globalAlpha = alpha * (1 - age) * 0.10;
      ctx.fillStyle = "#a4adb0";
      ctx.beginPath(); ctx.ellipse(x - (6 + age * 5) * scale, groundY - (9 + age * 8) * scale, (1 + age * 2) * scale, (0.8 + age) * scale, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (gathering) {
    ctx.globalAlpha = alpha * 0.65; ctx.strokeStyle = "#a8cad0"; ctx.lineWidth = Math.max(1, scale);
    const heading = isoHeadingAngle((e.gatherX ?? e.x) - e.x, (e.gatherY ?? e.y) - e.y);
    const reach = reducedMotion ? 8 : 8 + Math.sin(phase * 5) * 2;
    const jointX = x + Math.cos(heading) * reach * 0.45 * scale;
    const jointY = groundY - (reducedMotion ? 5 : 5 + Math.sin(phase * 5) * 0.6) * scale;
    const bucketX = x + Math.cos(heading) * reach * scale;
    const bucketY = groundY - 2 * scale + Math.sin(heading) * reach * scale * 0.5;
    ctx.beginPath(); ctx.moveTo(x, groundY - 5 * scale); ctx.lineTo(jointX,jointY); ctx.lineTo(bucketX,bucketY); ctx.stroke();
    ctx.fillStyle = "#617982"; ctx.beginPath();
    ctx.moveTo(bucketX-2*scale,bucketY-scale); ctx.lineTo(bucketX+2*scale,bucketY-scale);
    ctx.lineTo(bucketX+1.5*scale,bucketY+2*scale); ctx.lineTo(bucketX-1.5*scale,bucketY+2*scale); ctx.closePath(); ctx.fill();
  }
  if (support && target) {
    const direction = isoHeadingAngle(target.x - e.x, target.y - e.y);
    const repaired = options.targetScreen ?? { x: x + 16 * scale, y: groundY };
    const px = e.kind === "repairTruck" ? repaired.x : x + Math.cos(direction) * 10 * scale;
    const py = e.kind === "repairTruck" ? repaired.y - 8*scale : groundY - 10 * scale + Math.sin(direction) * 6 * scale;
    ctx.globalAlpha = alpha * (reducedMotion ? 0.25 : 0.5 + Math.sin(phase * 8) * 0.2);
    ctx.fillStyle = e.kind === "medic" ? "#9aedd0" : "#c4efff";
    ctx.beginPath(); ctx.arc(px, py, 1.7 * scale, 0, Math.PI * 2); ctx.fill();
    if (!reducedMotion && e.kind === "repairTruck") {
      ctx.strokeStyle = "#d6f4ff"; ctx.lineWidth = Math.max(0.7, scale);
      for (let i = 0; i < 3; i++) {
        const angle = phase * 3 + i * 2.1;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(angle) * 4 * scale, py + Math.sin(angle) * 3 * scale); ctx.stroke();
      }
    }
  }
  ctx.restore();
}
