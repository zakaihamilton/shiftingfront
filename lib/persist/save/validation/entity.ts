import type { AiContact, Entity, Owner } from "../../../types";
import { isRecord } from "../../utils";
import {
  ARMOR_TYPES,
  FORMATIONS,
  isBuildingKind,
  isFiniteNumber,
  isIntegerInRange,
  isNonNegativeNumber,
  isOneOf,
  isUnitKind,
  isVec2,
  ORDER_MODES,
  SCENARIO_ROLES,
  STANCES,
  WEAPON_TYPES,
} from "./primitives";

export function isEntity(
  value: unknown,
  options: {
    allowedOwners?: readonly Owner[];
    maxQueueLength?: number;
    maxPathLength?: number;
  } = {},
): value is Entity {
  if (!isRecord(value)) return false;
  if (value.optionalChallenge !== undefined && typeof value.optionalChallenge !== "boolean") {
    return false;
  }
  const allowedOwners: readonly Owner[] = options.allowedOwners ?? [0, 1];
  const classIsUnit = value.class === "unit";
  const classIsBuilding = value.class === "building";
  if (!classIsUnit && !classIsBuilding) return false;
  const kindValid = classIsUnit ? isUnitKind(value.kind) : isBuildingKind(value.kind);
  if (
    !kindValid ||
    !isIntegerInRange(value.id, 0, Number.MAX_SAFE_INTEGER) ||
    !allowedOwners.includes(value.owner as Owner) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.hp) ||
    !isFiniteNumber(value.maxHp) ||
    value.maxHp <= 0 ||
    value.hp < 0 ||
    value.hp > value.maxHp ||
    !isNonNegativeNumber(value.cooldown) ||
    !Array.isArray(value.path) ||
    (options.maxPathLength !== undefined && value.path.length > options.maxPathLength) ||
    !value.path.every(isVec2) ||
    !isNonNegativeNumber(value.carry) ||
    !isNonNegativeNumber(value.constructing) ||
    !Array.isArray(value.queue) ||
    (options.maxQueueLength !== undefined && value.queue.length > options.maxQueueLength) ||
    !value.queue.every(isUnitKind) ||
    typeof value.marked !== "boolean" ||
    typeof value.idle !== "boolean"
  ) {
    return false;
  }
  if (
    value.attackTarget !== undefined &&
    !isIntegerInRange(value.attackTarget, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (
    value.lastFiredTargetId !== undefined &&
    !isIntegerInRange(value.lastFiredTargetId, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (
    value.producing !== undefined &&
    (!isRecord(value.producing) ||
      !isUnitKind(value.producing.kind) ||
      !isNonNegativeNumber(value.producing.remaining))
  ) {
    return false;
  }
  if (value.gatherX !== undefined && !isFiniteNumber(value.gatherX)) return false;
  if (value.gatherY !== undefined && !isFiniteNumber(value.gatherY)) return false;
  if (value.facing !== undefined && !isIntegerInRange(value.facing, 0, 7)) return false;
  if (value.repairing !== undefined && typeof value.repairing !== "boolean") return false;
  if (value.neutral !== undefined && typeof value.neutral !== "boolean") return false;
  if (value.scenarioRole !== undefined && !isOneOf(value.scenarioRole, SCENARIO_ROLES)) {
    return false;
  }
  if (value.orderMode !== undefined && !isOneOf(value.orderMode, ORDER_MODES)) return false;
  if (value.orderDestination !== undefined && !isVec2(value.orderDestination)) return false;
  if (value.rallyPoint !== undefined && (!classIsBuilding || !isVec2(value.rallyPoint))) {
    return false;
  }
  if (
    value.refineryHarvesterPending !== undefined &&
    (typeof value.refineryHarvesterPending !== "boolean" ||
      !classIsBuilding ||
      value.kind !== "refinery")
  ) {
    return false;
  }
  if (value.flowGoal !== undefined && !isVec2(value.flowGoal)) return false;
  if (value.stance !== undefined && !isOneOf(value.stance, STANCES)) return false;
  if (value.suppression !== undefined && !isNonNegativeNumber(value.suppression)) return false;
  if (value.armor !== undefined && !isOneOf(value.armor, ARMOR_TYPES)) return false;
  if (value.weapon !== undefined && !isOneOf(value.weapon, WEAPON_TYPES)) return false;
  if (value.formation !== undefined && !isOneOf(value.formation, FORMATIONS)) return false;
  if (value.blockedTicks !== undefined && !isNonNegativeNumber(value.blockedTicks)) return false;
  if (value.routePending !== undefined && typeof value.routePending !== "boolean") return false;
  if (
    value.supportTargetId !== undefined &&
    !isIntegerInRange(value.supportTargetId, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (
    value.supportMode !== undefined &&
    !isOneOf(value.supportMode, ["auto", "assigned", "hold"] as const)
  ) {
    return false;
  }
  if (value.ammo !== undefined && (!classIsUnit || !isNonNegativeNumber(value.ammo))) return false;
  if (value.maxAmmo !== undefined && (!classIsUnit || !isNonNegativeNumber(value.maxAmmo))) {
    return false;
  }
  if (value.ammo !== undefined && value.maxAmmo !== undefined && value.ammo > value.maxAmmo) {
    return false;
  }
  if (
    value.assignedRunwayId !== undefined &&
    (!classIsUnit || !isIntegerInRange(value.assignedRunwayId, 0, Number.MAX_SAFE_INTEGER))
  ) {
    return false;
  }
  if (
    value.flightState !== undefined &&
    (!classIsUnit || !isOneOf(value.flightState, ["airborne", "servicing"] as const))
  ) {
    return false;
  }
  if (
    value.serviceTicks !== undefined &&
    (!classIsUnit || !isIntegerInRange(value.serviceTicks, 0, Number.MAX_SAFE_INTEGER))
  ) {
    return false;
  }
  if (
    value.landingRunwayId !== undefined &&
    (!classIsUnit || !isIntegerInRange(value.landingRunwayId, 0, Number.MAX_SAFE_INTEGER))
  ) {
    return false;
  }
  if (
    value.assignedPlaneId !== undefined &&
    (!classIsBuilding || !isIntegerInRange(value.assignedPlaneId, 0, Number.MAX_SAFE_INTEGER))
  ) {
    return false;
  }
  if (value.moveToHarvest !== undefined && typeof value.moveToHarvest !== "boolean") return false;
  if (value.veteranRank !== undefined && value.veteranRank !== 0 && value.veteranRank !== 1) {
    return false;
  }
  if (value.damageDealt !== undefined && !isNonNegativeNumber(value.damageDealt)) return false;
  if (value.braced !== undefined && typeof value.braced !== "boolean") return false;
  if (value.recruitable !== undefined && typeof value.recruitable !== "boolean") return false;
  if (
    value.bombard !== undefined &&
    (!isRecord(value.bombard) ||
      !isFiniteNumber(value.bombard.x) ||
      !isFiniteNumber(value.bombard.y) ||
      !isIntegerInRange(value.bombard.remaining, 0, 10_000))
  ) {
    return false;
  }
  return true;
}

export function isAiContact(value: unknown): value is AiContact {
  if (!isRecord(value)) return false;
  const validKind =
    value.class === "unit"
      ? isUnitKind(value.kind)
      : value.class === "building"
        ? isBuildingKind(value.kind)
        : false;
  return (
    validKind &&
    isIntegerInRange(value.id, 0, Number.MAX_SAFE_INTEGER) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isIntegerInRange(value.lastSeenTick, 0, Number.MAX_SAFE_INTEGER)
  );
}
