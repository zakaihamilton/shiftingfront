import { footprintOf, isAirUnit, TICKS_PER_SECOND, UNIT_STATS } from "../catalog";
import type { GeneratedMap } from "../gen/map";
import { TILE_RESOURCE, isUnitEntity, type SecondaryObjective, type SimState, type Vec2 } from "../types";
import { entitiesFor } from "./entities";
import { reachableScenarioCells, reachableBuildingFilter } from "./scenarios/reachability";
import { invalidateEntityCaches, invalidateNavigation, isStaticWalkable, spawnBuildingAt, trySpawnUnit } from "./world";
import { tileInPlayerVision } from "./fog";

const OUTPOST_KINDS = new Set(["destroyMarked", "razeAll", "decapitate", "annihilate", "sabotage"]);
export const CHALLENGE_HOLD_TICKS = 60 * TICKS_PER_SECOND;

/** Pure seeded placement: no extra RNG draws enter the legacy simulation stream. */
export function configureChallenge(state: SimState, map: GeneratedMap): void {
  if (state.gameplayRulesVersion !== 2 || !state.runtime || state.multiplayer || state.tutorialStage !== undefined) return;
  const reachable = reachableScenarioCells(state);
  if (!reachable) return;
  const outpost = OUTPOST_KINDS.has(state.win.kind);
  const targetPoints = state.runtime.targetIds.map(id => entitiesFor(state).find(e => e.id === id)).filter(e => e !== undefined);
  const dx = map.enemyStart.x - map.playerStart.x;
  const dy = map.enemyStart.y - map.playerStart.y;
  const length = Math.hypot(dx, dy) || 1;
  const candidates: Array<Vec2 & { score: number }> = [];
  for (let y = 3; y < state.height - 4; y++) {
    for (let x = 3; x < state.width - 4; x++) {
      if (!reachable[y * state.width + x] || !isStaticWalkable(state, x, y) || tileInPlayerVision(state, x, y)) continue;
      const fromBase = Math.hypot(x - map.playerStart.x, y - map.playerStart.y);
      if (fromBase < 18 || Math.hypot(x - map.enemyStart.x, y - map.enemyStart.y) < 10) continue;
      if (targetPoints.some(t => Math.hypot(t.x - x, t.y - y) < 8)) continue;
      const lateral = Math.abs((x - map.playerStart.x) * dy - (y - map.playerStart.y) * dx) / length;
      if (outpost && lateral < 8) continue;
      if (!outpost && state.tiles[y * state.width + x] !== TILE_RESOURCE) continue;
      const progress = ((x - map.playerStart.x) * dx + (y - map.playerStart.y) * dy) / (length * length);
      if (progress < 0.25 || progress > 0.8) continue;
      candidates.push({ x, y, score: Math.abs(progress - 0.5) * 30 + Math.abs(lateral - 10) });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
  for (const point of candidates) {
    let challenge: SecondaryObjective;
    if (outpost) {
      const filter = reachableBuildingFilter(state, "objective", reachable);
      const target = spawnBuildingAt(state, 1, "objective", point.x, point.y, 0, true,
        (x, y) => x === point.x && y === point.y && (filter?.(x, y) ?? false), 0);
      if (!target) continue;
      target.optionalChallenge = true;
      target.marked = true;
      const after = reachableScenarioCells(state);
      const footprint = footprintOf("objective");
      // A bonus structure may occupy open ground, but must never seal a route.
      const disconnects = reachable.some((wasReachable, index) => {
        if (!wasReachable || after?.[index]) return false;
        const x = index % state.width;
        const y = Math.floor(index / state.width);
        return x < target.x || x >= target.x + footprint.w || y < target.y || y >= target.y + footprint.h;
      });
      if (disconnects) {
        target.hp = 0;
        invalidateEntityCaches(state);
        invalidateNavigation(state, target.id);
        continue;
      }
      const guard = trySpawnUnit(state, 1, "antiArmor", point.x - 1, point.y);
      if (!guard) {
        target.hp = 0;
        invalidateEntityCaches(state);
        invalidateNavigation(state, target.id);
        continue;
      }
      guard.optionalChallenge = true;
      guard.stance = "hold";
      challenge = { id: "bonus-outpost", kind: "destroyTarget", priority: "optional", targetId: target.id,
        zone: { x: target.x, y: target.y }, label: `Destroy the supply outpost at ${target.x}, ${target.y}` };
    } else {
      challenge = { id: "bonus-ore", kind: "secureZone", priority: "optional", zone: { x: point.x, y: point.y },
        radius: 3, target: CHALLENGE_HOLD_TICKS, progressTicks: 0,
        label: `Secure forward ore at ${point.x}, ${point.y} for 60 seconds` };
    }
    state.runtime.secondary = [{ id: "yard", kind: "preserveYard", priority: "primary", label: "Keep the Command HQ standing" }, challenge];
    return;
  }
  // A constrained map must still be playable without an optional objective.
  state.runtime.secondary = [{ id: "yard", kind: "preserveYard", priority: "primary", label: "Keep the Command HQ standing" }];
}

export function tickChallenges(state: SimState): void {
  if (state.result !== "playing") return;
  for (const objective of state.runtime?.secondary ?? []) {
    if (objective.completed || objective.priority !== "optional") continue;
    if (objective.kind === "destroyTarget" && objective.targetId !== undefined) {
      objective.completed = !entitiesFor(state).some(e => e.id === objective.targetId && e.hp > 0);
    } else if (objective.kind === "secureZone" && objective.zone && objective.target) {
      let friendly = false;
      let contested = false;
      for (const e of entitiesFor(state)) {
        if (e.hp <= 0 || e.neutral || !isUnitEntity(e) || isAirUnit(e.kind)) continue;
        if (Math.hypot(e.x - objective.zone.x, e.y - objective.zone.y) > (objective.radius ?? 3)) continue;
        if (e.owner === 0 && UNIT_STATS[e.kind].damage > 0) friendly = true;
        if (e.owner !== 0 && UNIT_STATS[e.kind].damage > 0) contested = true;
      }
      objective.progressTicks = friendly && !contested ? (objective.progressTicks ?? 0) + 1 : 0;
      objective.completed = objective.progressTicks >= objective.target;
    }
  }
}
