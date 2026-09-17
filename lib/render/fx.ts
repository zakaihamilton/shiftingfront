import { BUILDING_KINDS, UNIT_KINDS, UNIT_STATS } from "../catalog";
import type {
  BuildingKind,
  EntityClass,
  Owner,
  SimEvent,
  SimState,
  UnitKind,
  WeaponType,
} from "../types";

export type FxKind =
  | "muzzle"
  | "impact"
  | "explosion"
  | "destruction"
  | "wreck"
  | "rubble"
  | "scorch"
  | "build"
  | "deploy"
  | "repair"
  | "heal";

export type FxTargetDomain = "human" | "vehicle" | "building";

/** Visual-only event state. It is intentionally not persisted with a mission save. */
export type FxBurst = {
  id: number;
  kind: FxKind;
  x: number;
  y: number;
  elev: number;
  bornMs: number;
  durationMs: number;
  entityKind: string;
  entityClass: EntityClass;
  owner: Owner;
  variant?: number;
  magnitude?: number;
  weapon?: WeaponType;
  targetDomain?: FxTargetDomain;
  sourceX?: number;
  sourceY?: number;
  targetX?: number;
  targetY?: number;
};

export const FX_DURATION: Record<FxKind, number> = {
  muzzle: 140,
  impact: 320,
  explosion: 680,
  destruction: 900,
  wreck: 6500,
  rubble: 9000,
  scorch: 25000,
  build: 900,
  deploy: 720,
  repair: 520,
  heal: 520,
};

export const MAX_TRANSIENT_FX = 64;
export const MAX_PERSISTENT_FX = 36;

const PERSISTENT_FX = new Set<FxKind>(["wreck", "rubble", "scorch"]);

export function fxAge(burst: FxBurst, nowMs: number): number {
  return nowMs - burst.bornMs;
}

export function fxProgress(burst: FxBurst, nowMs: number): number {
  const duration = Math.max(1, burst.durationMs);
  return Math.max(0, Math.min(1, fxAge(burst, nowMs) / duration));
}

export function fxAlive(burst: FxBurst, nowMs: number): boolean {
  return fxAge(burst, nowMs) < burst.durationMs;
}

export function isPersistentFx(kind: FxKind): boolean {
  return PERSISTENT_FX.has(kind);
}

/** Preserve aftermath while preventing rapid weapons from crowding out the whole FX list. */
export function cullFx(bursts: FxBurst[], nowMs: number): FxBurst[] {
  const persistent: FxBurst[] = [];
  const transient: FxBurst[] = [];
  for (const burst of bursts) {
    if (!fxAlive(burst, nowMs)) continue;
    (isPersistentFx(burst.kind) ? persistent : transient).push(burst);
  }
  return [
    ...persistent.slice(-MAX_PERSISTENT_FX),
    ...transient.slice(-MAX_TRANSIENT_FX),
  ].sort((a, b) => a.id - b.id);
}

export function entityClassOf(kind: string): EntityClass {
  if ((UNIT_KINDS as string[]).includes(kind)) return "unit";
  return "building";
}

export function isUnitKind(kind: string): kind is UnitKind {
  return (UNIT_KINDS as string[]).includes(kind);
}

export function isBuildingKind(kind: string): kind is BuildingKind {
  return (BUILDING_KINDS as string[]).includes(kind);
}

export function fxTargetDomain(kind: string): FxTargetDomain {
  if (!isUnitKind(kind)) return "building";
  return UNIT_STATS[kind].domain === "human" ? "human" : "vehicle";
}

export function weaponFxMagnitude(weapon: WeaponType): number {
  if (weapon === "cannon") return 1;
  if (weapon === "antiArmor") return 0.78;
  return 0.48;
}

function elevationAt(state: SimState, x: number, y: number): number {
  const tx = Math.max(0, Math.min(state.width - 1, Math.round(x)));
  const ty = Math.max(0, Math.min(state.height - 1, Math.round(y)));
  return state.heights[ty * state.width + tx] ?? 1;
}

function variantFor(id: number, x: number, y: number, kind: FxKind): number {
  let hash = Math.imul(id ^ Math.round(x * 97) ^ Math.round(y * 193), 0x45d9f3b);
  for (let i = 0; i < kind.length; i++) hash = Math.imul(hash ^ kind.charCodeAt(i), 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

type BurstInput = Omit<FxBurst, "id" | "variant" | "durationMs"> & {
  durationMs?: number;
};

function makeBurst(nextId: number, input: BurstInput): FxBurst {
  return {
    ...input,
    id: nextId,
    durationMs: input.durationMs ?? FX_DURATION[input.kind],
    variant: variantFor(nextId, input.x, input.y, input.kind),
  };
}

/** Convert simulation events into presentation-only bursts without changing simulation state. */
export function burstsFromEvents(
  events: SimEvent[],
  state: SimState,
  nowMs: number,
  nextId: number,
): { bursts: FxBurst[]; nextId: number } {
  const bursts: FxBurst[] = [];
  let id = nextId;
  const push = (input: BurstInput) => bursts.push(makeBurst(id++, input));

  for (const event of events) {
    if (event.type === "combat") {
      const magnitude = weaponFxMagnitude(event.weapon);
      push({
        kind: "muzzle",
        x: event.x,
        y: event.y,
        elev: elevationAt(state, event.x, event.y),
        bornMs: nowMs,
        entityKind: event.attackerKind,
        entityClass: entityClassOf(event.attackerKind),
        owner: event.owner,
        magnitude,
        weapon: event.weapon,
        targetDomain: fxTargetDomain(event.targetKind),
        targetX: event.targetX,
        targetY: event.targetY,
      });
      push({
        kind: "impact",
        x: event.targetX,
        y: event.targetY,
        elev: elevationAt(state, event.targetX, event.targetY),
        bornMs: nowMs,
        entityKind: event.targetKind,
        entityClass: entityClassOf(event.targetKind),
        owner: event.targetOwner,
        magnitude,
        weapon: event.weapon,
        targetDomain: fxTargetDomain(event.targetKind),
        sourceX: event.x,
        sourceY: event.y,
      });
      continue;
    }

    if (event.type === "support") {
      push({
        kind: event.providerKind === "medic" ? "heal" : "repair",
        x: event.targetX,
        y: event.targetY,
        elev: elevationAt(state, event.targetX, event.targetY),
        bornMs: nowMs,
        entityKind: event.targetKind,
        entityClass: "unit",
        owner: event.owner,
        magnitude: Math.max(0.45, Math.min(1, event.amount / 20)),
        targetDomain: fxTargetDomain(event.targetKind),
        sourceX: event.x,
        sourceY: event.y,
      });
      continue;
    }

    if (event.type === "built" && event.x !== undefined && event.y !== undefined) {
      push({
        kind: "build",
        x: event.x,
        y: event.y,
        elev: elevationAt(state, event.x, event.y),
        bornMs: nowMs,
        entityKind: event.kind,
        entityClass: "building",
        owner: event.owner,
        magnitude: 1,
      });
      continue;
    }

    if (event.type === "produced" && event.x !== undefined && event.y !== undefined) {
      push({
        kind: "deploy",
        x: event.x,
        y: event.y,
        elev: elevationAt(state, event.x, event.y),
        bornMs: nowMs,
        entityKind: event.kind,
        entityClass: "unit",
        owner: event.owner,
        magnitude: 0.75,
      });
      continue;
    }

    if (event.type !== "destroyed") continue;
    const entityClass = entityClassOf(event.kind);
    const targetDomain = fxTargetDomain(event.kind);
    const magnitude = entityClass === "building" ? 1.2 : targetDomain === "vehicle" ? 0.9 : 0.62;
    const base = {
      x: event.x,
      y: event.y,
      elev: elevationAt(state, event.x, event.y),
      bornMs: nowMs,
      entityKind: event.kind,
      entityClass,
      owner: event.owner,
      targetDomain,
      magnitude,
    } satisfies Omit<BurstInput, "kind">;
    push({ ...base, kind: "destruction" });
    push({ ...base, kind: "scorch", magnitude: magnitude * 1.15 });
    if (entityClass === "building") {
      push({ ...base, kind: "rubble" });
    } else if (targetDomain === "vehicle") {
      push({ ...base, kind: "wreck" });
    }
  }

  return { bursts, nextId: id };
}

/** Compatibility helper retained for focused destruction callers and tests. */
export function burstsFromDestroyed(
  events: SimEvent[],
  state: SimState,
  nowMs: number,
  nextId: number,
): { bursts: FxBurst[]; nextId: number } {
  return burstsFromEvents(
    events.filter((event) => event.type === "destroyed"),
    state,
    nowMs,
    nextId,
  );
}
