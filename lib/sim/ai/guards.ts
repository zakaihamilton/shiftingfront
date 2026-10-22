import type { Entity, Owner, SimState } from "../../types";
import { byId, closestApproach, distToEntity } from "../world";
import { assignMove } from "./combat";
import { contestedResourcePoint, distance } from "./helpers";
import { aiDifficultyMission } from "../difficulty";
import { homeGuardCount, isTimedRecovery } from "../policy";
import { directorPhase } from "./phase";

export function guardScenarioObjectives(state: SimState, units: Entity[]): void {
  const runtime = state.runtime;
  if (!runtime || !["sabotage", "destroyMarked", "rescue", "extraction"].includes(runtime.kind)) return;
  const targets = runtime.targetIds
    .map((id) => byId(state, id))
    .filter((entity): entity is Entity => {
      if (!entity || entity.hp <= 0) return false;
      return isTimedRecovery(runtime.kind)
        ? entity.owner === 0 && entity.neutral === true
        : entity.owner === 1;
    });

  const activeTargetIds = new Set(targets.map((target) => target.id));
  for (const unit of units) {
    if (unit.scenarioGuardTargetId === undefined || activeTargetIds.has(unit.scenarioGuardTargetId)) continue;
    unit.scenarioGuardTargetId = undefined;
    if (unit.attackTarget === undefined) {
      unit.orderDestination = undefined;
      unit.path = [];
      unit.flowGoal = undefined;
      unit.routePending = false;
      unit.idle = true;
    }
  }
  if (!targets.length || !units.length) return;
  // Assign each guard at most one objective. If there are more targets than
  // guards, repeatedly assigning the same unit would make it flip between
  // perimeter tiles every tick.
  targets.slice(0, units.length).forEach((target, index) => {
    const guard = units.find((unit) => unit.scenarioGuardTargetId === target.id)
      ?? units.find((unit) => unit.scenarioGuardTargetId === undefined)
      ?? units[index % units.length]!;
    if (guard.attackTarget !== undefined) return;
    // Keep the selected perimeter tile stable while the guard approaches the
    // same building. Recomputing the nearest tile from a sub-tile position
    // can alternate between two equally close tiles at the midpoint.
    if (guard.scenarioGuardTargetId === target.id && guard.orderMode === "move") return;
    guard.scenarioGuardTargetId = target.id;
    assignMove(state, guard, closestApproach(state, guard, target));
  });
}

export function guardResourceLane(
  state: SimState,
  units: Entity[],
  yard: Entity,
  knownPlayers?: Entity[],
  aiOwner: Owner = 1,
  opponents: readonly Owner[] = [0],
): void {
  if (directorPhase(state) === "opening") return;
  const point = contestedResourcePoint(state, yard, knownPlayers, aiOwner, opponents);
  const guardIndex = homeGuardCount(aiDifficultyMission(state));
  if (!point || units.length <= guardIndex) return;

  const guard = [...units]
    .filter((unit) => unit.scenarioGuardTargetId === undefined)
    .sort((a, b) => distToEntity(a, yard) - distToEntity(b, yard) || a.id - b.id)[guardIndex];
  if (!guard || guard.attackTarget !== undefined) return;
  if (guard.orderDestination && distance(guard.orderDestination, point) < 2 && guard.orderMode === "move") return;
  assignMove(state, guard, point);
}
