import { isAirUnit, isSupportUnit, UNIT_STATS } from "../../catalog";
import { isUnitEntity, type Entity, type SimState } from "../../types";
import { tryFindPathDetailed } from "../pathBudget";
import { routePendingFor } from "../pathfinding";
import { byId, closestApproach, distToEntity, livingView } from "../world";
import { contestedResourcePoint } from "./helpers";
import { homeGuardCount } from "../policy";
import { nearestKnownPlayer } from "./visibility";
import { launchAircraft } from "../aircraft";
import { buildInfluenceMap, findWeakestFlank } from "./influence";

function sameTile(a: { x: number; y: number } | undefined, b: { x: number; y: number }): boolean {
  return !!a && Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
}

export function enemyCombat(state: SimState): Entity[] {
  return livingView(state).filter((e) => e.owner === 1 && isUnitEntity(e) && UNIT_STATS[e.kind].damage > 0 && !isSupportUnit(e.kind));
}

export function sendHome(state: SimState, unit: Entity, yard: Entity): void {
  if (unit.class === "unit" && isAirUnit(unit.kind)) {
    unit.attackTarget = undefined;
    unit.orderMode = "move";
    unit.orderDestination = { x: yard.x, y: yard.y };
    unit.path = [];
    unit.routePending = false;
    unit.idle = false;
    return;
  }
  const destination = { x: yard.x, y: yard.y };
  // The director runs every simulation tick. Preserve an existing route to
  // this yard; repeatedly selecting the nearest perimeter tile can otherwise
  // alternate between two equally good tiles while the unit moves.
  if (unit.orderMode === "move" && sameTile(unit.orderDestination, destination) && unit.attackTarget === undefined) return;
  unit.attackTarget = undefined;
  unit.flowGoal = undefined;
  unit.orderMode = "move";
  unit.orderDestination = destination;
  unit.idle = false;
  const result = tryFindPathDetailed(state, unit, closestApproach(state, unit, yard));
  if (result) {
    unit.path = result.path;
    unit.routePending = routePendingFor(result.status);
  } else {
    unit.routePending = true;
  }
}

export function assignAttack(state: SimState, unit: Entity, target: Entity): void {
  if (unit.class === "unit" && isAirUnit(unit.kind)) {
    if (unit.flightState === "servicing" && (unit.ammo ?? 0) <= 0) return;
    launchAircraft(state, unit);
  }
  unit.attackTarget = target.id;
  unit.flowGoal = undefined;
  unit.orderMode = "attack";
  unit.orderDestination = { x: target.x, y: target.y };
  unit.idle = false;
  if (unit.class === "unit" && isAirUnit(unit.kind)) {
    unit.path = [];
    unit.routePending = false;
    return;
  }
  const result = tryFindPathDetailed(state, unit, closestApproach(state, unit, target));
  if (result) {
    unit.path = result.path;
    unit.routePending = routePendingFor(result.status);
  } else {
    unit.routePending = true;
  }
}

export function assignMove(state: SimState, unit: Entity, destination: { x: number; y: number }): void {
  if (unit.orderMode === "move" && sameTile(unit.orderDestination, destination) && unit.attackTarget === undefined) return;
  unit.attackTarget = undefined;
  unit.flowGoal = undefined;
  unit.orderMode = "move";
  unit.orderDestination = { x: destination.x, y: destination.y };
  unit.idle = false;
  const result = tryFindPathDetailed(state, unit, destination);
  if (result) {
    unit.path = result.path;
    unit.routePending = routePendingFor(result.status);
  } else {
    unit.routePending = true;
  }
}

export function scenarioAssaultTarget(state: SimState, from: Entity): Entity | undefined {
  const runtime = state.runtime;
  if (!runtime) return undefined;
  const candidates = runtime.targetIds
    .map((id) => byId(state, id))
    .filter((entity): entity is Entity => {
      if (!entity || entity.hp <= 0 || entity.owner !== 0) return false;
      if (runtime.kind === "escort") return runtime.convoyStartTick === undefined && entity.scenarioRole === "convoy";
      if (runtime.kind === "extraction") return entity.scenarioRole === "cargo" && !entity.neutral && !runtime.extractedIds?.includes(entity.id);
      // Contacted evacuees are protected from automatic enemy acquisition
      // while they return to HQ. The player still controls their movement;
      // enemy units focus the escorting force instead of invalidating contact.
      if (runtime.kind === "rescue") return false;
      return false;
    });
  const sorted = candidates.sort((a, b) => distToEntity(from, a) - distToEntity(from, b) || a.id - b.id);
  return sorted.length ? sorted[from.id % sorted.length] : undefined;
}

export function assignAssault(
  state: SimState,
  units: Entity[],
  yard: Entity,
  playerYard: Entity,
  retarget: boolean,
  knownPlayers?: Entity[],
): void {
  const guards = homeGuardCount(state.missionIndex);
  if (!retarget) {
    let allAssigned = true;
    for (const unit of units) {
      let guard = 0;
      const unitDistance = distToEntity(unit, yard);
      for (const other of units) {
        if (other === unit) continue;
        const otherDistance = distToEntity(other, yard);
        if (otherDistance < unitDistance || (otherDistance === unitDistance && other.id < unit.id)) guard += 1;
      }
      if (guard < guards) continue;
      if (unit.attackTarget === undefined || !byId(state, unit.attackTarget)) {
        allAssigned = false;
        break;
      }
    }
    if (allAssigned) return;
  }
  const sorted = [...units].sort((a, b) => distToEntity(a, yard) - distToEntity(b, yard) || a.id - b.id);
  const raiders = sorted.slice(guards);
  const resourcePoint = contestedResourcePoint(state, yard, knownPlayers);
  const laneHarvester = resourcePoint
    ? nearestKnownPlayer(state, resourcePoint, (e) => e.owner === 0 && e.kind === "harvester" && e.hp > 0, knownPlayers)
    : undefined;
  const harvester = laneHarvester && resourcePoint && distToEntity(resourcePoint, laneHarvester) <= 12
    ? laneHarvester
    : nearestKnownPlayer(state, yard, (e) => e.owner === 0 && e.kind === "harvester" && e.hp > 0, knownPlayers);
  const influence = buildInfluenceMap(state, knownPlayers);
  const flank = findWeakestFlank(state, influence, playerYard);
  raiders.forEach((u, index) => {
    if (!retarget && u.attackTarget !== undefined && byId(state, u.attackTarget)) return;
    const objectiveTarget = scenarioAssaultTarget(state, u);
    if (!objectiveTarget && flank && index % 3 === 0 && distToEntity(u, playerYard) > 16) {
      assignMove(state, u, flank);
      // A locally walkable flank can still be in a disconnected region. If
      // the bounded route search proves it unreachable, attack directly
      // instead of leaving this raider permanently stranded at the flank.
      if (u.routePending === false && u.path.length === 0 && Math.hypot(u.x - flank.x, u.y - flank.y) > 0.001) {
        assignAttack(state, u, harvester ?? playerYard);
      }
      return;
    }
    const target = objectiveTarget ?? (harvester && index % 2 === 1 ? playerYard : harvester ?? playerYard);
    assignAttack(state, u, target);
  });
}
