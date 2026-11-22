import type { Facing, Vec2 } from "./map";

export type GameplayRulesVersion = 1 | 2;

export type Owner = 0 | 1 | 2 | 3;

export type UnitKind =
  | "harvester"
  | "infantry"
  | "antiArmor"
  | "tank"
  | "medic"
  | "repairTruck"
  | "convoyTruck"
  | "strikePlane"
  | "behemoth"
  | "scout";
export type UnitDomain = "human" | "vehicle" | "air";
export type CombatTargetDomain = "ground" | "air";
export type SupportRole = "medic" | "repairTruck";
export type BuildingKind =
  | "constructionYard"
  | "power"
  | "refinery"
  | "barracks"
  | "factory"
  | "turret"
  | "runway"
  | "antiAirTurret"
  | "radar"
  | "objective";

/** Producer types whose queues are shared across all buildings of that type. */
export type SharedProducerKind = "barracks" | "factory";
export type SharedProductionQueue = {
  producing?: { kind: UnitKind; remaining: number };
  /** In-progress jobs kept when several buildings were producing at once. */
  resume?: { kind: UnitKind; remaining: number }[];
  queue: UnitKind[];
};

export type EntityClass = "unit" | "building";

export type Formation = "line" | "column" | "wedge";
export type Stance = "aggressive" | "defensive" | "hold";
export type ControlGroupSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ControlGroups = Partial<Record<ControlGroupSlot, number[]>>;
export type ScenarioRole = "convoy" | "stranded" | "cargo";
export type OrderMode = "move" | "attackMove" | "attack";
export type WeaponType = "smallArms" | "antiArmor" | "cannon" | "airStrike" | "antiAir";
/** Visual ammunition style used by a unit or structure's attack effect. */
export type AmmoEffect = "bullet" | "missile" | "shell" | "bomb" | "beam";
export type ArmorType = "light" | "heavy" | "structure";

export type Entity = {
  /** Optional challenge actors are excluded from mandatory elimination objectives. */
  optionalChallenge?: boolean;
  readonly id: number;
  owner: Owner;
  class: EntityClass;
  kind: UnitKind | BuildingKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  path: Vec2[];
  attackTarget?: number;
  /** Last target hit, used to recognize incoming fire between weapon cooldowns. */
  lastFiredTargetId?: number;
  carry: number;
  constructing: number;
  producing?: { kind: UnitKind; remaining: number };
  queue: UnitKind[];
  marked: boolean;
  gatherX?: number;
  gatherY?: number;
  idle: boolean;
  facing?: Facing;
  repairing?: boolean;
  neutral?: boolean;
  scenarioRole?: ScenarioRole;
  /** Ground destination used by newly produced units from this building. */
  rallyPoint?: Vec2;
  /** A refinery has completed but is waiting for a walkable tile for its free harvester. */
  refineryHarvesterPending?: boolean;
  orderMode?: OrderMode;
  orderDestination?: Vec2;
  /** Shared terrain destination for group flow-field routing. */
  flowGoal?: Vec2;
  stance?: Stance;
  suppression?: number;
  armor?: ArmorType;
  weapon?: WeaponType;
  formation?: Formation;
  blockedTicks?: number;
  routePending?: boolean;
  /** Objective building currently assigned to an AI guard. */
  scenarioGuardTargetId?: number;
  supportTargetId?: number;
  supportMode?: "auto" | "assigned" | "hold";
  /** Ammunition remaining for aircraft. */
  ammo?: number;
  /** Maximum ammunition for aircraft. */
  maxAmmo?: number;
  /** Dedicated runway assigned to an aircraft. */
  assignedRunwayId?: number;
  /** Aircraft state while flying or being serviced. */
  flightState?: "airborne" | "servicing";
  /** Number of ticks spent servicing since the last ammo refill. */
  serviceTicks?: number;
  /** Runway the aircraft is currently approaching. */
  landingRunwayId?: number;
  /** Plane assigned to a dedicated runway. */
  assignedPlaneId?: number;
  /** When true, the harvester is executing a player-issued move command and should
   *  travel to orderDestination before the economy loop starts searching for ore. */
  moveToHarvest?: boolean;
  /** One rank earned by dealing enough damage in a campaign battle. */
  veteranRank?: 0 | 1;
  /** Damage dealt toward the veteran rank. Campaign player units only. */
  damageDealt?: number;
  /** Tank brace: slower, longer range, and planted until a move order. */
  braced?: boolean;
  /** Behemoth area shot charging at a ground point. */
  bombard?: { x: number; y: number; remaining: number };
  /** Neutral mechanic that joins the player on contact. Optional. */
  recruitable?: boolean;
};

export type UnitEntity = Entity & { class: "unit"; kind: UnitKind };
export type BuildingEntity = Entity & { class: "building"; kind: BuildingKind };

/** Narrows `entity.kind` to `UnitKind` without an unsafe cast at the call site. */
export function isUnitEntity(entity: Entity): entity is UnitEntity {
  return entity.class === "unit";
}

/** Narrows `entity.kind` to `BuildingKind` without an unsafe cast at the call site. */
export function isBuildingEntity(entity: Entity): entity is BuildingEntity {
  return entity.class === "building";
}

/** Objective assets remain under shroud until the player discovers them. */
export function isHiddenObjectiveAsset(
  entity: Pick<Entity, "owner" | "neutral" | "scenarioRole">,
): boolean {
  return (
    entity.owner === 0 &&
    entity.neutral === true &&
    (entity.scenarioRole === "stranded" || entity.scenarioRole === "cargo")
  );
}

/** Stranded rescue units are objective actors, not player-selectable units. */
export function isPlayerSelectableUnit(entity: Entity): boolean {
  return entity.class === "unit" && entity.scenarioRole !== "stranded";
}

export function isPlayerSelectableEntity(entity: Entity): boolean {
  return entity.class === "building" || isPlayerSelectableUnit(entity);
}
