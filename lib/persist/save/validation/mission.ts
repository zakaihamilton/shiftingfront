import { isRecord } from "../../utils";
import {
  isBuildingKind,
  isIntegerInRange,
  isNonNegativeNumber,
  isOneOf,
  isString,
  isUnitKind,
  isVec2,
  MISSION_KINDS,
} from "./primitives";

export function isWin(value: unknown): boolean {
  if (!isRecord(value) || !isOneOf(value.kind, MISSION_KINDS)) return false;
  if (value.target !== undefined && !isNonNegativeNumber(value.target)) return false;
  if (value.role !== undefined && !isUnitKind(value.role)) return false;
  if (value.building !== undefined && !isBuildingKind(value.building)) return false;
  if (
    value.targetCount !== undefined &&
    !isIntegerInRange(value.targetCount, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (
    value.targetIds !== undefined &&
    (!Array.isArray(value.targetIds) ||
      value.targetIds.length > 8_192 ||
      !value.targetIds.every((id) => isIntegerInRange(id, 0, Number.MAX_SAFE_INTEGER)) ||
      new Set(value.targetIds).size !== value.targetIds.length)
  ) {
    return false;
  }
  if (value.ticks !== undefined && !isIntegerInRange(value.ticks, 0, Number.MAX_SAFE_INTEGER)) {
    return false;
  }
  return true;
}

function isSecondaryObjective(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.label) ||
    !isOneOf(value.kind, [
      "preserveYard",
      "destroyTarget",
      "completeBefore",
      "keepUnits",
      "secureZone",
    ] as const)
  ) {
    return false;
  }
  if (value.target !== undefined && !isNonNegativeNumber(value.target)) return false;
  if (
    value.targetId !== undefined &&
    !isIntegerInRange(value.targetId, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (value.priority !== undefined && !isOneOf(value.priority, ["primary", "optional"] as const)) {
    return false;
  }
  if (value.zone !== undefined && !isVec2(value.zone)) return false;
  if (value.radius !== undefined && !isNonNegativeNumber(value.radius)) return false;
  if (
    value.progressTicks !== undefined &&
    !isIntegerInRange(value.progressTicks, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (
    value.kind === "secureZone" &&
    (!isVec2(value.zone) || !isIntegerInRange(value.target, 1, Number.MAX_SAFE_INTEGER))
  ) {
    return false;
  }
  return value.completed === undefined || typeof value.completed === "boolean";
}

export function isRuntime(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    !isOneOf(value.kind, MISSION_KINDS) ||
    !isOneOf(value.phase, ["active", "extraction", "complete"] as const)
  ) {
    return false;
  }
  const targetIds = value.targetIds;
  if (
    !Array.isArray(targetIds) ||
    targetIds.length > 8_192 ||
    !targetIds.every((id) => isIntegerInRange(id, 0, Number.MAX_SAFE_INTEGER)) ||
    new Set(targetIds).size !== targetIds.length
  ) {
    return false;
  }
  if (
    !isIntegerInRange(value.rescued, 0, Number.MAX_SAFE_INTEGER) ||
    !isIntegerInRange(value.required, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (
    isOneOf(value.kind, ["escort", "rescue", "extraction"] as const) &&
    (value.required > targetIds.length || value.rescued > value.required)
  ) {
    return false;
  }
  const validateRuntimeIds = (ids: unknown, subset: number[]): ids is number[] =>
    Array.isArray(ids) &&
    ids.every((id) => isIntegerInRange(id, 0, Number.MAX_SAFE_INTEGER)) &&
    new Set(ids).size === ids.length &&
    ids.every((id) => subset.includes(id));
  const contactedIds = value.contactedIds;
  const rescuedIds = value.rescuedIds;
  if (value.contactedIds !== undefined) {
    if (value.kind !== "rescue" || !validateRuntimeIds(contactedIds, targetIds)) return false;
  }
  if (value.rescuedIds !== undefined) {
    if (value.kind !== "rescue" || !validateRuntimeIds(rescuedIds, targetIds)) return false;
    if (
      contactedIds === undefined ||
      !validateRuntimeIds(contactedIds, targetIds) ||
      rescuedIds.some((id) => !contactedIds.includes(id))
    ) {
      return false;
    }
    if (value.rescued !== rescuedIds.length) return false;
  }
  if (
    !Array.isArray(value.secondary) ||
    value.secondary.length > 32 ||
    !value.secondary.every(isSecondaryObjective)
  ) {
    return false;
  }
  if (
    value.convoyStartTick !== undefined &&
    !isIntegerInRange(value.convoyStartTick, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (value.zone !== undefined && !isVec2(value.zone)) return false;
  if (
    value.deadline !== undefined &&
    !isIntegerInRange(value.deadline, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (
    value.extractedIds !== undefined &&
    (!Array.isArray(value.extractedIds) ||
      value.extractedIds.length > 8_192 ||
      !value.extractedIds.every((id) => isIntegerInRange(id, 0, Number.MAX_SAFE_INTEGER)) ||
      new Set(value.extractedIds).size !== value.extractedIds.length ||
      value.extractedIds.some((id) => !targetIds.includes(id)))
  ) {
    return false;
  }
  if (value.hqThreatActive !== undefined && typeof value.hqThreatActive !== "boolean") return false;
  if (value.cachePaid !== undefined && typeof value.cachePaid !== "boolean") return false;
  if (
    value.finalePullTicks !== undefined &&
    !isIntegerInRange(value.finalePullTicks, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (value.director !== undefined) {
    if (
      !isRecord(value.director) ||
      !isOneOf(value.director.phase, ["opening", "pressure", "finale"] as const)
    ) {
      return false;
    }
    if (
      !isIntegerInRange(value.director.pressureStart, 0, Number.MAX_SAFE_INTEGER) ||
      !isIntegerInRange(value.director.finaleStart, 0, Number.MAX_SAFE_INTEGER) ||
      !isIntegerInRange(value.director.eventCount, 0, Number.MAX_SAFE_INTEGER)
    ) {
      return false;
    }
    if (
      value.director.finaleWarned !== undefined &&
      typeof value.director.finaleWarned !== "boolean"
    ) {
      return false;
    }
    if (
      value.director.finalePulled !== undefined &&
      typeof value.director.finalePulled !== "boolean"
    ) {
      return false;
    }
  }
  return true;
}
