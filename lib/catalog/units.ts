import { isUnitEntity } from "../types";
import type { ArmorType, Entity, SupportRole, UnitDomain, UnitKind, WeaponType } from "../types";

export const UNIT_KINDS: UnitKind[] = [
  "harvester",
  "infantry",
  "antiArmor",
  "tank",
  "medic",
  "repairTruck",
  "convoyTruck",
];

export type UnitStats = {
  hp: number;
  speed: number;
  damage: number;
  range: number;
  cooldown: number;
  cost: number;
  buildTicks: number;
  sight: number;
  carryMax: number;
  armor: ArmorType;
  weapon: WeaponType;
  splashRadius: number;
  suppression: number;
  domain: UnitDomain;
  supportRole?: SupportRole;
  supportRange?: number;
  supportAmount?: number;
  supportInterval?: number;
  scenarioOnly?: boolean;
};

export type UnitAiRole = "economy" | "combat" | "support" | "objective";

export type UnitDefinition = UnitStats & {
  label: string;
  renderKey: string;
  aiRole: UnitAiRole;
  producer?: "barracks" | "factory";
};

/**
 * Authoritative unit catalog. UNIT_STATS and UNIT_LABELS below are retained as
 * compatibility views for the simulation, renderer, and existing consumers.
 */
export const UNIT_DEFINITIONS: Record<UnitKind, UnitDefinition> = {
  harvester: {
    label: "Harvester",
    renderKey: "harvester",
    aiRole: "economy",
    hp: 160,
    speed: 0.07,
    damage: 0,
    range: 0,
    cooldown: 0,
    cost: 450,
    buildTicks: 108,
    sight: 5,
    carryMax: 500,
    armor: "light",
    weapon: "smallArms",
    splashRadius: 0,
    suppression: 0,
    domain: "vehicle",
  },
  infantry: {
    label: "Infantry",
    renderKey: "infantry",
    aiRole: "combat",
    producer: "barracks",
    hp: 70,
    speed: 0.09,
    damage: 5,
    range: 2.4,
    cooldown: 12,
    cost: 75,
    buildTicks: 48,
    sight: 6,
    carryMax: 0,
    armor: "light",
    weapon: "smallArms",
    splashRadius: 0,
    suppression: 8,
    domain: "human",
  },
  antiArmor: {
    label: "Anti-armor",
    renderKey: "antiArmor",
    aiRole: "combat",
    producer: "barracks",
    hp: 95,
    speed: 0.08,
    damage: 10,
    range: 3.2,
    cooldown: 16,
    cost: 160,
    buildTicks: 72,
    sight: 6,
    carryMax: 0,
    armor: "light",
    weapon: "antiArmor",
    splashRadius: 0,
    suppression: 14,
    domain: "human",
  },
  tank: {
    label: "Tank",
    renderKey: "tank",
    aiRole: "combat",
    producer: "factory",
    hp: 320,
    speed: 0.065,
    damage: 12,
    range: 3.6,
    cooldown: 16,
    cost: 425,
    buildTicks: 120,
    sight: 7,
    carryMax: 0,
    armor: "heavy",
    weapon: "cannon",
    splashRadius: 1,
    suppression: 12,
    domain: "vehicle",
  },
  medic: {
    label: "Field Medic",
    renderKey: "medic",
    aiRole: "support",
    producer: "barracks",
    hp: 80,
    speed: 0.085,
    damage: 0,
    range: 0,
    cooldown: 0,
    cost: 180,
    buildTicks: 72,
    sight: 6,
    carryMax: 0,
    armor: "light",
    weapon: "smallArms",
    splashRadius: 0,
    suppression: 0,
    domain: "human",
    supportRole: "medic",
    supportRange: 3.5,
    supportAmount: 12,
    supportInterval: 24,
  },
  repairTruck: {
    label: "Repair Truck",
    renderKey: "repairTruck",
    aiRole: "support",
    producer: "factory",
    hp: 220,
    speed: 0.07,
    damage: 0,
    range: 0,
    cooldown: 0,
    cost: 350,
    buildTicks: 108,
    sight: 6,
    carryMax: 0,
    armor: "light",
    weapon: "smallArms",
    splashRadius: 0,
    suppression: 0,
    domain: "vehicle",
    supportRole: "repairTruck",
    supportRange: 3.5,
    supportAmount: 20,
    supportInterval: 24,
  },
  convoyTruck: {
    label: "Convoy Truck",
    renderKey: "convoyTruck",
    aiRole: "objective",
    hp: 320,
    speed: 0.065,
    damage: 0,
    range: 0,
    cooldown: 0,
    cost: 0,
    buildTicks: 0,
    sight: 7,
    carryMax: 0,
    armor: "heavy",
    weapon: "smallArms",
    splashRadius: 0,
    suppression: 0,
    domain: "vehicle",
    scenarioOnly: true,
  },
};

/** Compatibility view containing only simulation statistics. */
export const UNIT_STATS: Record<UnitKind, UnitStats> = UNIT_DEFINITIONS;

/** Compatibility view for UI and generated copy. */
export const UNIT_LABELS: Record<UnitKind, string> = Object.fromEntries(
  UNIT_KINDS.map((kind) => [kind, UNIT_DEFINITIONS[kind].label]),
) as Record<UnitKind, string>;

export function isUnitKind(kind: UnitKind | import("../types").BuildingKind): kind is UnitKind {
  return (UNIT_KINDS as readonly string[]).includes(kind);
}

export function isSupportUnit(kind: UnitKind): boolean {
  return UNIT_DEFINITIONS[kind].supportRole !== undefined;
}

/** Entity-level companion to isSupportUnit; false for buildings. */
export function isSupportEntity(e: Entity): boolean {
  return isUnitEntity(e) && UNIT_STATS[e.kind].supportRole !== undefined;
}

export function isUnitAvailable(kind: UnitKind, missionIndex: number): boolean {
  // Callers pass missionIndex for a possible later unlock gate. Availability is
  // currently scenario-only; AI still delays support until mission 2 itself.
  void missionIndex;
  return !UNIT_DEFINITIONS[kind].scenarioOnly;
}

export function supportTargetDomain(kind: UnitKind): UnitDomain | undefined {
  const role = UNIT_DEFINITIONS[kind].supportRole;
  if (role === "medic") return "human";
  if (role === "repairTruck") return "vehicle";
  return undefined;
}

export function canSupportTarget(provider: UnitKind, target: UnitKind): boolean {
  const domain = supportTargetDomain(provider);
  return domain !== undefined && domain === UNIT_DEFINITIONS[target].domain && !isSupportUnit(target);
}
