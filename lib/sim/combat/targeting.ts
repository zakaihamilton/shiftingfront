import { BUILDING_STATS } from "../../catalog";
import type { Entity, SimState } from "../../types";
import { isStaticWalkable, distToEntity } from "../world";
import { statsFor } from "./grid";
import { downhillDamageMultiplier } from "../terrainRules";

export function armorFor(e: Entity): import("../../types").ArmorType {
  return e.armor ?? (e.class === "building" ? BUILDING_STATS[e.kind as import("../../types").BuildingKind].armor : statsFor(e).weapon === "smallArms" ? "light" : "heavy");
}

export function lineOfSight(state: SimState, from: { x: number; y: number }, to: Entity): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(from.x - to.x, from.y - to.y) * 2));
  const source = state.heights[Math.round(from.y) * state.width + Math.round(from.x)] ?? 1;
  const target = state.heights[Math.round(to.y) * state.width + Math.round(to.x)] ?? 1;
  const horizon = Math.max(source, target);
  for (let i = 1; i < steps; i++) {
    const x = Math.round(from.x + (to.x - from.x) * i / steps);
    const y = Math.round(from.y + (to.y - from.y) * i / steps);
    if ((state.heights[y * state.width + x] ?? 1) > horizon) return false;
  }
  return true;
}

export function firingPosition(state: SimState, from: Entity, target: Entity, range: number): { x: number; y: number } | undefined {
  const origin = { x: Math.round(from.x), y: Math.round(from.y) };
  const candidates: { x: number; y: number; distance: number }[] = [];
  const targetWidth = target.class === "building" ? BUILDING_STATS[target.kind as import("../../types").BuildingKind].footprint.w : 1;
  const targetHeight = target.class === "building" ? BUILDING_STATS[target.kind as import("../../types").BuildingKind].footprint.h : 1;
  for (let y = Math.max(0, Math.floor(target.y) - 6); y <= Math.min(state.height - 1, Math.ceil(target.y + targetHeight) + 6); y++) {
    for (let x = Math.max(0, Math.floor(target.x) - 6); x <= Math.min(state.width - 1, Math.ceil(target.x + targetWidth) + 6); x++) {
      if (x === origin.x && y === origin.y) continue;
      if (!isStaticWalkable(state, x, y)) continue;
      const point = { x, y };
      if (distToEntity(point, target) > range || !lineOfSight(state, point, target)) continue;
      candidates.push({ x, y, distance: Math.hypot(from.x - x, from.y - y) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  return candidates[0];
}

export function damageMultiplier(weapon: import("../../types").WeaponType, armor: import("../../types").ArmorType): number {
  if (weapon === "smallArms") return armor === "light" ? 1 : armor === "heavy" ? 0.45 : 0.2;
  if (weapon === "antiArmor") return armor === "heavy" ? 1.35 : armor === "structure" ? 0.95 : 0.9;
  if (weapon === "antiAir") return armor === "light" ? 1.35 : 1;
  if (weapon === "airStrike") return armor === "structure" ? 1.25 : armor === "heavy" ? 1.1 : 1.2;
  return armor === "light" ? 1.15 : 1;
}

export function heightMultiplier(state: SimState, from: Entity, to: Entity): number {
  const source = state.heights[Math.round(from.y) * state.width + Math.round(from.x)] ?? 1;
  const target = state.heights[Math.round(to.y) * state.width + Math.round(to.x)] ?? 1;
  return source > target ? downhillDamageMultiplier(state, from) : source < target ? 0.88 : 1;
}

export function heightRangeBonus(state: SimState, from: Entity, to: Entity): number {
  const source = state.heights[Math.round(from.y) * state.width + Math.round(from.x)] ?? 1;
  const target = state.heights[Math.round(to.y) * state.width + Math.round(to.x)] ?? 1;
  return source > target ? 1 : 0;
}
