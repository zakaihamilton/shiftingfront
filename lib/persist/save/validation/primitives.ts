import { BUILDING_KINDS, UNIT_KINDS } from "../../../catalog";
import type { BuildingKind, ControlGroups, UnitKind } from "../../../types";
import { isRecord } from "../../utils";

export const SAVE_CONTENT_VERSION = 2;
export const MAX_MULTIPLAYER_PATH_POINTS = 262_144;

export const MISSION_KINDS = [
  "harvestQuota",
  "forceQuota",
  "structureQuota",
  "destroyMarked",
  "razeAll",
  "decapitate",
  "annihilate",
  "holdTheLine",
  "escort",
  "sabotage",
  "rescue",
  "extraction",
] as const;

export const BIOMES = [
  "ash plains",
  "crystal flats",
  "rust canyons",
  "salt marshes",
  "glass desert",
  "tundra grid",
  "jungle wreckage",
  "volcanic shelf",
] as const;

export const LOSS_REASONS = ["yardDestroyed", "deadline", "objectiveTargetLost"] as const;
export const SCENARIO_ROLES = ["convoy", "stranded", "cargo"] as const;
export const ORDER_MODES = ["move", "attackMove", "attack"] as const;
export const STANCES = ["aggressive", "defensive", "hold"] as const;
export const FORMATIONS = ["line", "column", "wedge"] as const;
export const ARMOR_TYPES = ["light", "heavy", "structure"] as const;
export const WEAPON_TYPES = ["smallArms", "antiArmor", "cannon", "airStrike", "antiAir"] as const;
export const SURFACE_KINDS = [0, 1, 2] as const;
export const TILE_KINDS = [0, 1, 2, 3] as const;
const RNG_STATE_MIN = -0x80000000;
const RNG_STATE_MAX = 0xffffffff;

export function isNonNegativeNumberArray(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every(isNonNegativeNumber);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

export function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function isRngState(value: unknown): value is number {
  // The initial seed is an unsigned hash, while mulberryStep stores the
  // advanced state as a signed 32-bit integer. Both represent valid RNG
  // states and must survive JSON save/load.
  return isIntegerInRange(value, RNG_STATE_MIN, RNG_STATE_MAX);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function boundedEntries(value: unknown, maxEntries: number): [string, unknown][] | null {
  if (!isRecord(value) || Array.isArray(value)) return null;
  const entries: [string, unknown][] = [];
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (entries.length >= maxEntries) return null;
    entries.push([key, value[key]]);
  }
  return entries;
}

export function isUnitKind(value: unknown): value is UnitKind {
  return typeof value === "string" && UNIT_KINDS.includes(value as UnitKind);
}

export function isBuildingKind(value: unknown): value is BuildingKind {
  return typeof value === "string" && BUILDING_KINDS.includes(value as BuildingKind);
}

function isSharedProducerKind(value: unknown): value is "barracks" | "factory" {
  return value === "barracks" || value === "factory";
}

function isProductionJob(value: unknown): boolean {
  return isRecord(value) && isUnitKind(value.kind) && isNonNegativeNumber(value.remaining);
}

export function isSharedProductionQueue(
  value: unknown,
  maxQueueLength = Number.MAX_SAFE_INTEGER,
): boolean {
  if (!isRecord(value) || !Array.isArray(value.queue) || !value.queue.every(isUnitKind)) {
    return false;
  }
  const resume = value.resume;
  if (resume !== undefined && (!Array.isArray(resume) || !resume.every(isProductionJob))) {
    return false;
  }
  const resumeCount = Array.isArray(resume) ? resume.length : 0;
  if (value.queue.length + resumeCount > maxQueueLength) return false;
  if (value.producing === undefined) return true;
  return isProductionJob(value.producing);
}

export function isOwnerProducerMap(
  value: unknown,
  validateProducer: (entry: unknown) => boolean,
): boolean {
  const owners = boundedEntries(value, 4);
  return (
    owners?.every(([owner, producers]) => {
      const producerEntries = boundedEntries(producers, 2);
      return (
        /^(0|1|2|3)$/.test(owner) &&
        producerEntries?.every(
          ([kind, entry]) => isSharedProducerKind(kind) && validateProducer(entry),
        )
      );
    }) ?? false
  );
}

export function isVec2(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

export function isControlGroups(value: unknown): value is ControlGroups {
  const entries = boundedEntries(value, 9);
  return (
    entries?.every(([slot, ids]) => {
      if (!/^[1-9]$/.test(slot) || !Array.isArray(ids)) return false;
      return (
        ids.length <= 8_192 &&
        ids.every((id) => isIntegerInRange(id, 0, Number.MAX_SAFE_INTEGER)) &&
        new Set(ids).size === ids.length
      );
    }) ?? false
  );
}

function isPalette(value: unknown): boolean {
  return (
    isRecord(value) &&
    ["primary", "secondary", "accent", "outline", "light", "dark"].every((key) =>
      isString(value[key]),
    )
  );
}

export function isFaction(value: unknown, owner: number): boolean {
  return (
    isRecord(value) &&
    value.id === owner &&
    isString(value.name) &&
    isString(value.adjective) &&
    isPalette(value.palette)
  );
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function assertSupportedContentVersion(
  contentVersion: unknown,
  currentVersion: number = SAVE_CONTENT_VERSION,
): asserts contentVersion is number {
  if (
    typeof contentVersion !== "number" ||
    !Number.isInteger(contentVersion) ||
    contentVersion < 1 ||
    contentVersion > currentVersion
  ) {
    throw new Error("Unsupported save content version");
  }
}
