import { isUnitAvailable, UNIT_STATS } from "../../catalog";
import { TILE_RESOURCE } from "../../types";
import type { Entity, SimState, UnitKind, Vec2 } from "../../types";
import { BUILDING_PLACEMENT_RADIUS, canPlaceBuilding, findBuildSite, livingView, powerFor } from "../world";
import { objectiveContractFor } from "../../gen/profile";
import { nearestKnownPlayer } from "./visibility";

export const RETREAT_ENTER_HEALTH = 0.35;
export const RETREAT_RECOVER_HEALTH = 0.5;
export const RETREAT_MAX_TICKS = 240;

const RESOURCE_SCAN_INTERVAL = 24;
const resourcePointCache = new WeakMap<SimState, { tick: number; point?: Vec2 }>();

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function contestedResourcePoint(state: SimState, yard: Entity, knownPlayers?: Entity[]): Vec2 | undefined {
  const cached = resourcePointCache.get(state);
  if (cached && state.tick - cached.tick < RESOURCE_SCAN_INTERVAL) return cached.point;

  const playerYard = nearestKnownPlayer(
    state,
    yard,
    (entity) => entity.owner === 0 && entity.kind === "constructionYard",
    knownPlayers,
  );
  let best: Vec2 | undefined;
  let bestScore = Infinity;
  let fallback: Vec2 | undefined;
  let fallbackDistance = Infinity;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const index = y * state.width + x;
      if (state.tiles[index] !== TILE_RESOURCE || (state.resourceAmount[index] ?? 0) <= 0) continue;
      const point = { x, y };
      const enemyDistance = distance(yard, point);
      if (enemyDistance < 10) continue;
      if (hasBuildingNear(state, "refinery", point, 8)) continue;
      if (enemyDistance < fallbackDistance) {
        fallbackDistance = enemyDistance;
        fallback = point;
      }
      const playerDistance = playerYard ? distance(playerYard, point) : enemyDistance;
      const score = enemyDistance + Math.abs(enemyDistance - playerDistance) * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = point;
      }
    }
  }
  const point = best ?? fallback;
  resourcePointCache.set(state, { tick: state.tick, point });
  return point;
}

export function hasBuildingNear(state: SimState, kind: "power" | "refinery", point: Vec2, radius: number): boolean {
  const radius2 = radius * radius;
  for (const entity of livingView(state)) {
    if (entity.owner !== 1 || entity.class !== "building" || entity.kind !== kind) continue;
    const dx = entity.x - point.x;
    const dy = entity.y - point.y;
    if (dx * dx + dy * dy <= radius2) return true;
  }
  return false;
}

export function forwardRelaySite(state: SimState, yard: Entity, point: Vec2): Vec2 | undefined {
  const dx = point.x - yard.x;
  const dy = point.y - yard.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0) return undefined;
  const direction = { x: dx / length, y: dy / length };
  const minimumForwardDistance = BUILDING_PLACEMENT_RADIUS / 2;

  for (let retreat = 0; retreat <= Math.ceil(length); retreat += 1) {
    const desired = {
      x: Math.round(point.x - direction.x * retreat),
      y: Math.round(point.y - direction.y * retreat),
    };
    const spot = findBuildSite(state, "power", desired.x, desired.y, 4, 1);
    if (!spot || distance(spot, yard) < minimumForwardDistance) continue;
    return spot;
  }
  return undefined;
}

export function forwardRefinerySite(state: SimState, yard: Entity, point: Vec2): Vec2 | undefined {
  const cx = Math.round(point.x);
  const cy = Math.round(point.y);
  for (let radius = 0; radius <= 10; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const spot = { x: cx + dx, y: cy + dy };
        if (distance(spot, yard) < 10) continue;
        if (canPlaceBuilding(state, "refinery", spot.x, spot.y, 1)) return spot;
      }
    }
  }
  return undefined;
}

export function queueUnit(state: SimState, producer: Entity, kind: UnitKind): boolean {
  if (!isUnitAvailable(kind, state.missionIndex)) return false;
  if (producer.class !== "building" || producer.constructing > 0 || producer.producing) return false;
  if (producer.kind === "runway" && producer.assignedPlaneId !== undefined) return false;
  const cost = UNIT_STATS[kind].cost;
  if (state.credits[1] < cost || powerFor(state, 1) < 0) return false;
  state.credits[1] -= cost;
  producer.producing = { kind, remaining: UNIT_STATS[kind].buildTicks };
  return true;
}

export function shouldAutoRepair(state: SimState, building: Entity): boolean {
  const policy = objectiveContractFor(state.win.kind)?.repairPolicy ?? "nonTarget";
  if (policy === "none") return false;
  if (building.marked || building.kind === "objective") return false;
  return true;
}

export function shouldRetreat(state: SimState, averageHealth: number): boolean {
  if (averageHealth >= RETREAT_RECOVER_HEALTH) {
    state.aiRetreatLocked = undefined;
    state.aiRetreatTick = undefined;
  }
  if (state.aiRetreatLocked) return false;

  const holding = state.aiState === "retreat" && averageHealth < RETREAT_RECOVER_HEALTH;
  const entering = averageHealth < RETREAT_ENTER_HEALTH;
  if (!holding && !entering) {
    state.aiRetreatTick = undefined;
    return false;
  }
  if (state.aiRetreatTick === undefined) state.aiRetreatTick = state.tick;
  if (state.tick - state.aiRetreatTick >= RETREAT_MAX_TICKS) {
    state.aiRetreatLocked = true;
    state.aiRetreatTick = undefined;
    return false;
  }
  return true;
}
