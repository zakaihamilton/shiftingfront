import { isSupportUnit } from "../../catalog";
import { isUnitEntity, type Entity } from "../../types";
import type { ColorblindMode } from "../../persist/settings";

/** Dark steel housing, matching `--chrome-void`. */
const METER_HOUSING = "rgba(5, 8, 14, 0.92)";
/** Inset stroke, matching `--chrome-steel-hi`. */
const METER_STEEL = "rgba(58, 77, 94, 0.85)";
const METER_TRACK = "rgba(12, 16, 20, 0.95)";
const METER_SEGMENT = "rgba(5, 8, 14, 0.45)";
const METER_SELECT = "#f5e6a8";
const METER_REPAIR_GLOW = "rgba(255, 214, 72, 0.92)";
const METER_REPAIR_EDGE = "#ffe58a";
const METER_AMMO_TOP = "#67e8f9";
const METER_AMMO_BOTTOM = "#0e7490";
const SEGMENT_PX = 4;

export function entityHasWorldHealthMeter(
  e: Pick<Entity, "class" | "kind">,
  isRepairing = false,
): boolean {
  return e.class === "unit" || (e.class === "building" && (e.kind === "turret" || e.kind === "antiAirTurret" || isRepairing));
}

export function entityHasWorldAmmoMeter(e: Pick<Entity, "class" | "kind">): boolean {
  return e.class === "unit" && e.kind === "strikePlane";
}

/** Returns entities currently receiving a building repair or support heal. */
export function repairTargetIds(state: { entities: Entity[] }): Set<number> {
  const ids = new Set<number>();
  for (const entity of state.entities) {
    if (entity.hp <= 0 || entity.neutral) continue;
    if (entity.class === "building" && entity.repairing) ids.add(entity.id);
    if (
      isUnitEntity(entity) &&
      isSupportUnit(entity.kind) &&
      entity.supportTargetId !== undefined
    ) {
      ids.add(entity.supportTargetId);
    }
  }
  return ids;
}

export function worldHealthMeterLayout(
  e: Pick<Entity, "kind">,
  spec: { w: number },
  dx: number,
  dy: number,
  tileScreenY: number,
  z: number,
): { barW: number; meterY: number; centerX: number } {
  const barW = Math.max(16, Math.round(Math.min(spec.w * 0.75, 24) * z));
  const centerX = Math.round(dx + (spec.w * z) / 2);
  // Turret sprites include empty sky padding, so dy is far above the 3D cannon.
  // Sit the meter just above the projected turret head (antenna tip ~ tileY - 3z).
  const meterY = e.kind === "turret" || e.kind === "antiAirTurret"
    ? Math.round(tileScreenY - 10 * z)
    : Math.round(dy - 7 * z);
  return { barW, meterY, centerX };
}

export function worldHealthMeterHeight(z: number): number {
  return Math.max(2, Math.round(2.25 * z));
}

export function healthMeterColors(
  ratio: number,
  mode: ColorblindMode = "none",
): { top: string; bottom: string } {
  if (mode === "deuteranopia" || mode === "protanopia") {
    // Red-Green: Blue -> Amber -> Magenta
    if (ratio > 0.5) return { top: "#38bdf8", bottom: "#0284c7" };
    if (ratio > 0.25) return { top: "#fbbf24", bottom: "#d97706" };
    return { top: "#f43f5e", bottom: "#be123c" };
  }
  if (mode === "tritanopia") {
    // Blue-Yellow: Teal -> Coral -> Purple
    if (ratio > 0.5) return { top: "#2dd4bf", bottom: "#0f766e" };
    if (ratio > 0.25) return { top: "#fb923c", bottom: "#c2410c" };
    return { top: "#a855f7", bottom: "#7e22ce" };
  }
  if (ratio > 0.5) {
    return { top: "#6b8f4e", bottom: "#3f5c32" };
  }
  if (ratio > 0.25) {
    return { top: "#c4a24a", bottom: "#7a5e22" };
  }
  return { top: "#a84a42", bottom: "#6b2a26" };
}

export function drawUnitHealthMeter(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  hp: number,
  maxHp: number,
  z: number,
  alpha = 1,
  isSelected = false,
  barWidth?: number,
  isRepairing = false,
  colorblindMode: ColorblindMode = "none",
): void {
  if (maxHp <= 0 || hp <= 0) return;
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const w = barWidth ?? Math.max(16, Math.round(20 * z));
  const h = worldHealthMeterHeight(z);
  const x = Math.round(centerX - w / 2);
  const y = Math.round(topY);

  ctx.save();
  ctx.globalAlpha = alpha;

  if (isRepairing) {
    ctx.save();
    ctx.shadowColor = METER_REPAIR_GLOW;
    ctx.shadowBlur = Math.max(3, Math.round(5 * z));
    ctx.strokeStyle = METER_REPAIR_EDGE;
    ctx.lineWidth = Math.max(1, z);
    ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    ctx.restore();
  }

  ctx.fillStyle = METER_HOUSING;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);

  ctx.strokeStyle = METER_STEEL;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);

  ctx.fillStyle = METER_TRACK;
  ctx.fillRect(x, y, w, h);

  const fillW = Math.max(0, Math.min(w, Math.round(w * ratio)));
  if (fillW > 0) {
    const { top, bottom } = healthMeterColors(ratio, colorblindMode);
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, fillW, h);

    ctx.fillStyle = METER_SEGMENT;
    for (let sx = x + SEGMENT_PX; sx < x + fillW; sx += SEGMENT_PX) {
      ctx.fillRect(sx, y, 1, h);
    }
  }

  if (isSelected) {
    ctx.fillStyle = METER_SELECT;
    ctx.fillRect(x, y + h + 1, w, 1);
  }

  ctx.restore();
}

/** Draws the compact cyan ammunition meter used beneath an aircraft's health. */
export function drawUnitAmmoMeter(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  ammo: number,
  maxAmmo: number,
  z: number,
  alpha = 1,
  barWidth?: number,
): void {
  if (maxAmmo <= 0) return;
  const ratio = Math.max(0, Math.min(1, ammo / maxAmmo));
  const w = barWidth ?? Math.max(16, Math.round(20 * z));
  const h = worldHealthMeterHeight(z);
  const x = Math.round(centerX - w / 2);
  const y = Math.round(topY);

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = METER_HOUSING;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);

  ctx.strokeStyle = METER_STEEL;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);

  ctx.fillStyle = METER_TRACK;
  ctx.fillRect(x, y, w, h);

  const fillW = Math.max(0, Math.min(w, Math.round(w * ratio)));
  if (fillW > 0) {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, METER_AMMO_TOP);
    grad.addColorStop(1, METER_AMMO_BOTTOM);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, fillW, h);

    ctx.fillStyle = METER_SEGMENT;
    for (let sx = x + SEGMENT_PX; sx < x + fillW; sx += SEGMENT_PX) {
      ctx.fillRect(sx, y, 1, h);
    }
  }

  ctx.restore();
}
