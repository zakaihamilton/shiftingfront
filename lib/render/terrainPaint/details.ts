import { TILE_H } from "../../iso";
import type { BiomeName, SimState } from "../../types";
import type { SceneryWorld } from "../../gen/map";
import { fogAt } from "../../sim/fog";
import { biomeMaterials, fogTerrainGain, oreCrystalCluster, tileVariant } from "../terrainAtlas";
import { propMaterialsFor, terrainVisualTuningFor, type BiomeMaterials } from "../terrainMaterials";
import { tileToScreen, type Camera } from "../../iso";
import {
  blockerPropPrims,
  blockerToneFromRgb,
  type PropPrim,
} from "../../gen/blockerPropArt";
import { blockerPropKind, type BlockerPropKind } from "./scatter";
import { fillPoly, mixRgb, rgbOf, withAlpha } from "./style";
import { terrainPropLightGain } from "../terrainLighting";

type PropWorld = SceneryWorld & { seed: number };

export function smoothFogGain(state: SimState, x: number, y: number): number {
  // Keep the unexplored center of the shroud opaque. Blending is useful for
  // already discovered cells at the edge, but a discovered tile itself must
  // not retain a shroud just because one of its neighbors is unexplored.
  const center = fogAt(state, x, y);
  if (center === 0) return 0;
  if (center >= 2) return 1;
  let sum = 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      sum += fogTerrainGain(fogAt(state, x + dx, y + dy));
      count += 1;
    }
  }
  return sum / count;
}

function paintPropArt(ctx: CanvasRenderingContext2D, prims: PropPrim[], z: number): void {
  ctx.save();
  for (const prim of prims) {
    const paint = () => {
      if (prim.k === "ell") {
        ctx.fillStyle = prim.fill;
        ctx.beginPath();
        ctx.ellipse(prim.x * z, prim.y * z, prim.rx * z, prim.ry * z, prim.rot, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      if (prim.k === "poly") {
        ctx.fillStyle = prim.fill;
        const pts: number[] = [];
        for (const value of prim.pts) pts.push(value * z);
        fillPoly(ctx, pts);
        return;
      }
      ctx.strokeStyle = prim.stroke;
      ctx.lineWidth = Math.max(prim.minWidth ?? prim.width, prim.width * z);
      ctx.lineCap = prim.cap ?? "butt";
      ctx.beginPath();
      if (prim.k === "line") {
        ctx.moveTo(prim.x0 * z, prim.y0 * z);
        ctx.lineTo(prim.x1 * z, prim.y1 * z);
      } else {
        ctx.moveTo(prim.x0 * z, prim.y0 * z);
        ctx.quadraticCurveTo(prim.cx * z, prim.cy * z, prim.x1 * z, prim.y1 * z);
      }
      ctx.stroke();
    };
    if (prim.alpha !== undefined && prim.alpha < 1) withAlpha(ctx, prim.alpha, paint);
    else paint();
  }
  ctx.restore();
}

function paintBlocker(
  ctx: CanvasRenderingContext2D,
  kind: BlockerPropKind,
  mats: BiomeMaterials,
  z: number,
  v: number,
  biome: BiomeName,
): void {
  paintPropArt(ctx, blockerPropPrims(kind, v, blockerToneFromRgb(mats), biome), z);
}

export function drawBlockerProp(
  ctx: CanvasRenderingContext2D,
  state: PropWorld,
  x: number,
  y: number,
  sx: number,
  sy: number,
  z: number,
): void {
  const v = tileVariant(state.seed, x, y);
  const mats = biomeMaterials(state.biome);
  const kind = blockerPropKind(state.biome, v);
  const ox = ((v % 7) - 3) * z * 0.4;
  const oy = ((Math.floor(v / 11) % 5) - 2) * z * 0.2;
  ctx.save();
  ctx.globalAlpha *= terrainPropLightGain(state, x, y);
  ctx.translate(sx + ox, sy + TILE_H * z * 0.42 + oy);
  paintBlocker(ctx, kind, propMaterialsFor(mats, terrainVisualTuningFor(state.biome)), z, v, state.biome);
  ctx.restore();
}

export function rgbMix(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): string {
  return rgbOf(mixRgb(a, b, t));
}

export function drawOreCrystals(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  x: number,
  y: number,
  elev: number,
  z: number,
): void {
  const cluster = oreCrystalCluster(state, x, y);
  if (!cluster) return;
  const mats = propMaterialsFor(biomeMaterials(state.biome), terrainVisualTuningFor(state.biome));
  const s = tileToScreen(x, y, cam, elev);
  const gemDark = rgbMix(mats.ore, mats.dark, 0.42);
  const gem = rgbMix(mats.ore, mats.light, 0.38);
  const gemHi = rgbMix(mats.light, { r: 255, g: 246, b: 210 }, 0.42);
  ctx.save();
  ctx.translate(s.x, s.y);
  const alpha = ctx.globalAlpha * cluster.intensity * terrainPropLightGain(state, x, y);
  ctx.fillStyle = rgbOf(mats.dark);
  for (const burst of cluster.bursts) {
    ctx.globalAlpha = alpha * 0.32;
    ctx.beginPath();
    ctx.ellipse(burst.dx * z, burst.dy * z + 1.1 * z, 6.2 * z, 2.35 * z, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = alpha;
  for (const shard of cluster.shards) {
    const ox = shard.dx * z;
    const oy = shard.dy * z;
    const tipX = ox + shard.lean * z;
    const tipY = oy - shard.rise * z;
    const vx = tipX - ox;
    const vy = tipY - oy;
    const len = Math.hypot(vx, vy);
    if (len < 0.5 * z) continue;
    const ux = vx / len;
    const uy = vy / len;
    const px = -uy;
    const py = ux;
    const half = shard.half * z;
    const buried = shard.buried * z;
    const midT = 0.34 + shard.twist * 0.05;
    const bx = ox - ux * buried;
    const by = oy - uy * buried;
    const mx = bx + (tipX - bx) * midT;
    const my = by + (tipY - by) * midT;
    const ntx = tipX - ux * 0.55 * z;
    const nty = tipY - uy * 0.55 * z;
    const baseW = half * 0.42;
    const midW = half;
    const tipW = half * 0.16;
    const baseL = { x: bx + px * baseW, y: by + py * baseW };
    const baseR = { x: bx - px * baseW, y: by - py * baseW };
    const midL = { x: mx + px * midW, y: my + py * midW };
    const midR = { x: mx - px * midW, y: my - py * midW };
    const tipL = { x: ntx + px * tipW, y: nty + py * tipW };
    const tipR = { x: ntx - px * tipW, y: nty - py * tipW };
    ctx.fillStyle = gemDark;
    ctx.beginPath();
    ctx.moveTo(baseL.x, baseL.y);
    ctx.lineTo(midL.x, midL.y);
    ctx.lineTo(tipL.x, tipL.y);
    ctx.lineTo(tipR.x, tipR.y);
    ctx.lineTo(midR.x, midR.y);
    ctx.lineTo(baseR.x, baseR.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = gem;
    ctx.beginPath();
    ctx.moveTo(baseL.x, baseL.y);
    ctx.lineTo(midL.x, midL.y);
    ctx.lineTo(tipL.x, tipL.y);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(bx + ux * buried * 0.2, by + uy * buried * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = gemHi;
    ctx.globalAlpha = alpha * 0.5;
    const hx = bx + ux * len * 0.14;
    const hy = by + uy * len * 0.14;
    ctx.beginPath();
    ctx.moveTo(hx + px * half * 0.12, hy + py * half * 0.12);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(hx - px * half * 0.22, hy - py * half * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha * 0.64;
    ctx.strokeStyle = gemHi;
    ctx.lineWidth = Math.max(0.65, 0.55 * z);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }
  ctx.restore();
}
