import { featureEdgeMask } from "../../gen/map";
import type { SimState } from "../../types";
import { fogAt } from "../../sim/fog";
import { TILE_H, TILE_W, expandIsoDiamond, tileToScreen, type Camera } from "../../iso";
import { fogTerrainGain, biomeMaterials } from "../terrainAtlas";
import { visibleTileRange, WATER_COVER } from "../terrainPaint";
import { isoDiamondPath } from "../isoDiamond";
import type { WaterCaustic } from "./types";
import { ensureFxTileIndex, forVisibleIndexedTiles } from "./core";

export function waterCaustic(timeMs: number, x: number, y: number): WaterCaustic {
  const phase = timeMs * 0.0012 + x * 0.63 + y * 0.41;
  return {
    offset: Math.sin(phase) * 5.5 + Math.sin(phase * 0.37 + 1.2) * 2.2,
    alpha: 0.14 + (Math.sin(phase * 1.3) + 1) * 0.1,
    phase,
  };
}

export function waterFxNeedsClip(state: SimState, x: number, y: number): boolean {
  return featureEdgeMask(state, x, y).bank !== 0;
}

export function visibleFxTileCoords(
  state: SimState,
  cam: Camera,
  screenW: number,
  screenH: number,
  kind: "water" | "ore",
): { x: number; y: number }[] {
  const index = ensureFxTileIndex(state);
  const range = visibleTileRange(cam, screenW, screenH, state.width, state.height);
  const src = kind === "water" ? index.water : index.ore;
  const out: { x: number; y: number }[] = [];
  const width = state.width;
  for (const i of src) {
    const x = i % width;
    const y = (i - x) / width;
    if (x < range.x0 || x >= range.x1 || y < range.y0 || y >= range.y1) continue;
    out.push({ x, y });
  }
  return out;
}

export function paintWaterFx(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  clockMs = 0,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const z = cam.zoom;
  const tw = TILE_W * z;
  const th = TILE_H * z;
  const margin = tw;
  const range = visibleTileRange(cam, w, h, state.width, state.height);
  const index = ensureFxTileIndex(state);
  const hi = biomeMaterials(state.biome).waterHi;
  const foamFill = state.biome === "volcanic shelf"
    ? "rgba(138,128,112,0.9)"
    : `rgba(${Math.min(255, hi.r + 40)},${Math.min(255, hi.g + 28)},${Math.min(255, hi.b + 20)},0.9)`;
  ctx.save();
  forVisibleIndexedTiles(index.water, state.width, range, (x, y) => {
    const fog = fogAt(state, x, y);
    if (fog === 0) return;
    const s = tileToScreen(x, y, cam, 0);
    if (s.x < -margin || s.y < -margin || s.x > w + margin || s.y > h + margin) return;
    const caustic = waterCaustic(clockMs, x, y);
    const gain = fogTerrainGain(fog);
    const cover = expandIsoDiamond(s.x, s.y, tw, th, WATER_COVER);
    const bank = featureEdgeMask(state, x, y).bank;
    if (!bank) return;
    ctx.save();
    isoDiamondPath(ctx, cover.x, cover.y, cover.w, cover.h);
    ctx.clip();
    const n: [number, number] = [s.x, s.y];
    const e: [number, number] = [s.x + tw / 2, s.y + th / 2];
    const so: [number, number] = [s.x, s.y + th];
    const we: [number, number] = [s.x - tw / 2, s.y + th / 2];
    const mid = [s.x, s.y + th * 0.5] as const;
    const edges: Array<[number, [number, number], [number, number]]> = [
      [1, n, e],
      [2, e, so],
      [4, so, we],
      [8, we, n],
    ];
    ctx.save();
    ctx.fillStyle = foamFill;
    ctx.globalAlpha = (0.2 + caustic.alpha * 0.35) * gain;
    const bob = Math.sin(caustic.phase) * 1.4 * z;
    for (const [bit, a, b] of edges) {
      if (!(bank & bit)) continue;
      const mx = (a[0] + b[0]) * 0.5;
      const my = (a[1] + b[1]) * 0.5;
      const ix = (mid[0] - mx) * 0.22;
      const iy = (mid[1] - my) * 0.22;
      ctx.beginPath();
      ctx.ellipse(mx + ix, my + iy + bob, tw * 0.18, th * 0.07, 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore(); // foam pass
    ctx.restore(); // per-tile clip
  });
  ctx.restore(); // water pass
}
