import { nearest, byId } from "@/lib/sim/world";
import { assignAttack } from "@/lib/sim/ai/combat";
import { assignSupportTarget } from "@/lib/sim/support";
import { isSupportUnit, UNIT_STATS } from "@/lib/catalog";
import type { Entity, UnitKind } from "@/lib/types";
import type { createMission } from "@/lib/sim/api";
import { CINEMA_SCENARIOS, type CinemaScenarioKind, type CinemaTargetPolicy } from "./scenarios";

function isCombatUnit(entity: Entity): boolean {
  return entity.class === "unit"
    && entity.hp > 0
    && !isSupportUnit(entity.kind as UnitKind)
    && UNIT_STATS[entity.kind as UnitKind].damage > 0;
}

function objectiveFor(
  state: ReturnType<typeof createMission>,
  unit: Entity,
  policy: CinemaTargetPolicy,
  objectiveId: number | undefined,
): Entity | undefined {
  const objective = objectiveId === undefined ? undefined : byId(state, objectiveId);
  if (!objective || objective.hp <= 0) return undefined;

  if (policy === "enemyStructure" && unit.owner === 0 && objective.owner === 1) return objective;
  if (policy === "playerStructure" && unit.owner === 1 && objective.owner === 0) return objective;
  if (policy === "infantry" && unit.owner === 1 && objective.owner === 0 && objective.class === "building") return objective;
  if (policy === "harvester" && unit.owner === 0 && objective.class === "unit" && objective.kind === "harvester") return objective;
  if (policy === "convoy" && unit.owner === 0 && objective.class === "unit" && objective.kind === "convoyTruck") return objective;
  return undefined;
}

function fallbackTarget(
  state: ReturnType<typeof createMission>,
  unit: Entity,
  policy: CinemaTargetPolicy,
  clashX: number,
  clashY: number,
  radius: number,
): Entity | undefined {
  return nearest(
    state,
    unit,
    (entity) => {
      if (entity.owner === unit.owner || Math.hypot(entity.x - clashX, entity.y - clashY) > radius) return false;
      if (!isCombatUnit(entity)) return false;
      if (policy === "armor") return entity.kind === "tank" || entity.kind === "antiArmor";
      if (policy === "infantry") return entity.kind === "infantry" || entity.kind === "antiArmor";
      return true;
    },
  );
}

export function assignClashTargets(
  state: ReturnType<typeof createMission>,
  scenarioKind: CinemaScenarioKind,
  objectiveId: number | undefined,
  clashX: number,
  clashY: number,
  radius = 8,
): void {
  const policy = CINEMA_SCENARIOS[scenarioKind].targetPolicy;
  const units = state.entities.filter((e) => e.class === "unit" && e.hp > 0);
  for (const u of units) {
    if (isSupportUnit(u.kind as UnitKind)) {
      if (u.supportTargetId === undefined || u.idle) {
        const target = nearest(
          state,
          u,
          (e) => e.owner === u.owner && e.hp > 0 && e.hp < e.maxHp && Math.hypot(e.x - clashX, e.y - clashY) <= radius,
        );
        if (target) assignSupportTarget(state, u, target);
      }
    } else if (UNIT_STATS[u.kind as UnitKind].damage > 0 && (u.attackTarget === undefined || u.idle)) {
      const target = objectiveFor(state, u, policy, objectiveId)
        ?? fallbackTarget(state, u, policy, clashX, clashY, radius);
      if (target) assignAttack(state, u, target);
    }
  }
}
