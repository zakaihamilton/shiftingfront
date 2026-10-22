import { canvasViewport } from "../canvasViewport";
import { footprintOf } from "../../catalog";
import { drawBurstFx, drawGroundFx } from "./fxPasses";
import { buildingSprite, unitSprite } from "../../gen/assets";
import { generateVisualProfile } from "../../gen/visualProfile";
import { isBuildingKind, isUnitKind, type FxBurst } from "../fx";
import { TILE_H, tileToScreen, type Camera } from "../../iso";
import { drawSprite, rasterize } from "../sprites";
import type { Facing, SimState, SpriteSpec } from "../../types";
import { unitWeaponSockets } from "../unitVehicleLayers";

const DESTRUCTION_SPRITE_END = 0.58;
const DESTRUCTION_BLAST_END = 0.84;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function destructionSprite(
  state: SimState,
  burst: FxBurst,
  facing: Facing,
): SpriteSpec | undefined {
  const palette = state.factions[burst.owner]?.palette ?? state.factions[0]!.palette;
  const profile = generateVisualProfile(state.seed, burst.owner);
  const variant = burst.variant ?? burst.id;
  if (isUnitKind(burst.entityKind)) {
    return unitSprite(burst.entityKind, palette, {
      facing,
      animationFrame: 0,
      variant,
      profile,
    });
  }
  if (isBuildingKind(burst.entityKind)) {
    return buildingSprite(burst.entityKind, palette, {
      constructionStage: 3,
      damageStage: 2,
      variant,
      profile,
    });
  }
  return undefined;
}

function drawDestructionFx(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  burst: FxBurst,
  screen: { x: number; y: number },
  nowMs: number,
  reducedMotion: boolean,
): void {
  const z = cam.zoom;
  const impactAtMs = burst.impactAtMs;
  const destructionStartMs = impactAtMs ?? burst.bornMs;
  const waitMs = impactAtMs === undefined ? 0 : Math.max(0, impactAtMs - burst.bornMs);
  const destructionDurationMs = Math.max(1, burst.durationMs - waitMs);
  const progress = clamp01((nowMs - destructionStartMs) / destructionDurationMs);
  const magnitude = burst.magnitude ?? 1;
  const variant = burst.variant ?? burst.id;
  const isBuilding = burst.entityClass === "building";
  const isOrganicUnit = burst.entityClass === "unit" && burst.targetDomain === "human";
  const groundY = screen.y + (TILE_H / 2) * z;
  const facing = (variant % 8) as Facing;
  const spec = destructionSprite(state, burst, facing);

  if (impactAtMs !== undefined && nowMs < impactAtMs) {
    if (spec) {
      const dw = spec.w * z;
      const dh = spec.h * z;
      const ax = (spec.anchorX ?? spec.w / 2) * z;
      const ay = (spec.anchorY ?? spec.h) * z;
      const image = rasterize(spec);
      ctx.globalAlpha = 1;
      drawSprite(ctx, spec, image, screen.x - ax, groundY - ay, dw, dh);
    }
    return;
  }

  if (spec && progress < DESTRUCTION_SPRITE_END) {
    const collapse = smoothstep(progress / (isOrganicUnit ? 0.66 : DESTRUCTION_SPRITE_END));
    const scaleX = isOrganicUnit
      ? 1 + collapse * 0.06
      : 1 + collapse * (isBuilding ? 0.12 : 0.18);
    const scaleY = isOrganicUnit
      ? 1 - collapse * 0.88
      : 1 - collapse * (isBuilding ? 0.78 : 0.72);
    const alpha = isOrganicUnit
      ? 1 - clamp01((progress - 0.16) / 0.46)
      : progress < 0.38
        ? 1
        : 1 - clamp01((progress - 0.38) / 0.2);
    const rotation = reducedMotion
      ? 0
      : ((variant & 1) === 0 ? -1 : 1) * collapse * (isOrganicUnit ? 0.18 : isBuilding ? 0.07 : 0.12);
    const dw = spec.w * z;
    const dh = spec.h * z;
    const ax = (spec.anchorX ?? spec.w / 2) * z;
    const ay = (spec.anchorY ?? spec.h) * z;

    ctx.save();
    ctx.translate(screen.x, groundY);
    ctx.rotate(rotation);
    ctx.scale(scaleX, scaleY);
    ctx.globalAlpha = alpha;
    const image = rasterize(spec);
    drawSprite(ctx, spec, image, -ax, -ay, dw, dh);
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = alpha * (isBuilding ? 0.24 : 0.32);
    drawSprite(ctx, spec, image, -ax, -ay, dw, dh);
    ctx.restore();
  }

  if (isOrganicUnit) {
    const dustProgress = reducedMotion ? 0.45 : smoothstep(progress / 0.72);
    const dustFade = 1 - clamp01((progress - 0.34) / 0.52);
    const radius = (reducedMotion ? 8 : 4 + dustProgress * 14) * z * (0.75 + magnitude * 0.25);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = (reducedMotion ? 0.14 : 0.24) * dustFade;
    ctx.fillStyle = "#8e7a64";
    ctx.beginPath();
    ctx.ellipse(screen.x, groundY, radius, radius * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = (reducedMotion ? 0.08 : 0.18) * dustFade;
    ctx.strokeStyle = "#aa9277";
    ctx.lineWidth = Math.max(1, z);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const blastProgress = smoothstep(progress / DESTRUCTION_BLAST_END);
  const blastFade = progress < 0.42 ? 1 : 1 - clamp01((progress - 0.42) / 0.58);
  const radius = (5 + blastProgress * 30) * z * magnitude;
  const phase = (variant % 628) / 100;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = (reducedMotion ? 0.42 : 0.92) * blastFade;
  ctx.fillStyle = progress < 0.24 ? "#fff0a3" : "#e16a32";
  ctx.beginPath();
  ctx.ellipse(screen.x, groundY - 2 * z, radius, radius * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = (reducedMotion ? 0.3 : 0.7) * blastFade;
  ctx.strokeStyle = progress < 0.35 ? "#ffd38a" : "#6b4a38";
  ctx.lineWidth = Math.max(1, 1.5 * z);
  ctx.beginPath();
  ctx.ellipse(screen.x, groundY, radius * 1.08, radius * 0.38, 0, 0, Math.PI * 2);
  ctx.stroke();

  if (!reducedMotion) {
    ctx.globalAlpha = 0.3 * blastFade;
    ctx.fillStyle = "#20252a";
    const smokeCount = isBuilding ? 7 : 5;
    for (let i = 0; i < smokeCount; i++) {
      const angle = phase + i * 1.9;
      const drift = (7 + i * 3 + blastProgress * 24) * z;
      ctx.beginPath();
      ctx.ellipse(
        screen.x + Math.cos(angle) * drift * 0.6,
        screen.y - (8 + blastProgress * 32 + i * 2) * z,
        (5 + blastProgress * 8 + i) * z,
        (3 + blastProgress * 5) * z,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.globalAlpha = 0.78 * blastFade;
    ctx.strokeStyle = progress < 0.4 ? "#ffd38a" : "#6b4a38";
    ctx.lineWidth = Math.max(1, z);
    const debrisCount = isBuilding ? 12 : 8;
    for (let i = 0; i < debrisCount; i++) {
      const angle = phase + (i / debrisCount) * Math.PI * 2;
      const inner = radius * 0.25;
      const outer = radius * (0.72 + (i % 3) * 0.14);
      ctx.beginPath();
      ctx.moveTo(screen.x + Math.cos(angle) * inner, groundY + Math.sin(angle) * inner * 0.5);
      ctx.lineTo(screen.x + Math.cos(angle) * outer, groundY + Math.sin(angle) * outer * 0.5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawFxLayer(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  fx: FxBurst[] | undefined,
  nowMs: number,
  layer: "ground" | "burst",
  reducedMotion = false,
): void {
  if (!fx?.length) return;
  const z = cam.zoom;
  const position = (burst: FxBurst) => {
    const socket = burst.kind === "muzzle" && burst.sourceEntityId !== undefined ? unitWeaponSockets.get(burst.sourceEntityId) : undefined;
    if (socket) return { x: socket.x, y: socket.y - 4 * z };
    let cx = burst.x;
    let cy = burst.y;
    if (burst.entityClass === "building" && isBuildingKind(burst.entityKind)) {
      const fp = footprintOf(burst.entityKind);
      cx += (fp.w - 1) / 2;
      cy += (fp.h - 1) / 2;
    }
    return tileToScreen(cx, cy, cam, burst.elev);
  };
  const visible = (s: { x: number; y: number }) => {
    const pad = 140 * Math.max(1, z);
    return s.x >= -pad && s.y >= -pad && s.x <= canvasViewport(ctx.canvas).width + pad && s.y <= canvasViewport(ctx.canvas).height + pad;
  };

  if (layer === "ground") {
    drawGroundFx(ctx, state, fx, nowMs, z, position, visible);
    return;
  }

  drawBurstFx(ctx, state, cam, fx, nowMs, reducedMotion, z, position, visible, drawDestructionFx);
}
