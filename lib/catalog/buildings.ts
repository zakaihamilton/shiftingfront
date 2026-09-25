import type { ArmorType, BuildingKind, CombatTargetDomain, Entity, WeaponType } from "../types";
import { UNIT_DEFINITIONS } from "./units";

export const BUILDING_KINDS: BuildingKind[] = [
  "constructionYard",
  "power",
  "refinery",
  "barracks",
  "factory",
  "turret",
  "runway",
  "antiAirTurret",
  "objective",
];

export type Footprint = { w: number; h: number };

export type BuildingStats = {
  hp: number;
  cost: number;
  buildTicks: number;
  power: number;
  sight: number;
  footprint: Footprint;
  armor: ArmorType;
  weapon?: WeaponType;
  combat?: {
    damage: number;
    range: number;
    cooldown: number;
    splashRadius: number;
    suppression: number;
    targetDomains: readonly CombatTargetDomain[];
  };
};

export type BuildingAiRole = "base" | "economy" | "production" | "defense" | "objective";

export type BuildingDefinition = BuildingStats & {
  label: string;
  renderKey: string;
  aiRole: BuildingAiRole;
  unique?: boolean;
  production?: readonly import("../types").UnitKind[];
  requiresFlatGround: boolean;
};

/**
 * Authoritative building catalog. BUILDING_STATS and BUILDING_LABELS below are
 * retained as compatibility views for existing simulation and UI consumers.
 */
export const BUILDING_DEFINITIONS: Record<BuildingKind, BuildingDefinition> = {
  constructionYard: {
    label: "Command HQ",
    renderKey: "constructionYard",
    aiRole: "base",
    requiresFlatGround: true,
    hp: 2400,
    cost: 0,
    buildTicks: 0,
    power: 20,
    sight: 8,
    footprint: { w: 2, h: 2 },
    armor: "structure",
  },
  power: {
    label: "Power Plant",
    renderKey: "power",
    aiRole: "economy",
    requiresFlatGround: true,
    hp: 390,
    cost: 300,
    buildTicks: 90,
    power: 50,
    sight: 4,
    footprint: { w: 2, h: 2 },
    armor: "structure",
  },
  refinery: {
    label: "Refinery",
    renderKey: "refinery",
    aiRole: "economy",
    requiresFlatGround: true,
    hp: 825,
    cost: 750,
    buildTicks: 120,
    power: -10,
    sight: 5,
    footprint: { w: 3, h: 2 },
    armor: "structure",
  },
  barracks: {
    label: "Barracks",
    renderKey: "barracks",
    aiRole: "production",
    unique: true,
    production: ["infantry", "antiArmor", "medic"],
    requiresFlatGround: true,
    hp: 675,
    cost: 375,
    buildTicks: 108,
    power: -10,
    sight: 5,
    footprint: { w: 2, h: 2 },
    armor: "structure",
  },
  factory: {
    label: "Vehicle Plant",
    renderKey: "factory",
    aiRole: "production",
    unique: true,
    production: ["harvester", "tank", "repairTruck"],
    requiresFlatGround: true,
    hp: 975,
    cost: 800,
    buildTicks: 180,
    power: -15,
    sight: 5,
    footprint: { w: 3, h: 2 },
    armor: "structure",
  },
  turret: {
    label: "Gun Turret",
    renderKey: "turret",
    aiRole: "defense",
    requiresFlatGround: true,
    hp: 480,
    cost: 275,
    buildTicks: 84,
    power: -8,
    sight: 7,
    footprint: { w: 1, h: 1 },
    armor: "structure",
    weapon: "cannon",
    combat: {
      damage: 9,
      range: 5.5,
      cooldown: 14,
      splashRadius: 0.5,
      suppression: 10,
      targetDomains: ["ground"],
    },
  },
  runway: {
    label: "Airport Runway",
    renderKey: "runway",
    aiRole: "production",
    production: ["strikePlane"],
    requiresFlatGround: true,
    hp: 750,
    cost: 650,
    buildTicks: 150,
    power: -10,
    sight: 5,
    footprint: { w: 4, h: 2 },
    armor: "structure",
  },
  antiAirTurret: {
    label: "Anti-Air Turret",
    renderKey: "antiAirTurret",
    aiRole: "defense",
    requiresFlatGround: true,
    hp: 420,
    cost: 325,
    buildTicks: 96,
    power: -10,
    sight: 8,
    footprint: { w: 1, h: 1 },
    armor: "structure",
    weapon: "antiAir",
    combat: {
      damage: 14,
      range: 8,
      cooldown: 18,
      splashRadius: 0,
      suppression: 0,
      targetDomains: ["air"],
    },
  },
  objective: {
    label: "Marked Structure",
    renderKey: "objective",
    aiRole: "objective",
    requiresFlatGround: true,
    hp: 1350,
    cost: 0,
    buildTicks: 0,
    power: 0,
    sight: 3,
    footprint: { w: 2, h: 2 },
    armor: "structure",
  },
};

/** Compatibility view containing only simulation statistics. */
export const BUILDING_STATS: Record<BuildingKind, BuildingStats> = BUILDING_DEFINITIONS;

/** Compatibility view for UI and generated copy. */
export const BUILDING_LABELS: Record<BuildingKind, string> = Object.fromEntries(
  BUILDING_KINDS.map((kind) => [kind, BUILDING_DEFINITIONS[kind].label]),
) as Record<BuildingKind, string>;

/** Buildings that may only have one active instance per owner in a mission. */
export const SINGLE_BUILDING_KINDS: BuildingKind[] = BUILDING_KINDS.filter(
  (kind) => BUILDING_DEFINITIONS[kind].unique === true,
);

export function footprintOf(kind: BuildingKind): Footprint {
  return BUILDING_STATS[kind].footprint;
}

export function buildingLimitReached(
  entities: ReadonlyArray<Pick<Entity, "hp" | "owner" | "class" | "kind">>,
  owner: number,
  kind: BuildingKind,
): boolean {
  if (!SINGLE_BUILDING_KINDS.includes(kind)) return false;
  return entities.some((entity) => entity.hp > 0 && entity.owner === owner && entity.class === "building" && entity.kind === kind);
}

export const HARVEST_PER_TICK = 2;
export const REPAIR_COST_RATIO = 0.5;
export const SELL_RATIO = 0.5;

export function repairHpPerTick(kind: BuildingKind): number {
  return Math.max(1, Math.ceil(BUILDING_STATS[kind].hp / 720));
}

export function repairValue(kind: BuildingKind): number {
  const stats = BUILDING_STATS[kind];
  return stats.cost > 0 ? stats.cost : Math.max(200, Math.round(stats.hp / 4));
}

export function repairCostFor(kind: BuildingKind, hp: number): number {
  if (hp <= 0) return 0;
  const raw = (hp / BUILDING_STATS[kind].hp) * repairValue(kind) * REPAIR_COST_RATIO;
  return Math.max(1, Math.round(raw));
}

export function sellRefundFor(kind: BuildingKind, hp: number): number {
  if (hp <= 0) return 0;
  const raw = (hp / BUILDING_STATS[kind].hp) * repairValue(kind) * SELL_RATIO;
  return Math.max(1, Math.round(raw));
}

export function producerFor(unit: import("../types").UnitKind): BuildingKind {
  return UNIT_DEFINITIONS[unit].producer ?? "factory";
}

export function powerOf(kind: BuildingKind): number {
  return BUILDING_STATS[kind].power;
}

export function isDefensiveTurret(kind: BuildingKind | import("../types").UnitKind | string): boolean {
  return kind in BUILDING_DEFINITIONS && BUILDING_DEFINITIONS[kind as BuildingKind].aiRole === "defense";
}

/** Defensive turret penalties applied when a faction has a power deficit (power < 0). */
export const POWER_SHORTAGE_TURRET_COOLDOWN_RATE = 0.5;
export const POWER_SHORTAGE_TURRET_RANGE_MULTIPLIER = 0.75;
export const POWER_SHORTAGE_TURRET_SIGHT_MULTIPLIER = 0.75;
