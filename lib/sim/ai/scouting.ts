import type { Entity, SimState, Vec2 } from "../../types";
import { isUnitEntity } from "../../types";
import { isAirUnit, isSupportUnit } from "../../catalog";
import { closestApproach, distToEntity, inBounds, isStaticWalkable } from "../world";
import { cellInfluence, type InfluenceMap } from "./influence";
import { homeGuardCount } from "../policy";
import { holdingDestination } from "../navigation";

export type ScoutAssignment = {
  unitId: number;
  target: Vec2;
  assignedTick: number;
};

type ScoutRegistry = {
  assignments: Map<number, ScoutAssignment>;
  nextTargetIndex: number;
};

const scoutState = new WeakMap<SimState, ScoutRegistry>();

function sameTile(a: { x: number; y: number } | undefined, b: { x: number; y: number }): boolean {
  return !!a && Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
}

function scoutsFor(state: SimState): ScoutRegistry {
  let registry = scoutState.get(state);
  if (!registry) {
    registry = { assignments: new Map(), nextTargetIndex: 0 };
    scoutState.set(state, registry);
  }
  return registry;
}

export function pickScoutTarget(state: SimState, index: number): Vec2 {
  // Generate quadrant reconnaissance patrol points
  const margin = 8;
  const qw = state.width - margin * 2;
  const qh = state.height - margin * 2;
  const points: Vec2[] = [
    { x: margin + Math.round(qw * 0.2), y: margin + Math.round(qh * 0.2) },
    { x: Math.round(state.width * 0.5), y: Math.round(state.height * 0.5) },
    { x: margin + Math.round(qw * 0.8), y: margin + Math.round(qh * 0.2) },
    { x: margin + Math.round(qw * 0.8), y: margin + Math.round(qh * 0.8) },
    { x: margin + Math.round(qw * 0.2), y: margin + Math.round(qh * 0.8) },
  ];
  for (let offset = 0; offset < points.length; offset++) {
    const selected = points[(index + offset) % points.length]!;
    if (inBounds(state, selected.x, selected.y) && isStaticWalkable(state, selected.x, selected.y)) {
      return selected;
    }
  }

  const center = { x: Math.round(state.width / 2), y: Math.round(state.height / 2) };
  if (inBounds(state, center.x, center.y) && isStaticWalkable(state, center.x, center.y)) return center;

  // Keep the API total for degenerate maps, but prefer the nearest valid tile
  // over returning another known-invalid destination.
  let fallback: Vec2 | undefined;
  let fallbackDistance = Infinity;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (!isStaticWalkable(state, x, y)) continue;
      const distance = Math.hypot(x - center.x, y - center.y);
      if (
        distance < fallbackDistance
        || (distance === fallbackDistance && (y < (fallback?.y ?? Infinity) || (y === fallback?.y && x < (fallback?.x ?? Infinity))))
      ) {
        fallback = { x, y };
        fallbackDistance = distance;
      }
    }
  }
  return fallback ?? center;
}

export function isActiveScout(state: SimState, unitId: number): boolean {
  return scoutsFor(state).assignments.has(unitId);
}

export function updateScouts(
  state: SimState,
  units: Entity[],
  influence: InfluenceMap,
  hasDiscoveredPlayerYard: boolean,
  yard?: Entity,
): { unit: Entity; target: Vec2 }[] {
  const registry = scoutsFor(state);
  const activeScouts = registry.assignments;
  const assignments: { unit: Entity; target: Vec2 }[] = [];
  const reusableScoutIds = new Set<number>();

  // Cleanup destroyed or busy units and pull an active scout back when its
  // local threat substantially exceeds the available friendly support.
  for (const [unitId, scout] of activeScouts) {
    const unit = units.find((u) => u.id === unitId);
    if (!unit || unit.hp <= 0 || unit.attackTarget !== undefined) {
      activeScouts.delete(unitId);
      continue;
    }
    if (unit.scenarioGuardTargetId !== undefined) {
      activeScouts.delete(unitId);
      continue;
    }
    if (yard && shouldScoutRetreat(unit, influence)) {
      assignments.push({ unit, target: closestApproach(state, unit, yard) });
      continue;
    }
    const holding = holdingDestination(unit);
    if (holding && state.tick > scout.assignedTick) {
      activeScouts.delete(unitId);
      reusableScoutIds.add(unitId);
      continue;
    }
    if (!holding && unit.routePending === false && unit.path.length === 0) {
      activeScouts.delete(unitId);
      reusableScoutIds.add(unitId);
      continue;
    }
    if (!hasDiscoveredPlayerYard && (unit.orderMode !== "move" || !sameTile(unit.orderDestination, scout.target))) {
      assignments.push({ unit, target: scout.target });
      continue;
    }
    if (state.tick - scout.assignedTick > 480) {
      activeScouts.delete(unitId);
      if (!hasDiscoveredPlayerYard && unit.idle) reusableScoutIds.add(unitId);
    }
  }

  if (assignments.length > 0) return assignments;

  // If player yard is already known and engaged, scouting priority drops
  if (hasDiscoveredPlayerYard && activeScouts.size > 0) {
    return assignments;
  }

  // Maximum 1 scout in opening/early phases to avoid depleting base defense
  if (activeScouts.size >= 1) return assignments;

  const homeReserve = homeGuardCount(state.missionIndex);
  const defenders = yard
    ? [...units]
        .filter((u) => isUnitEntity(u) && u.scenarioGuardTargetId === undefined && !isAirUnit(u.kind) && !isSupportUnit(u.kind) && u.kind !== "harvester")
        .sort((a, b) => distToEntity(a, yard) - distToEntity(b, yard) || a.id - b.id)
        .slice(0, homeReserve)
    : [];
  const defenderIds = new Set(defenders.map((u) => u.id));

  // Find a candidate: surplus ground combat unit with full health that is idle and not guarding base
  const candidate = units.find((u) => {
    if (!isUnitEntity(u) || u.owner !== 1 || u.hp < u.maxHp) return false;
    if (isAirUnit(u.kind) || isSupportUnit(u.kind) || u.kind === "harvester") return false;
    const failedScoutRoute = reusableScoutIds.has(u.id) && u.routePending !== undefined && u.path.length === 0;
    if (u.attackTarget !== undefined || (!u.idle && !failedScoutRoute)) return false;
    if (reusableScoutIds.size > 0 && !reusableScoutIds.has(u.id)) return false;
    if (hasDiscoveredPlayerYard && u.orderDestination !== undefined && !reusableScoutIds.has(u.id)) return false;
    if (u.scenarioGuardTargetId !== undefined) return false;
    if (defenderIds.has(u.id)) return false;
    if (activeScouts.has(u.id)) return false;
    return true;
  });

  if (!candidate) return assignments;

  const reusingCompletedScout = reusableScoutIds.has(candidate.id);
  const target = pickScoutTarget(
    state,
    hasDiscoveredPlayerYard && !reusingCompletedScout ? 0 : registry.nextTargetIndex,
  );
  if (!hasDiscoveredPlayerYard || reusingCompletedScout) {
    registry.nextTargetIndex = (registry.nextTargetIndex + 1) % 5;
  } else {
    // A replacement scout starts with the primary patrol point. Only a scout
    // that completed its own route advances the patrol rotation.
    registry.nextTargetIndex = 1;
  }
  activeScouts.set(candidate.id, {
    unitId: candidate.id,
    target,
    assignedTick: state.tick,
  });

  assignments.push({ unit: candidate, target });
  return assignments;
}

export function shouldScoutRetreat(unit: Entity, influence: InfluenceMap): boolean {
  const inf = cellInfluence(influence, unit.x, unit.y);
  // If local threat substantially exceeds local friendly presence, scout retreats
  return inf.threat > 30 && inf.threat > inf.friendly * 2;
}
