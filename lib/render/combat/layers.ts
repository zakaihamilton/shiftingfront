import { footprintOf } from "../../catalog";
import { buildingSprite, rubbleSprite, unitSprite, wreckSprite } from "../../gen/assets";
import { generateVisualProfile } from "../../gen/visualProfile";
import { fxProgress, isBuildingKind, isUnitKind, type FxBurst } from "../fx";
import { TILE_H, tileToScreen, type Camera } from "../../iso";
import { drawSprite, rasterize } from "../sprites";
import type { Facing, SimState, SpriteSpec } from "../../types";

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
  const progress = fxProgress(burst, nowMs);
  const magnitude = burst.magnitude ?? 1;
  const variant = burst.variant ?? burst.id;
  const isBuilding = burst.entityClass === "building";
  const isOrganicUnit = burst.entityClass === "unit" && burst.targetDomain === "human";
  const groundY = screen.y + (TILE_H / 2) * z;
  const facing = (variant % 8) as Facing;
  const spec = destructionSprite(state, burst, facing);

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
    return s.x >= -pad && s.y >= -pad && s.x <= ctx.canvas.width + pad && s.y <= ctx.canvas.height + pad;
  };

  if (layer === "ground") {
    for (const burst of fx) {
      if (burst.kind !== "scorch") continue;
      const p = fxProgress(burst, nowMs);
      const s = position(burst);
      if (!visible(s)) continue;
      const fade = p > 0.78 ? 1 - (p - 0.78) / 0.22 : 1;
      const radius = (13 + (burst.magnitude ?? 1) * 13) * z;
      ctx.save();
      ctx.globalAlpha = 0.26 * fade;
      ctx.fillStyle = "#080909";
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + (TILE_H / 2) * z, radius, radius * 0.38, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.14 * fade;
      ctx.strokeStyle = "#5a3925";
      ctx.lineWidth = Math.max(1, 2 * z);
      ctx.stroke();
      ctx.restore();
    }
    for (const burst of fx) {
      if (burst.kind !== "rubble" && burst.kind !== "wreck") continue;
      const p = fxProgress(burst, nowMs);
      const s = position(burst);
      if (!visible(s)) continue;
      const pal = state.factions[burst.owner]?.palette ?? state.factions[0]!.palette;
      const spec = burst.kind === "wreck" && isUnitKind(burst.entityKind)
        ? wreckSprite(burst.entityKind, pal)
        : isBuildingKind(burst.entityKind)
          ? rubbleSprite(burst.entityKind, pal)
          : rubbleSprite("turret", pal);
      const img = rasterize(spec);
      const ax = (spec.anchorX ?? spec.w / 2) * z;
      const ay = (spec.anchorY ?? spec.h) * z;
      ctx.globalAlpha = p > 0.78 ? 1 - (p - 0.78) / 0.22 : 1;
      drawSprite(ctx, spec, img, Math.round(s.x - ax), Math.round(s.y + (TILE_H / 2) * z - ay), spec.w * z, spec.h * z);
      ctx.globalAlpha = 1;
    }
    return;
  }

  for (const burst of fx) {
    if (burst.kind === "rubble" || burst.kind === "wreck" || burst.kind === "scorch") continue;
    const p = fxProgress(burst, nowMs);
    const s = position(burst);
    if (!visible(s)) continue;
    const fade = 1 - p;
    const magnitude = burst.magnitude || 1;
    const phase = ((burst.variant ?? burst.id) % 628) / 100;

    ctx.save();
    if (burst.kind === "destruction") {
      drawDestructionFx(ctx, state, cam, burst, s, nowMs, reducedMotion);
      ctx.restore();
      continue;
    }

    if (burst.kind === "muzzle") {
      if (reducedMotion) {
        ctx.globalAlpha = 0.32 * fade;
        ctx.fillStyle = "#fff2b2";
        ctx.fillRect(Math.round(s.x - 2 * z), Math.round(s.y + 2 * z), Math.max(2, 4 * z), Math.max(2, 3 * z));
        ctx.restore();
        continue;
      }
      const radius = (5 + magnitude * 8) * z * (0.8 + fade * 0.35);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.85 * fade;
      ctx.fillStyle = burst.weapon === "antiArmor" ? "#ff9b56" : "#fff2b2";
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + 4 * z, radius * 0.48, radius * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff7d6";
      ctx.lineWidth = Math.max(1, z);
      for (let i = 0; i < 5; i++) {
        const angle = phase + (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y + 4 * z);
        ctx.lineTo(s.x + Math.cos(angle) * radius, s.y + 4 * z + Math.sin(angle) * radius * 0.58);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }

    if (burst.kind === "impact") {
      const metal = burst.targetDomain === "vehicle";
      const structure = burst.targetDomain === "building";
      const radius = (4 + magnitude * 13 + p * 8) * z;
      ctx.globalAlpha = (reducedMotion ? 0.28 : 0.68) * fade;
      ctx.strokeStyle = metal ? "#d8f2ff" : structure ? "#f1b66d" : "#d7c0a1";
      ctx.lineWidth = Math.max(1, (1 + magnitude) * z);
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + 7 * z, radius, radius * 0.46, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (!reducedMotion) {
        const count = burst.weapon === "smallArms" ? 4 : burst.weapon === "antiArmor" ? 7 : 10;
        for (let i = 0; i < count; i++) {
          const angle = phase + (i / count) * Math.PI * 2;
          const travel = radius * (0.45 + ((((burst.variant ?? burst.id) >>> (i % 16)) & 3) * 0.2));
          const rise = (5 + p * 18 * magnitude) * z;
          ctx.globalAlpha = fade * (metal ? 0.9 : 0.58);
          ctx.fillStyle = metal && i % 2 ? "#d8f2ff" : structure ? "#c98b50" : "#8d7663";
          ctx.fillRect(
            Math.round(s.x + Math.cos(angle) * travel - z),
            Math.round(s.y + 6 * z + Math.sin(angle) * travel * 0.42 - rise),
            Math.max(1, (metal ? 2 : 3) * z),
            Math.max(1, 2 * z),
          );
        }
      }
      ctx.restore();
      continue;
    }

    if (burst.kind === "explosion") {
      const radius = (8 + p * 28) * z * magnitude;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (reducedMotion ? 0.42 : 0.9) * fade;
      ctx.fillStyle = p < 0.38 ? "#fff0a3" : "#e16a32";
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + 5 * z, radius, radius * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      if (!reducedMotion) {
        ctx.globalAlpha = 0.3 * fade;
        ctx.fillStyle = "#20252a";
        for (let i = 0; i < 6; i++) {
          const angle = phase + i * 1.9;
          const drift = (8 + i * 3 + p * 22) * z;
          ctx.beginPath();
          ctx.ellipse(
            s.x + Math.cos(angle) * drift * 0.6,
            s.y - (8 + p * 32 + i * 2) * z,
            (5 + p * 8 + i) * z,
            (3 + p * 5) * z,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        ctx.globalAlpha = 0.78 * fade;
        ctx.strokeStyle = p < 0.45 ? "#ffd38a" : "#6b4a38";
        ctx.lineWidth = Math.max(1, 1.5 * z);
        for (let i = 0; i < 10; i++) {
          const angle = phase + (i / 10) * Math.PI * 2;
          const inner = radius * 0.28;
          const outer = radius * (0.72 + (i % 3) * 0.14);
          ctx.beginPath();
          ctx.moveTo(s.x + Math.cos(angle) * inner, s.y + 5 * z + Math.sin(angle) * inner * 0.5);
          ctx.lineTo(s.x + Math.cos(angle) * outer, s.y + 5 * z + Math.sin(angle) * outer * 0.5);
          ctx.stroke();
        }
      }
      ctx.restore();
      continue;
    }

    const palette = state.factions[burst.owner]?.palette ?? state.factions[0]!.palette;
    if (burst.kind === "build" || burst.kind === "deploy") {
      const radius = (10 + p * (burst.kind === "build" ? 36 : 24)) * z;
      ctx.globalAlpha = (reducedMotion ? 0.34 : 0.72) * fade;
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = Math.max(1, 2 * z);
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + (TILE_H / 2) * z, radius, radius * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (!reducedMotion) {
        const count = burst.kind === "build" ? 10 : 6;
        for (let i = 0; i < count; i++) {
          const angle = phase + (i / count) * Math.PI * 2;
          const travel = radius * (0.35 + (i % 3) * 0.18);
          ctx.globalAlpha = 0.5 * fade;
          ctx.fillStyle = i % 2 ? palette.accent : "#c8b58a";
          ctx.beginPath();
          ctx.ellipse(
            s.x + Math.cos(angle) * travel,
            s.y + 12 * z + Math.sin(angle) * travel * 0.3 - p * 14 * z,
            (2 + (i % 2)) * z,
            (1.2 + (i % 2) * 0.5) * z,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      ctx.restore();
      continue;
    }

    if (burst.kind === "repair" || burst.kind === "heal") {
      const heal = burst.kind === "heal";
      const color = heal ? "#79efbd" : "#8edaff";
      ctx.globalAlpha = (reducedMotion ? 0.3 : 0.72) * fade;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, 1.5 * z);
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + 5 * z, (8 + p * 8) * z, (4 + p * 4) * z, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (!reducedMotion) {
        ctx.fillStyle = color;
        for (let i = 0; i < 5; i++) {
          const angle = phase + i * 1.7;
          const x = s.x + Math.cos(angle) * (7 + i) * z;
          const y = s.y + 7 * z - (p * 18 + i * 2) * z;
          if (heal) {
            ctx.fillRect(Math.round(x - z), Math.round(y - 3 * z), Math.max(2, 2 * z), Math.max(5, 6 * z));
            ctx.fillRect(Math.round(x - 3 * z), Math.round(y - z), Math.max(5, 6 * z), Math.max(2, 2 * z));
          } else {
            ctx.fillRect(Math.round(x), Math.round(y), Math.max(2, 2 * z), Math.max(2, 2 * z));
          }
        }
      }
    }
    ctx.restore();
  }
}
