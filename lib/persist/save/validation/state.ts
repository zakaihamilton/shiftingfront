import { BUILDING_KINDS, MAX_PRODUCTION_QUEUE, UNIT_KINDS } from "../../../catalog";
import { MISSION_MAX, MISSION_MIN, SEED_MAX, SEED_MIN } from "../../../seed/rng";
import { fogGridHeight, fogGridWidth } from "../../../sim/fog";
import type { Entity, SimState } from "../../../types";
import { isRecord } from "../../utils";
import { isAiContact, isEntity } from "./entity";
import { isRuntime, isWin } from "./mission";
import {
  BIOMES,
  boundedEntries,
  isControlGroups,
  isFaction,
  isFiniteNumber,
  isIntegerInRange,
  isNonNegativeNumber,
  isNonNegativeNumberArray,
  isOneOf,
  isOwnerProducerMap,
  isRngState,
  isSharedProductionQueue,
  isString,
  LOSS_REASONS,
  MAX_MULTIPLAYER_PATH_POINTS,
  MISSION_KINDS,
  SURFACE_KINDS,
  TILE_KINDS,
} from "./primitives";

export function isNormalizableStateInput(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (
    !isIntegerInRange(value.seed, SEED_MIN, SEED_MAX) ||
    !isIntegerInRange(value.width, 1, 256) ||
    !isIntegerInRange(value.height, 1, 256)
  ) {
    return false;
  }
  if ((value.width as number) * (value.height as number) > 256 * 256) return false;
  if (!Array.isArray(value.entities) || !value.entities.every(isRecord)) return false;
  if (
    value.runtime !== undefined &&
    (!isRecord(value.runtime) ||
      (value.runtime.targetIds !== undefined && !Array.isArray(value.runtime.targetIds)))
  ) {
    return false;
  }
  return true;
}

export function isStateShape(
  value: unknown,
  options: { multiplayer?: boolean; maxEntities?: number } = {},
): value is SimState {
  if (!isRecord(value)) return false;
  if (
    value.gameplayRulesVersion !== undefined &&
    value.gameplayRulesVersion !== 1 &&
    value.gameplayRulesVersion !== 2
  ) {
    return false;
  }
  const multiplayer = options.multiplayer === true;
  const ownerCount = multiplayer ? 4 : 2;
  const width = value.width;
  const height = value.height;
  const maxDimension = multiplayer ? 128 : 256;
  if (
    !isIntegerInRange(width, 1, maxDimension) ||
    !isIntegerInRange(height, 1, maxDimension) ||
    width * height > maxDimension * maxDimension
  ) {
    return false;
  }
  const entityValidation = multiplayer
    ? {
        allowedOwners: [0, 1, 2, 3] as const,
        maxQueueLength: MAX_PRODUCTION_QUEUE,
        maxPathLength: Math.min(width * height, 8_192),
      }
    : undefined;
  if (
    !isIntegerInRange(value.seed, SEED_MIN, SEED_MAX) ||
    !isIntegerInRange(value.missionIndex, MISSION_MIN, MISSION_MAX) ||
    !isIntegerInRange(value.tick, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (!isIntegerInRange(value.navigationRevision, 0, Number.MAX_SAFE_INTEGER)) return false;
  if (
    !Array.isArray(value.tiles) ||
    value.tiles.length !== width * height ||
    !value.tiles.every(
      (tile) =>
        typeof tile === "number" && TILE_KINDS.includes(tile as (typeof TILE_KINDS)[number]),
    )
  ) {
    return false;
  }
  if (
    !Array.isArray(value.heights) ||
    value.heights.length !== width * height ||
    !value.heights.every(isFiniteNumber)
  ) {
    return false;
  }
  if (
    !Array.isArray(value.surfaces) ||
    value.surfaces.length !== width * height ||
    !value.surfaces.every(
      (surface) =>
        typeof surface === "number" &&
        SURFACE_KINDS.includes(surface as (typeof SURFACE_KINDS)[number]),
    )
  ) {
    return false;
  }
  if (
    !Array.isArray(value.resourceAmount) ||
    value.resourceAmount.length !== width * height ||
    !value.resourceAmount.every(isNonNegativeNumber)
  ) {
    return false;
  }
  const fogWidth = fogGridWidth(width);
  const fogHeight = fogGridHeight(height);
  if (
    !Array.isArray(value.fog) ||
    value.fog.length !== fogWidth * fogHeight ||
    !value.fog.every((cell) => isIntegerInRange(cell, 0, 2))
  ) {
    return false;
  }
  if (
    !Array.isArray(value.entities) ||
    (options.maxEntities !== undefined && value.entities.length > options.maxEntities) ||
    (multiplayer && value.entities.length > 8_192)
  ) {
    return false;
  }
  if (multiplayer) {
    let totalPathPoints = 0;
    for (const entity of value.entities) {
      if (!isRecord(entity) || !Array.isArray(entity.path)) return false;
      totalPathPoints += entity.path.length;
      if (totalPathPoints > MAX_MULTIPLAYER_PATH_POINTS) return false;
    }
  }
  if (!value.entities.every((entity) => isEntity(entity, entityValidation))) return false;
  if (
    value.productionQueues !== undefined &&
    !isOwnerProducerMap(value.productionQueues, (queue) =>
      isSharedProductionQueue(queue, multiplayer ? MAX_PRODUCTION_QUEUE : undefined),
    )
  ) {
    return false;
  }
  if (
    value.activeProducerIds !== undefined &&
    !isOwnerProducerMap(value.activeProducerIds, (id) =>
      isIntegerInRange(id, 0, Number.MAX_SAFE_INTEGER),
    )
  ) {
    return false;
  }
  const entities = value.entities as Entity[];
  if (new Set(entities.map((entity) => entity.id)).size !== entities.length) return false;
  if (
    entities.some(
      (entity) =>
        entity.x < 0 ||
        entity.x >= width ||
        entity.y < 0 ||
        entity.y >= height ||
        entity.path.some(
          (point) => point.x < 0 || point.x >= width || point.y < 0 || point.y >= height,
        ),
    )
  ) {
    return false;
  }
  const nextId = value.nextId;
  if (
    !isIntegerInRange(nextId, 1, Number.MAX_SAFE_INTEGER) ||
    entities.some((entity) => entity.id >= nextId)
  ) {
    return false;
  }
  if (
    !isNonNegativeNumberArray(value.credits, ownerCount) ||
    !isNonNegativeNumberArray(value.creditsEarned, ownerCount) ||
    !isNonNegativeNumberArray(value.unitsProduced, ownerCount) ||
    !isNonNegativeNumberArray(value.buildingsCompleted, ownerCount)
  ) {
    return false;
  }
  if (value.powerReserve !== undefined && !isIntegerInRange(value.powerReserve, 0, 500)) {
    return false;
  }
  const unitsProducedByRole = value.unitsProducedByRole;
  if (
    !isRecord(unitsProducedByRole) ||
    !UNIT_KINDS.every((kind) => isNonNegativeNumber(unitsProducedByRole[kind]))
  ) {
    return false;
  }
  const completedByKind = boundedEntries(value.buildingsCompletedByKind, BUILDING_KINDS.length);
  if (!completedByKind?.every(([, count]) => isNonNegativeNumber(count))) return false;
  if (
    !isRecord(value.losses) ||
    !isNonNegativeNumberArray(value.losses.units, ownerCount) ||
    !isNonNegativeNumberArray(value.losses.buildings, ownerCount)
  ) {
    return false;
  }
  if (!isWin(value.win) || !["playing", "won", "lost"].includes(value.result as string)) {
    return false;
  }
  if (value.lossReason !== undefined && !isOneOf(value.lossReason, LOSS_REASONS)) return false;
  if (!isRngState(value.rngState) || !isOneOf(value.biome, BIOMES)) return false;
  if (
    !Array.isArray(value.factions) ||
    value.factions.length !== ownerCount ||
    !value.factions.every((faction, owner) => isFaction(faction, owner))
  ) {
    return false;
  }
  if (!isString(value.missionName)) return false;
  if (!isControlGroups(value.controlGroups)) return false;
  if (value.missionKind !== undefined && !isOneOf(value.missionKind, MISSION_KINDS)) return false;
  if (value.runtime !== undefined && !isRuntime(value.runtime)) return false;
  if (
    value.tutorialStage !== undefined &&
    !isOneOf(value.tutorialStage, [
      "select",
      "move",
      "build",
      "produce",
      "attack",
      "repair",
      "complete",
    ] as const)
  ) {
    return false;
  }
  if (
    value.tutorialTargetId !== undefined &&
    !isIntegerInRange(value.tutorialTargetId, 1, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (
    value.tutorialBuildId !== undefined &&
    !isIntegerInRange(value.tutorialBuildId, 1, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (
    value.aiState !== undefined &&
    !isOneOf(value.aiState, ["economy", "defense", "assault", "retreat", "regroup"] as const)
  ) {
    return false;
  }
  if (
    value.aiRetreatTick !== undefined &&
    !isIntegerInRange(value.aiRetreatTick, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  if (value.aiRetreatLocked !== undefined && typeof value.aiRetreatLocked !== "boolean") {
    return false;
  }
  if (
    value.proficiencyBand !== undefined &&
    value.proficiencyBand !== -1 &&
    value.proficiencyBand !== 0 &&
    value.proficiencyBand !== 1
  ) {
    return false;
  }
  const aiContacts =
    value.aiContacts === undefined ? null : boundedEntries(value.aiContacts, 8_192);
  if (
    value.aiContacts !== undefined &&
    !aiContacts?.every(
      ([key, contact]) =>
        isIntegerInRange(Number(key), 0, Number.MAX_SAFE_INTEGER) && isAiContact(contact),
    )
  ) {
    return false;
  }
  if (
    value.pathBudget !== undefined &&
    (!isRecord(value.pathBudget) ||
      !isIntegerInRange(value.pathBudget.remaining, 0, Number.MAX_SAFE_INTEGER) ||
      !isIntegerInRange(value.pathBudget.used, 0, Number.MAX_SAFE_INTEGER))
  ) {
    return false;
  }
  return true;
}
