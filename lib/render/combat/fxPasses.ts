import { ammoEffectForWeapon } from "../../catalog";
import { rubbleSprite, wreckSprite } from "../../gen/assets";
import { FX_DURATION, fxProgress, isBuildingKind, isUnitKind, type FxBurst } from "../fx";
import { TILE_H, type Camera } from "../../iso";
import { drawSprite, rasterize } from "../sprites";
import type { SimState } from "../../types";

type FxPoint = { x: number; y: number };
type FxPosition = (burst: FxBurst) => FxPoint;
type FxVisible = (point: FxPoint) => boolean;
type DrawDestruction = (
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  burst: FxBurst,
  screen: FxPoint,
  nowMs: number,
  reducedMotion: boolean,
) => void;

export function drawGroundFx(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  fx: FxBurst[],
  nowMs: number,
  z: number,
  position: FxPosition,
  visible: FxVisible,
): void {
  for (const burst of fx) {
    if (burst.kind !== "scorch" || burst.bornMs > nowMs) continue;
    const p = fxProgress(burst, nowMs);
    const s = position(burst);
    if (!visible(s)) continue;
    const fade = p > 0.78 ? 1 - (p - 0.78) / 0.22 : 1;
    const mag = burst.magnitude ?? 1;
    const radius = (12 + mag * 14) * z;
    const cy = s.y + (TILE_H / 2) * z;
    ctx.save();
    // Outer blast soot ring
    ctx.globalAlpha = 0.32 * fade;
    ctx.fillStyle = "#120e0b";
    ctx.beginPath();
    ctx.ellipse(s.x, cy, radius * 1.15, radius * 0.44, -0.06, 0, Math.PI * 2);
    ctx.fill();
    // Core charred crater
    ctx.globalAlpha = 0.48 * fade;
    ctx.fillStyle = "#040404";
    ctx.beginPath();
    ctx.ellipse(s.x, cy, radius * 0.72, radius * 0.28, -0.04, 0, Math.PI * 2);
    ctx.fill();
    // Charred rim crack line
    ctx.globalAlpha = 0.22 * fade;
    ctx.strokeStyle = "#442b1a";
    ctx.lineWidth = Math.max(1, 2 * z);
    ctx.stroke();
    ctx.restore();
  }
  for (const burst of fx) {
    if ((burst.kind !== "rubble" && burst.kind !== "wreck") || burst.bornMs > nowMs) continue;
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
}

export function drawBurstFx(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  fx: FxBurst[],
  nowMs: number,
  reducedMotion: boolean,
  z: number,
  position: FxPosition,
  visible: FxVisible,
  drawDestructionFx: DrawDestruction,
): void {
  for (const burst of fx) {
    if (
      burst.bornMs > nowMs ||
      burst.kind === "rubble" ||
      burst.kind === "wreck" ||
      burst.kind === "scorch"
    ) continue;
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
      const ammoEffect = burst.ammoEffect ?? ammoEffectForWeapon(burst.weapon ?? "cannon");
      const muzzleFade = Math.max(0, 1 - (nowMs - burst.bornMs) / FX_DURATION.muzzle);
      if (ammoEffect === "bomb") {
        // Strike planes release bombs without a ground-level muzzle flash.
        ctx.restore();
        continue;
      }
      if (reducedMotion) {
        ctx.globalAlpha = 0.32 * muzzleFade;
        ctx.fillStyle = ammoEffect === "missile" ? "#ff9b56" : "#fff2b2";
        const size = ammoEffect === "missile" ? 6 : 4;
        ctx.fillRect(Math.round(s.x - size * z / 2), Math.round(s.y + 2 * z), Math.max(2, size * z), Math.max(2, 3 * z));
        ctx.restore();
        continue;
      }
      const radius = (ammoEffect === "bullet" ? 3 : 5 + magnitude * 7) * z * (0.8 + muzzleFade * 0.35);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.85 * muzzleFade;
      ctx.fillStyle = ammoEffect === "missile" ? "#ff9b56" : "#fff2b2";
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + 4 * z, radius * (ammoEffect === "bullet" ? 0.34 : 0.48), radius * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff7d6";
      ctx.lineWidth = Math.max(1, z);
      const rays = ammoEffect === "bullet" ? 3 : 5;
      for (let i = 0; i < rays; i++) {
        const angle = phase + (i / rays) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y + 4 * z);
        ctx.lineTo(s.x + Math.cos(angle) * radius * (ammoEffect === "bullet" ? 0.72 : 1), s.y + 4 * z + Math.sin(angle) * radius * 0.58);
        ctx.stroke();
      }
      if (ammoEffect === "missile") {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.32 * muzzleFade;
        ctx.fillStyle = "#858a84";
        ctx.beginPath();
        ctx.ellipse(s.x - 4 * z, s.y + 7 * z, 5 * z, 2.8 * z, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      continue;
    }

    if (burst.kind === "impact") {
      const ammoEffect = burst.ammoEffect ?? ammoEffectForWeapon(burst.weapon ?? "cannon");
      const metal = burst.targetDomain === "vehicle";
      const structure = burst.targetDomain === "building";
      const radius = (4 + magnitude * 13 + p * 8) * z;
      if (ammoEffect === "missile" || ammoEffect === "shell" || ammoEffect === "bomb") {
        const scale = ammoEffect === "bomb" ? 1.32 : ammoEffect === "shell" ? 0.78 : 1;
        const blastRadius = radius * scale;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (reducedMotion ? 0.24 : 0.62) * fade;
        ctx.fillStyle = p < 0.24 ? "#fff0a3" : "#e56b32";
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + 7 * z, blastRadius * (0.5 + p * 0.22), blastRadius * (0.28 + p * 0.12), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = (reducedMotion ? 0.24 : 0.72) * fade;
        ctx.strokeStyle = metal ? "#ffd18b" : structure ? "#e5a35d" : "#d09a68";
        ctx.lineWidth = Math.max(1, (1 + magnitude * 0.8) * z);
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + 8 * z, blastRadius * (0.54 + p * 0.42), blastRadius * (0.2 + p * 0.16), 0, 0, Math.PI * 2);
        ctx.stroke();
        if (!reducedMotion) {
          const count = ammoEffect === "bomb" ? 10 : ammoEffect === "shell" ? 6 : 8;
          for (let i = 0; i < count; i++) {
            const angle = phase + (i / count) * Math.PI * 2;
            const travel = blastRadius * (0.35 + ((((burst.variant ?? burst.id) >>> (i % 16)) & 3) * 0.18));
            ctx.globalAlpha = fade * (i % 2 ? 0.68 : 0.9);
            ctx.fillStyle = i % 2 ? "#ffbd68" : "#ffe7a1";
            ctx.fillRect(
              Math.round(s.x + Math.cos(angle) * travel - z),
              Math.round(s.y + 7 * z + Math.sin(angle) * travel * 0.42 - p * 7 * z),
              Math.max(1, 2 * z),
              Math.max(1, 2 * z),
            );
          }
          if (ammoEffect !== "shell") {
            ctx.globalAlpha = 0.26 * fade;
            ctx.fillStyle = "#47433c";
            for (let i = 0; i < 3; i++) {
              const drift = (i - 1) * blastRadius * 0.24;
              ctx.beginPath();
              ctx.ellipse(s.x + drift, s.y - (5 + p * 15 + i * 2) * z, (3 + p * 4) * z, (2 + p * 2) * z, 0, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        ctx.restore();
        continue;
      }
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
