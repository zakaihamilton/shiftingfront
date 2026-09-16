import { formatSeed } from "../../seed/rng";
import { SURFACE_NONE } from "../../types";
import type { SimState, SurfaceKind, UnitKind } from "../../types";
import { generateWorld } from "../../gen/world";
import { expandFog, fogGridHeight, fogGridWidth } from "../../sim/fog";
import { compactDestroyedEntities, compactedState } from "../../sim/world/lifecycle";
import { isSupportUnit, UNIT_KINDS, UNIT_STATS } from "../../catalog";
import {
  SAVE_CONTENT_VERSION,
  isStateShape,
  isNumber,
  assertSupportedContentVersion,
} from "./validation";
import { isRecord } from "../utils";
import { migrateSaveContent } from "./migrations";
import { decodeRle, encodeRle, isRleEncoded, isRleString } from "./rle";
export { SAVE_CONTENT_VERSION } from "./validation";
export { encodeRle, decodeRle } from "./rle";

export const SAVE_PREFIX = "shiftingfront:save:";
export const SAVE_VERSION = 2;
const LEGACY_SAVE_VERSION = 1;
const LEGACY_SAVE_CONTENT_VERSION = 1;

export type SaveEnvelope = {
  version: typeof SAVE_VERSION;
  contentVersion: typeof SAVE_CONTENT_VERSION;
  savedAt: number;
  state: unknown;
};

export function decodeSavedState(value: unknown): SimState {
  const state = normalizeState(value);
  if (!isStateShape(state)) throw new Error("Invalid save state");
  return state;
}

export function decodeSave(raw: string): { state: SimState; savedAt: number } {
  const parsed: unknown = JSON.parse(raw);
  let value = parsed;
  let savedAt = 0;
  if (isRecord(parsed) && "state" in parsed) {
    if ((parsed.version !== SAVE_VERSION && parsed.version !== LEGACY_SAVE_VERSION) || !isNumber(parsed.savedAt)) {
      throw new Error("Unsupported save version");
    }
    const contentVersion = parsed.contentVersion ?? LEGACY_SAVE_CONTENT_VERSION;
    assertSupportedContentVersion(contentVersion);
    value = migrateSaveContent(parsed.state, contentVersion);
    savedAt = parsed.savedAt;
  } else if (isRecord(parsed) && isNumber(parsed.savedAt)) {
    // Legacy saves stored SimState and savedAt at the same level.
    assertSupportedContentVersion(LEGACY_SAVE_CONTENT_VERSION);
    value = migrateSaveContent(parsed, LEGACY_SAVE_CONTENT_VERSION);
    savedAt = parsed.savedAt;
  }
  return { state: decodeSavedState(value), savedAt };
}

export function saveKey(seed: number): string {
  return `${SAVE_PREFIX}${formatSeed(seed)}`;
}

export type SaveMeta = {
  seed: string;
  campaignName: string;
  missionIndex: number;
  tick: number;
  result: SimState["result"];
  missionName: string;
  savedAt: number;
};

export function encodeSavedState(state: SimState): unknown {
  const compacted = compactedState(state);
  return {
    ...compacted,
    tiles: Array.isArray(compacted.tiles) ? encodeRle(compacted.tiles) : compacted.tiles,
    heights: Array.isArray(compacted.heights) ? encodeRle(compacted.heights) : compacted.heights,
    surfaces: Array.isArray(compacted.surfaces) ? encodeRle(compacted.surfaces) : compacted.surfaces,
    resourceAmount: Array.isArray(compacted.resourceAmount) ? encodeRle(compacted.resourceAmount) : compacted.resourceAmount,
    fog: Array.isArray(compacted.fog) ? encodeRle(compacted.fog) : compacted.fog,
  };
}

export function serializeState(state: SimState): string {
  return JSON.stringify(encodeSavedState(state));
}

export function deserializeState(raw: string): SimState {
  return decodeSave(raw).state;
}

function normalizeState(value: unknown): SimState {
  if (!isRecord(value)) throw new Error("Invalid save state");
  if (
    typeof value.width !== "number" || !Number.isInteger(value.width) || value.width <= 0 || value.width > 256 ||
    typeof value.height !== "number" || !Number.isInteger(value.height) || value.height <= 0 || value.height > 256
  ) {
    throw new Error("Invalid save state");
  }
  const s = value as unknown as SimState;
  if (!Number.isInteger(s.navigationRevision) || s.navigationRevision < 0) s.navigationRevision = 0;
  const tileCount = s.width * s.height;
  const canDecode = (raw: unknown, allowEmpty = false): boolean =>
    (Array.isArray(raw) && raw.length > 0) ||
    (isRleEncoded(raw) && (allowEmpty || raw.runs.length > 0)) ||
    (isRleString(raw) && (allowEmpty || raw.length > 0));
  if (canDecode(s.tiles)) s.tiles = decodeRle(s.tiles, tileCount);
  if (canDecode(s.heights)) s.heights = decodeRle(s.heights, tileCount);
  if (!canDecode(s.heights)) {
    s.heights = new Array(tileCount).fill(1);
  }
  if (canDecode(s.surfaces)) s.surfaces = decodeRle(s.surfaces, tileCount) as SurfaceKind[];
  if (!canDecode(s.surfaces)) {
    s.surfaces = new Array(tileCount).fill(SURFACE_NONE);
  }
  if (canDecode(s.resourceAmount)) s.resourceAmount = decodeRle(s.resourceAmount, tileCount);
  if (!s.biome) s.biome = generateWorld(s.seed).biome;
  const fogW = fogGridWidth(s.width);
  const fogH = fogGridHeight(s.height);
  s.fog = canDecode(s.fog, true) ? decodeRle(s.fog, fogW * fogH, tileCount) : [];
  s.fog = expandFog(s.fog, s.width, s.height);
  if (!s.losses || !Array.isArray(s.losses.units) || !Array.isArray(s.losses.buildings)) {
    s.losses = { units: [0, 0], buildings: [0, 0] };
  }
  if (!s.unitsProducedByRole || typeof s.unitsProducedByRole !== "object") {
    s.unitsProducedByRole = Object.fromEntries(UNIT_KINDS.map((kind) => [kind, 0])) as SimState["unitsProducedByRole"];
  } else {
    for (const kind of UNIT_KINDS) {
      if (typeof s.unitsProducedByRole[kind] !== "number") s.unitsProducedByRole[kind] = 0;
    }
  }
  if (!s.buildingsCompletedByKind || typeof s.buildingsCompletedByKind !== "object") {
    s.buildingsCompletedByKind = {};
  }
  if (s.controlGroups === undefined) s.controlGroups = {};
  if (!Array.isArray(s.entities)) s.entities = [];
  const scenarioRole =
    s.runtime?.kind === "escort" ? "convoy" :
    s.runtime?.kind === "rescue" ? "stranded" :
    s.runtime?.kind === "extraction" ? "cargo" :
    undefined;
  const scenarioTargetIds = new Set(s.runtime?.targetIds ?? []);
  for (const e of s.entities) {
    const isLegacyEscortTarget = e.class === "unit" && e.kind === "tank" &&
      (e.scenarioRole === "convoy" || (s.runtime?.kind === "escort" && scenarioTargetIds.has(e.id)));
    if (isLegacyEscortTarget) {
      // Escort targets used to be serialized as tanks. Keep their current HP
      // and armor, but give them the non-combat convoy identity and behavior.
      e.kind = "convoyTruck";
      e.cooldown = 0;
      e.weapon = UNIT_STATS.convoyTruck.weapon;
      e.armor = UNIT_STATS.convoyTruck.armor;
      delete e.attackTarget;
    }
    if (!e.queue) e.queue = [];
    if (e.facing === undefined) e.facing = e.owner === 0 ? 0 : 4;
    if (e.repairing === undefined) e.repairing = false;
    if (e.stance === undefined) e.stance = "aggressive";
    if (e.suppression === undefined) e.suppression = 0;
    if (e.class === "unit" && isSupportUnit(e.kind as UnitKind)) {
      if (e.supportMode !== "auto" && e.supportMode !== "assigned" && e.supportMode !== "hold") e.supportMode = "auto";
    } else {
      delete e.supportTargetId;
      delete e.supportMode;
    }
    if (e.scenarioRole === undefined && e.class === "unit" && scenarioRole && scenarioTargetIds.has(e.id)) {
      e.scenarioRole = scenarioRole;
    }
    if (e.routePending === undefined) delete e.routePending;
  }
  if (!s.aiState) s.aiState = "economy";
  if (typeof s.aiRetreatTick !== "number" || !Number.isInteger(s.aiRetreatTick)) {
    delete s.aiRetreatTick;
  }
  if (s.aiRetreatLocked !== true) delete s.aiRetreatLocked;
  if (!s.aiContacts || typeof s.aiContacts !== "object" || Array.isArray(s.aiContacts)) s.aiContacts = {};
  delete (s as { appliedUpgrades?: unknown }).appliedUpgrades;
  compactDestroyedEntities(s);
  return s;
}
