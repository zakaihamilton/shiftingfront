import { buildingAnim } from "./anim";
import { buildAntiAirTurretModel, buildTurretHeadModel, type UnitModel } from "./gl/modelLoader";
import { draw3dModel } from "./gl/modelRenderer";
import type { BuildingKind, Entity, Facing, Palette } from "../types";

const cachedTurretModels = new Map<"turret" | "antiAirTurret", UnitModel>();

function getTurretModel(kind: "turret" | "antiAirTurret"): UnitModel {
  const cached = cachedTurretModels.get(kind);
  if (cached) return cached;
  const model = kind === "antiAirTurret" ? buildAntiAirTurretModel() : buildTurretHeadModel();
  cachedTurretModels.set(kind, model);
  return model;
}

function fakeBuilding(kind: BuildingKind): Entity {
  return {
    id: 1,
    owner: 0,
    class: "building",
    kind,
    x: 0,
    y: 0,
    hp: 100,
    maxHp: 100,
    cooldown: 0,
    path: [],
    carry: 0,
    constructing: 0,
    queue: [],
    marked: false,
    idle: true,
  };
}

/** Paints the small lights, smoke, doors, and turret head used by item previews. */
export function paintBuildingAssetOverlay(
  ctx: CanvasRenderingContext2D,
  kind: BuildingKind,
  cx: number,
  cy: number,
  scale: number,
  timeMs: number,
  facing: Facing = 0,
  playing = true,
  palette?: Palette,
): void {
  const anim = buildingAnim(fakeBuilding(kind), 0, timeMs);
  ctx.save();
  if (anim.lightOn && (kind === "power" || kind === "constructionYard" || kind === "objective" || kind === "turret" || kind === "antiAirTurret")) {
    ctx.fillStyle = kind === "objective" ? "#f3dc79" : "#c7f0d4";
    ctx.globalAlpha = 0.5 + anim.smoke * 0.3;
    ctx.beginPath();
    ctx.ellipse(cx + 6 * scale, cy - 12 * scale, 3.5 * scale, 2.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (kind === "refinery" || kind === "power" || kind === "factory" || anim.damageStage > 0) {
    const puff = anim.smoke;
    for (let i = 0; i < 2; i++) {
      const rise = (12 + puff * 14 + i * 7) * scale;
      ctx.globalAlpha = (0.2 + puff * 0.22) * (1 - i * 0.18);
      ctx.fillStyle = "rgba(190,190,180,0.55)";
      ctx.beginPath();
      ctx.ellipse(cx - (8 - i * 6) * scale, cy - rise, (4 + puff * 4 + i * 2) * scale, (3 + puff * 3 + i) * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if ((kind === "barracks" || kind === "factory") && anim.doorOpen) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#ffc14a";
    ctx.fillRect(cx - 6 * scale, cy + 4 * scale, 12 * scale, 5 * scale);
  }
  if (kind === "turret" || kind === "antiAirTurret") {
    let currentAngle = (facing / 8) * Math.PI * 2;
    if (playing) currentAngle += Math.sin(timeMs * 0.0012) * 0.55;
    ctx.save();
    ctx.fillStyle = "rgba(8, 12, 16, 0.50)";
    ctx.beginPath();
    ctx.ellipse(cx - 0.5 * scale, cy + 0.5 * scale, 14 * scale, 7.2 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    draw3dModel(ctx, getTurretModel(kind), cx, cy - 3 * scale, scale, currentAngle - Math.PI / 4, palette);
  }
  ctx.restore();
}
