import { canvasViewport } from "../canvasViewport";
import { sceneryAt } from "../../gen/map";
import type { SimState } from "../../types";
import { fogAt } from "../../sim/fog";
import { TILE_H, TILE_W, tileToScreen, type Camera } from "../../iso";
import { fogTerrainGain, oreCrystalCluster } from "../terrainAtlas";
import { visibleTileRange } from "../terrainPaint";
import { ensureFxTileIndex, forVisibleIndexedTiles } from "./core";

export function oreGlint(timeMs: number, x: number, y: number): number {
  return oreSparkle(timeMs, x, y, 0).glow;
}

export function oreSparkle(timeMs: number, x: number, y: number, index: number): {
  sweep: number;
  twinkle: number;
  glow: number;
} {
  const phase = timeMs * 0.00032 + x * 1.13 + y * 0.67 + index * 2.09;
  return {
    sweep: (Math.sin(phase) + 1) * 0.5,
    twinkle: Math.pow(Math.max(0, Math.sin(phase * 0.72 + 0.6)), 16),
    glow: 0.05 + (Math.sin(phase * 0.14 + index) + 1) * 0.04,
  };
}

function drawSparkleStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha: number,
): void {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#fff8dc";
  ctx.lineWidth = Math.max(1, size * 0.18);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - size, y);
  ctx.lineTo(x + size, y);
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y + size);
  ctx.stroke();
  ctx.globalAlpha = alpha * 0.55;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.55, y - size * 0.55);
  ctx.lineTo(x + size * 0.55, y + size * 0.55);
  ctx.moveTo(x + size * 0.55, y - size * 0.55);
  ctx.lineTo(x - size * 0.55, y + size * 0.55);
  ctx.stroke();
  ctx.restore();
}

export function paintOreGlints(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  clockMs = 0,
): void {
  const w = canvasViewport(ctx.canvas).width;
  const h = canvasViewport(ctx.canvas).height;
  const z = cam.zoom;
  const margin = TILE_W * z;
  const range = visibleTileRange(cam, w, h, state.width, state.height);
  const index = ensureFxTileIndex(state);
  forVisibleIndexedTiles(index.ore, state.width, range, (x, y) => {
    const fog = fogAt(state, x, y);
    if (fog === 0) return;
    const elev = sceneryAt(state, x, y).elev;
    const origin = tileToScreen(x, y, cam, elev);
    if (origin.x < -margin || origin.y < -margin || origin.x > w + margin || origin.y > h + margin) return;
    const cluster = oreCrystalCluster(state, x, y);
    if (!cluster) return;
    const gain = fogTerrainGain(fog) * Math.min(1, cluster.intensity);
    const s = tileToScreen(x, y, cam, elev);
    const baseX = s.x;
    const baseY = s.y;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const halo = oreSparkle(clockMs, x, y, 0);
    ctx.globalAlpha = halo.glow * gain * 0.16;
    ctx.fillStyle = "#ffe9a8";
    ctx.beginPath();
    ctx.ellipse(baseX, baseY + TILE_H * z * 0.5, TILE_W * z * 0.28, TILE_H * z * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    cluster.shards.forEach((shard, sparkIndex) => {
      const spark = oreSparkle(clockMs, x, y, sparkIndex);
      const dx = shard.dx * z;
      const dy = shard.dy * z;
      const lean = shard.lean * z;
      const rise = shard.rise * z;
      const tipX = baseX + dx + lean;
      const tipY = baseY + dy - rise;
      const t = 0.18 + spark.sweep * 0.72;
      const sweepX = baseX + dx + lean * t;
      const sweepY = baseY + dy - rise * t;
      ctx.globalAlpha = (0.05 + spark.sweep * 0.1) * gain;
      ctx.fillStyle = "#fff4c4";
      ctx.beginPath();
      ctx.ellipse(sweepX, sweepY, 2.2 * z, 1.1 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = (0.04 + spark.glow * 0.16) * gain;
      ctx.fillStyle = "#ffe07a";
      ctx.beginPath();
      ctx.ellipse(tipX, tipY, 1.6 * z, 1.6 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      drawSparkleStar(ctx, tipX, tipY, (2.2 + spark.twinkle * 1.8) * z, spark.twinkle * gain * 0.55);
    });
    ctx.restore();
  });
}
