import { BUILDING_KINDS, BUILDING_STATS, UNIT_KINDS, UNIT_STATS, ammoEffectForWeapon } from "../catalog";
import type {
  BuildingKind,
  AmmoEffect,
  EntityClass,
  Owner,
  SimEvent,
  SimState,
  UnitKind,
  WeaponType,
} from "../types";
import { groundHeight, heightAt } from "../sim/world";

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
  ammoEffect?: AmmoEffect;
  /** Flight snapshot carried by muzzle bursts so shots survive target changes. */
  projectileDurationMs?: number;
  sourceElev?: number;
  targetElev?: number;
  /** Delayed presentation time for a destruction caused by an in-flight shot. */
  impactAtMs?: number;
  targetDomain?: FxTargetDomain;
  sourceX?: number;
  sourceY?: number;
  targetX?: number;
  targetY?: number;
  sourceEntityId?: number;
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

function ammoEffectForAttacker(kind: UnitKind | BuildingKind, weapon: WeaponType): AmmoEffect {
  const configured = isUnitKind(kind) ? UNIT_STATS[kind].ammoEffect : BUILDING_STATS[kind].ammoEffect;
  return configured ?? ammoEffectForWeapon(weapon);
}

function projectileFlightDurationMs(effect: AmmoEffect, distance: number): number {
  const ticks = effect === "bullet"
    ? 1.2 + Math.min(0.4, distance * 0.04)
    : effect === "missile"
      ? 4.4 + Math.min(1.5, distance * 0.16)
      : effect === "bomb"
        ? 3.3 + Math.min(1.1, distance * 0.12)
        : effect === "beam"
          ? 2.4
          : 2.4 + Math.min(0.8, distance * 0.08);
  return ticks * (1000 / 12);
}

function combatEntityElevation(state: SimState, kind: UnitKind | BuildingKind, x: number, y: number): number {
  if (isUnitKind(kind)) {
    const ground = groundHeight(state, x, y);
    return ground + (UNIT_STATS[kind].domain === "air" ? 5 : 0);
  }
  if (isBuildingKind(kind)) return heightAt(state, x, y);
  return elevationAt(state, x, y);
}

function destroyedEntityKey(event: Extract<SimEvent, { type: "destroyed" }>): string {
  return `${event.owner}:${event.kind}:${event.x}:${event.y}`;
}

function splashRadiusForAttacker(kind: UnitKind | BuildingKind): number {
  if (isUnitKind(kind)) return UNIT_STATS[kind].splashRadius;
  return BUILDING_STATS[kind].combat?.splashRadius ?? 0;
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
  const destructionImpactTimes = new Map<string, number>();

  for (const destroyed of events) {
    if (destroyed.type !== "destroyed") continue;
    let nearestHit: { distance: number; impactAtMs: number } | undefined;
    for (const hit of events) {
      if (hit.type !== "combat" || hit.owner === destroyed.owner) continue;
      const distance = Math.hypot(destroyed.x - hit.targetX, destroyed.y - hit.targetY);
      const directHit = hit.targetOwner === destroyed.owner && hit.targetKind === destroyed.kind && distance < 0.001;
      const splashRadius = splashRadiusForAttacker(hit.attackerKind);
      const splashHit = splashRadius > 0 && distance <= splashRadius;
      if (!directHit && !splashHit) continue;
      if (nearestHit && distance >= nearestHit.distance) continue;
      const effect = ammoEffectForAttacker(hit.attackerKind, hit.weapon);
      const flightMs = projectileFlightDurationMs(effect, Math.hypot(hit.x - hit.targetX, hit.y - hit.targetY));
      nearestHit = { distance, impactAtMs: nowMs + flightMs };
    }
    if (nearestHit) destructionImpactTimes.set(destroyedEntityKey(destroyed), nearestHit.impactAtMs);
  }

  for (const event of events) {
    if (event.type === "combat") {
      const magnitude = weaponFxMagnitude(event.weapon);
      const ammoEffect = ammoEffectForAttacker(event.attackerKind, event.weapon);
      const distance = Math.hypot(event.targetX - event.x, event.targetY - event.y);
      const flightMs = projectileFlightDurationMs(ammoEffect, distance);
      const sourceElev = combatEntityElevation(state, event.attackerKind, event.x, event.y);
      const targetElev = combatEntityElevation(state, event.targetKind, event.targetX, event.targetY);
      push({
        kind: "muzzle",
        sourceEntityId: state.entities.find(entity => entity.owner === event.owner && entity.kind === event.attackerKind &&
          Math.hypot(entity.x - event.x, entity.y - event.y) < 0.4)?.id,
        x: event.x,
        y: event.y,
        elev: sourceElev,
        bornMs: nowMs,
        durationMs: Math.max(FX_DURATION.muzzle, flightMs),
        entityKind: event.attackerKind,
        entityClass: entityClassOf(event.attackerKind),
        owner: event.owner,
        magnitude,
        weapon: event.weapon,
        ammoEffect,
        projectileDurationMs: flightMs,
        sourceX: event.x,
        sourceY: event.y,
        sourceElev,
        targetElev,
        targetDomain: fxTargetDomain(event.targetKind),
        targetX: event.targetX,
        targetY: event.targetY,
      });
      push({
        kind: "impact",
        x: event.targetX,
        y: event.targetY,
        elev: targetElev,
        bornMs: nowMs + flightMs,
        entityKind: event.targetKind,
        entityClass: entityClassOf(event.targetKind),
        owner: event.targetOwner,
        magnitude,
        weapon: event.weapon,
        ammoEffect,
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
    const impactAtMs = destructionImpactTimes.get(destroyedEntityKey(event));
    const base = {
      x: event.x,
      y: event.y,
      elev: elevationAt(state, event.x, event.y),
      bornMs: impactAtMs ?? nowMs,
      entityKind: event.kind,
      entityClass,
      owner: event.owner,
      targetDomain,
      magnitude,
    } satisfies Omit<BurstInput, "kind">;
    const destruction = impactAtMs === undefined
      ? base
      : {
          ...base,
          bornMs: nowMs,
          durationMs: impactAtMs - nowMs + FX_DURATION.destruction,
          impactAtMs,
        };
    push({ ...destruction, kind: "destruction" });
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
