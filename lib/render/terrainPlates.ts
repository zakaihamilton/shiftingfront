import { fogAt } from "../sim/fog";
import type { BuildingKind, Entity, SimState } from "../types";
import { TILE_H, TILE_W, type Camera, tileToScreen } from "../iso";
import {
  CONCRETE_STEEL,
  CONCRETE_STEEL_DARK,
  CONCRETE_STEEL_LIGHT,
  fogTerrainGain,
  tileVariant,
} from "./terrainAtlas";
import { isoDiamondPath } from "./isoDiamond";

const SLAB_RUST = { r: 117, g: 81, b: 59 };
const SLAB_RUST_LIGHT = { r: 189, g: 130, b: 88 };

function mixTone(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return {
    r: a.r + (b.r - a.r) * u,
    g: a.g + (b.g - a.g) * u,
    b: a.b + (b.b - a.b) * u,
  };
}

function rgbCss(color: { r: number; g: number; b: number }): string {
  return `rgb(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)})`;
}

function slabBit(v: number, shift: number, mod: number): number {
  return ((v >>> shift) % mod + mod) % mod;
}

export function drawConcreteSlab(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tw: number,
  th: number,
  z: number,
  variant: number,
  alpha: number,
): void {
  const v = variant >>> 0;
  const age = slabBit(v, 3, 10) / 9;
  const polish = (slabBit(v, 7, 7) - 3) / 3;
  let face = mixTone(CONCRETE_STEEL, CONCRETE_STEEL_LIGHT, 0.12 + polish * 0.08);
  face = mixTone(face, CONCRETE_STEEL_DARK, 0.08 + age * 0.28);
  if (age > 0.62) face = mixTone(face, SLAB_RUST, 0.06 + (age - 0.62) * 0.1);
  const grout = mixTone(CONCRETE_STEEL_DARK, CONCRETE_STEEL, 0.22);
  const joint = Math.max(1.15, 1.45 * z);
  const iw = tw - joint * 2;
  const ih = th - joint;
  const iy = sy + joint * 0.5;
  ctx.save();
  ctx.globalAlpha = alpha;
  isoDiamondPath(ctx, sx, sy, tw, th);
  ctx.fillStyle = rgbCss(grout);
  ctx.fill();
  isoDiamondPath(ctx, sx, iy, iw, ih);
  ctx.fillStyle = rgbCss(face);
  ctx.fill();
  ctx.save();
  isoDiamondPath(ctx, sx, iy, iw, ih);
  ctx.clip();

  const bloomX = sx + (slabBit(v, 0, 9) - 4) * 3.2 * z;
  const bloomY = iy + ih * (0.38 + slabBit(v, 4, 5) * 0.06);
  ctx.globalAlpha = alpha * (0.1 + age * 0.18);
  ctx.fillStyle = rgbCss(mixTone(CONCRETE_STEEL_DARK, SLAB_RUST, age * 0.4));
  ctx.beginPath();
  ctx.ellipse(bloomX, bloomY, iw * (0.2 + slabBit(v, 2, 4) * 0.04), ih * (0.16 + slabBit(v, 8, 3) * 0.03), 0, 0, Math.PI * 2);
  ctx.fill();

  const grain = 2 + slabBit(v, 1, 3);
  const lean = (slabBit(v, 1, 2) === 0 ? 1 : -1) * iw * 0.38;
  ctx.lineCap = "butt";
  ctx.lineWidth = Math.max(0.7, 0.85 * z);
  for (let i = 0; i < grain; i++) {
    const t = (i + 0.35) / grain - 0.5;
    const gy = iy + ih * (0.32 + t * 0.42) + (slabBit(v, 10 + i, 5) - 2) * 0.45 * z;
    ctx.globalAlpha = alpha * (i === 1 ? 0.22 : 0.12);
    ctx.strokeStyle = rgbCss(i % 2 ? CONCRETE_STEEL_LIGHT : CONCRETE_STEEL_DARK);
    ctx.beginPath();
    ctx.moveTo(sx - lean, gy - ih * 0.12);
    ctx.lineTo(sx + lean, gy + ih * 0.12);
    ctx.stroke();
  }

  if (slabBit(v, 5, 5) >= 2) {
    const stains = 1 + slabBit(v, 11, 2);
    for (let i = 0; i < stains; i++) {
      const rx = sx + (slabBit(v, 8 + i * 4, 11) - 5) * 2.4 * z;
      const ry = iy + ih * (0.34 + slabBit(v, 12 + i, 5) * 0.07);
      ctx.globalAlpha = alpha * (0.18 + age * 0.2);
      ctx.fillStyle = rgbCss(mixTone(i === 0 ? SLAB_RUST : SLAB_RUST_LIGHT, face, 0.28));
      ctx.beginPath();
      ctx.ellipse(rx, ry, (2.8 + i) * z, 1.25 * z, -0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * (0.16 + age * 0.14);
      ctx.strokeStyle = rgbCss(SLAB_RUST);
      ctx.lineWidth = Math.max(0.7, 0.9 * z);
      ctx.beginPath();
      ctx.moveTo(rx - 0.4 * z, ry);
      ctx.lineTo(rx + 1.6 * z, ry + 5.2 * z);
      ctx.stroke();
    }
  }

  const pits = slabBit(v, 9, 4);
  ctx.fillStyle = rgbCss(mixTone(CONCRETE_STEEL_DARK, SLAB_RUST, 0.2));
  for (let i = 0; i < pits; i++) {
    const px = sx + (slabBit(v, 14 + i * 3, 13) - 6) * 2.1 * z;
    const py = iy + ih * (0.28 + slabBit(v, 16 + i, 6) * 0.08);
    ctx.globalAlpha = alpha * 0.28;
    ctx.beginPath();
    ctx.ellipse(px, py, 0.9 * z, 0.45 * z, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

export function paintBuildingPlates(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  footprintOf: (kind: BuildingKind) => { w: number; h: number },
  entityVisible: (state: SimState, e: Entity) => boolean,
  entityElev: (state: SimState, e: Entity) => number,
): void {
  const z = cam.zoom;
  for (const e of state.entities) {
    if (e.hp <= 0 || e.class !== "building" || !entityVisible(state, e)) continue;
    const fp = footprintOf(e.kind as BuildingKind);
    const elev = entityElev(state, e);
    const tw = TILE_W * z;
    const th = TILE_H * z;
    const ox0 = Math.round(e.x);
    const oy0 = Math.round(e.y);
    for (let oy = 0; oy < fp.h; oy++) {
      for (let ox = 0; ox < fp.w; ox++) {
        const tx = ox0 + ox;
        const ty = oy0 + oy;
        const cellFog = fogAt(state, tx, ty);
        if (cellFog === 0) continue;
        const alpha = fogTerrainGain(cellFog) * 0.92;
        const p = tileToScreen(tx, ty, cam, elev);
        drawConcreteSlab(ctx, p.x, p.y, tw, th, z, tileVariant(state.seed, tx, ty), alpha);
      }
    }
  }
}
