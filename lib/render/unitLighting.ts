import type { SimState } from "../types";
import { fogAt } from "../sim/fog";
import { TILE_H, tileToScreen, type Camera } from "../iso";
import { FX_DURATION, type FxBurst } from "./fx";
import type { TerrainLightRig } from "./terrainLighting";
import { spriteContentBounds } from "./sprites";

export type UnitLight = { x: number; y: number; radius: number; strength: number; color: string };
const rasters = new Map<string, HTMLCanvasElement>();
let rasterIds = new WeakMap<HTMLCanvasElement, number>();
let nextRasterId = 0;
export const MAX_LIT_UNIT_RASTERS = 256;
export const MAX_UNIT_LIGHTS = 8;

export function unitLights(state: SimState, cam: Camera, bursts: readonly FxBurst[], now: number, reducedMotion = false): UnitLight[] {
  const lights: UnitLight[] = [];
  for (let i = bursts.length - 1; i >= 0 && lights.length < MAX_UNIT_LIGHTS; i--) {
    const burst = bursts[i]!;
    const born = burst.kind === "destruction" ? burst.impactAtMs ?? burst.bornMs : burst.bornMs;
    const duration = burst.kind === "muzzle" ? Math.min(FX_DURATION.muzzle, burst.durationMs) : burst.bornMs + burst.durationMs - born;
    if (born > now || now >= born + duration || (burst.kind === "muzzle" && burst.ammoEffect === "bomb")) continue;
    if (!["muzzle", "explosion", "destruction", "repair"].includes(burst.kind)) continue;
    if (fogAt(state, Math.round(burst.x), Math.round(burst.y)) !== 2) continue;
    const p = tileToScreen(burst.x, burst.y, cam, burst.elev);
    const large = burst.kind === "explosion" || burst.kind === "destruction";
    lights.push({ x: p.x, y: p.y + TILE_H / 2 * cam.zoom,
      radius: (large ? 90 : burst.kind === "repair" ? 32 : 44) * cam.zoom,
      strength: (1 - (now - born) / duration) * (large ? 0.55 : 0.35) * (reducedMotion ? 0.25 : 1),
      color: burst.kind === "repair" ? "170,225,255" : "255,205,125" });
  }
  return lights;
}

export function unitLightStrength(lights: readonly UnitLight[], x: number, y: number): number {
  return Math.min(0.65, lights.reduce((sum, light) => sum + light.strength * Math.max(0, 1 - Math.hypot(x - light.x, y - light.y) / light.radius), 0));
}

/** Cache silhouette-masked scene lighting; no pixel readbacks in the render loop. */
export function litUnitRaster(image: HTMLCanvasElement, rig: TerrainLightRig, flash = 0, gear?: { phase: number; tracked: boolean; side: boolean }): HTMLCanvasElement {
  if (typeof document === "undefined") return image;
  const flashStep = Math.round(Math.min(0.65, Math.max(0, flash)) * 6);
  const gearStep = gear ? Math.floor(gear.phase * 4) % 4 : -1;
  let id = rasterIds.get(image);
  if (id === undefined) { id = nextRasterId++; rasterIds.set(image, id); }
  const key = `${id}:${rig.keyColor.r}:${rig.keyColor.g}:${rig.keyColor.b}:${rig.keyStrength}:${rig.ambient}:${rig.directionX}:${rig.directionY}:${flashStep}:${gearStep}:${gear?.tracked}:${gear?.side}`;
  const cached = rasters.get(key);
  if (cached) { rasters.delete(key); rasters.set(key, cached); return cached; }
  const canvas = document.createElement("canvas");
  canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return image;
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  const keyLight = ctx.createLinearGradient(0, 0, canvas.width * rig.directionX, canvas.height * rig.directionY);
  const { r, g, b } = rig.keyColor;
  keyLight.addColorStop(0, `rgba(${r},${g},${b},${rig.keyStrength * 0.8})`);
  keyLight.addColorStop(0.55, "rgba(0,0,0,0)");
  keyLight.addColorStop(1, `rgba(12,24,42,${(1 - rig.ambient) * 0.6})`);
  ctx.fillStyle = keyLight; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (flashStep) {
    ctx.fillStyle = `rgba(255,219,155,${flashStep / 6})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (gear) {
    const bounds = spriteContentBounds(image);
    if (bounds) {
      ctx.save();
      ctx.beginPath(); ctx.rect(bounds.minX, bounds.minY + bounds.height * 0.78, bounds.width, bounds.height * 0.22); ctx.clip();
      ctx.strokeStyle = "rgba(157,191,195,0.22)";
      ctx.lineWidth = Math.max(0.65, image.width / 150);
      if (gear.tracked) {
        const spacing = bounds.width / 12;
        for (let i = -1; i < 13; i++) {
          const x = bounds.minX + (i + gearStep / 4) * spacing;
          ctx.beginPath(); ctx.moveTo(x, bounds.minY + bounds.height * 0.95);
          ctx.lineTo(x + spacing * 0.3, bounds.minY + bounds.height); ctx.stroke();
        }
      }
      if (gear.side) {
        const wheels = gear.tracked ? 6 : 2;
        for (let i = 0; i < wheels; i++) {
          const x = bounds.minX + bounds.width * (0.14 + i * 0.72 / Math.max(1, wheels - 1));
          const y = bounds.minY + bounds.height * 0.87;
          const angle = gearStep * Math.PI / 2 + i;
          const radius = bounds.height * 0.045;
          ctx.beginPath(); ctx.moveTo(x - Math.cos(angle) * radius, y - Math.sin(angle) * radius);
          ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
  ctx.globalCompositeOperation = "source-over";
  if (rasters.size >= MAX_LIT_UNIT_RASTERS) rasters.delete(rasters.keys().next().value!);
  rasters.set(key, canvas);
  return canvas;
}

export function drawUnitGroundLights(ctx: CanvasRenderingContext2D, lights: readonly UnitLight[]): void {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const light of lights) {
    const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
    gradient.addColorStop(0, `rgba(${light.color},${light.strength * 0.3})`);
    gradient.addColorStop(1, `rgba(${light.color},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(light.x - light.radius, light.y - light.radius, light.radius * 2, light.radius * 2);
  }
  ctx.restore();
}

export function clearUnitLighting(): void { rasters.clear(); rasterIds = new WeakMap(); nextRasterId = 0; }
