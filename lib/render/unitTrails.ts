import { isAirUnit } from "../catalog";
import { TILE_H, tileToScreen, type Camera } from "../iso";
import { fogAt } from "../sim/fog";
import { groundHeight } from "../sim/world";
import { SURFACE_NONE, TILE_WATER, type SimState } from "../types";
import { movementDustFill } from "./unitMotion";

export const MAX_UNIT_TRAIL_MARKS = 512;
export const MAX_UNIT_TRAIL_PARTICLES = 192;
export type TrailMark = { x: number; y: number; born: number; heading: number; walker: boolean; side: number; surface: "dry" | "snow" | "mud" | "water"; particle: boolean; life: number };
type TrailHistory = { x: number; y: number; side: number };
let marks: TrailMark[] = [];
const history = new Map<number, TrailHistory>();
let session = "";
let lastClock = 0;

export function clearUnitTrails(): void { marks = []; history.clear(); session = ""; lastClock = 0; }

export function unitTrailSurface(state: SimState, x: number, y: number): TrailMark["surface"] | null {
  const ix = Math.round(x), iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= state.width || iy >= state.height) return null;
  const index = iy * state.width + ix;
  if ((state.surfaces?.[index] ?? SURFACE_NONE) !== SURFACE_NONE) return null;
  if (state.tiles[index] === TILE_WATER) return "water";
  if (state.biome === "tundra grid") return "snow";
  if (state.biome === "salt marshes" || state.biome === "jungle wreckage") return "mud";
  return "dry";
}

/** Sample distance, rather than frames, so trails have the same spacing at every refresh rate. */
export function updateUnitTrails(state: SimState, positions: ReadonlyMap<number, { x: number; y: number }>, now: number, reducedMotion = false): readonly TrailMark[] {
  const key = `${state.seed}:${state.missionIndex}:${state.width}:${state.height}`;
  if (session !== key || now < lastClock) clearUnitTrails();
  session = key; lastClock = now;
  marks = marks.filter(mark => now - mark.born < mark.life && (!reducedMotion || !mark.particle));
  const active = new Set<number>();
  for (const e of state.entities) {
    if (e.class !== "unit" || e.hp <= 0 || isAirUnit(e.kind)) continue;
    active.add(e.id);
    const position = positions.get(e.id) ?? e;
    const previous = history.get(e.id);
    if (!previous) { history.set(e.id, { ...position, side: 1 }); continue; }
    const dx = position.x - previous.x, dy = position.y - previous.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 2 || fogAt(state, Math.round(position.x), Math.round(position.y)) !== 2) {
      history.set(e.id, { ...position, side: previous.side }); continue;
    }
    const walker = ["infantry", "antiArmor", "medic"].includes(e.kind);
    const spacing = walker ? 0.24 : 0.32;
    if (distance + 1e-9 < spacing) continue;
    const count = Math.min(6, Math.floor((distance + 1e-9) / spacing));
    for (let i = 1; i <= count; i++) {
      const x = previous.x + dx / distance * spacing * i;
      const y = previous.y + dy / distance * spacing * i;
      const surface = unitTrailSurface(state, x, y);
      if (!surface || fogAt(state, Math.round(x), Math.round(y)) !== 2) continue;
      const mark: TrailMark = { x, y, born: now, heading: Math.atan2(dy, dx), walker, side: previous.side, surface, particle: false, life: surface === "water" ? 650 : 7000 };
      marks.push(mark);
      if (!reducedMotion && surface !== "mud") marks.push({ ...mark, particle: true, life: surface === "water" ? 500 : 1250 });
      previous.side *= -1;
    }
    previous.x += dx / distance * spacing * count; previous.y += dy / distance * spacing * count;
  }
  for (const id of history.keys()) if (!active.has(id)) history.delete(id);
  const ground = marks.filter(mark => !mark.particle).slice(-MAX_UNIT_TRAIL_MARKS);
  const particles = marks.filter(mark => mark.particle).slice(-MAX_UNIT_TRAIL_PARTICLES);
  marks = [...ground, ...particles];
  return marks;
}

export function drawUnitTrails(ctx: CanvasRenderingContext2D, state: SimState, cam: Camera, trails: readonly TrailMark[], now: number): void {
  const z = cam.zoom;
  ctx.save();
  for (const mark of trails) {
    if (fogAt(state, Math.round(mark.x), Math.round(mark.y)) !== 2) continue;
    const p = tileToScreen(mark.x, mark.y, cam, groundHeight(state, mark.x, mark.y));
    if (p.x < -60 * z || p.y < -60 * z || p.x > ctx.canvas.width + 60 * z || p.y > ctx.canvas.height + 60 * z) continue;
    const age = Math.max(0, (now - mark.born) / mark.life);
    const headingX = Math.cos(mark.heading) - Math.sin(mark.heading);
    const headingY = (Math.cos(mark.heading) + Math.sin(mark.heading)) * 0.5;
    ctx.save();
    ctx.translate(p.x, p.y + TILE_H / 2 * z);
    ctx.rotate(Math.atan2(headingY, headingX));
    ctx.globalAlpha = (1 - age) * (mark.particle ? 0.24 : mark.surface === "snow" ? 0.22 : 0.14);
    ctx.fillStyle = mark.particle ? mark.surface === "snow" ? "#cfebee" : movementDustFill(state.biome) : mark.surface === "snow" ? "#607a8a" : "#202827";
    if (mark.surface === "water") {
      ctx.strokeStyle = "#b5e2eb"; ctx.lineWidth = Math.max(0.5, z);
      ctx.beginPath(); ctx.ellipse(0, 0, (3 + age * 13) * z, (1.5 + age * 6) * z, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (mark.particle) {
      ctx.beginPath(); ctx.ellipse(-age * 9 * z, -age * 3 * z, (2 + age * 6) * z, (1 + age * 3) * z, 0, 0, Math.PI * 2); ctx.fill();
    } else if (mark.walker) {
      ctx.fillRect(-1.8 * z, mark.side * 2.5 * z, 3.6 * z, 1.6 * z);
    } else {
      for (const side of [-1, 1]) ctx.fillRect(-3 * z, side * 5 * z, 6 * z, 2 * z);
    }
    ctx.restore();
  }
  ctx.restore();
}
