import type { BiomeName, SimState } from "../../types";
import type { Camera } from "../../iso";
import { terrainVisualTuningFor } from "../terrainMaterials";
import type { WeatherKind, WeatherParticle } from "./types";

const PARTICLE_COUNT = 120;
const particleSprites = new Map<string, HTMLCanvasElement>();

function particleSprite(color: string): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const hit = particleSprites.get(color);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(8, 8, 8, 4.96, 0, 0, Math.PI * 2);
  ctx.fill();
  particleSprites.set(color, canvas);
  return canvas;
}

export function weatherKindForBiome(biome: BiomeName): WeatherKind {
  return terrainVisualTuningFor(biome).motion;
}

function hash01(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function weatherParticleAt(
  seed: number,
  biome: BiomeName,
  index: number,
  timeMs: number,
  screenW: number,
  screenH: number,
): WeatherParticle {
  const kind = weatherKindForBiome(biome);
  const tuning = terrainVisualTuningFor(biome);
  const lane = seed * 9973 + index * 7919;
  const originX = hash01(lane) * screenW;
  const originY = hash01(lane + 17) * screenH;
  const speed = kind === "ember" ? 0.042 : kind === "snow" ? 0.028 : kind === "ash" ? 0.022 : kind === "dust" ? 0.021 : 0.018;
  const jitter = (hash01(lane + 31) - 0.5) * speed * 0.5;
  const driftX = tuning.windX * speed + jitter;
  const driftY = tuning.windY * speed + (hash01(lane + 37) - 0.5) * speed * 0.34;
  const wrap = (value: number, span: number) => ((value % span) + span) % span;
  const color = kind === "snow"
    ? "#e8f4f6"
    : kind === "ash"
      ? "#9aa39c"
      : kind === "dust"
        ? "#c8b486"
        : kind === "ember"
          ? "#d06a3c"
          : kind === "pollen"
            ? "#8ea878"
            : "#b8d0cc";
  const trail = kind === "dust" ? 3.8 : kind === "ash" ? 2.4 : kind === "ember" ? 1.7 : kind === "pollen" ? 1.25 : 1;
  const alphaBase = kind === "mist" ? 0.035 : kind === "dust" ? 0.055 : 0.07;
  return {
    x: wrap(originX + timeMs * driftX, screenW),
    y: wrap(originY + timeMs * driftY, screenH),
    size: 0.65 + hash01(lane + 53) * (kind === "mist" ? 3.4 : kind === "dust" ? 1.5 : 1.8),
    alpha: alphaBase + hash01(lane + 71) * (kind === "mist" ? 0.055 : 0.12),
    color,
    rotation: Math.atan2(driftY, driftX),
    trail,
  };
}

export function paintTerrainWeather(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  _cam: Camera,
  clockMs = 0,
  reducedMotion = false,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (w <= 0 || h <= 0) return;
  if (reducedMotion) return;
  const kind = weatherKindForBiome(state.biome);
  const particleCount = kind === "mist" ? 64 : kind === "dust" ? 88 : 96;
  ctx.save();
  for (let i = 0; i < Math.min(PARTICLE_COUNT, particleCount); i++) {
    const particle = weatherParticleAt(state.seed, state.biome, i, clockMs, w, h);
    ctx.globalAlpha = particle.alpha;
    const radiusX = particle.size;
    const radiusY = particle.size * 0.62;
    if (particle.trail > 1.05) {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, radiusX * particle.trail, radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      const sprite = particleSprite(particle.color);
      if (sprite) {
        ctx.drawImage(sprite, particle.x - radiusX, particle.y - radiusY, radiusX * 2, radiusY * 2);
      } else {
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.ellipse(particle.x, particle.y, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
