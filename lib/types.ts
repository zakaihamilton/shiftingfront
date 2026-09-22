export type Owner = 0 | 1;

export type UnitKind = "harvester" | "infantry" | "antiArmor" | "tank" | "medic" | "repairTruck" | "convoyTruck" | "strikePlane";
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
  | "objective";

export type EntityClass = "unit" | "building";

export type WinCategoryKind =
  | "harvestQuota"
  | "forceQuota"
  | "structureQuota"
  | "destroyMarked"
  | "razeAll"
  | "decapitate"
  | "annihilate"
  | "holdTheLine";

export type MissionKind = WinCategoryKind | "escort" | "sabotage" | "rescue" | "extraction";
export type MissionFamily = "economy" | "assault" | "defense" | "operation";
export type MissionProfileVariant =
  | "resourceRace"
  | "forwardIndustry"
  | "surgicalStrike"
  | "siege"
  | "concentratedWaves"
  | "crossfire"
  | "directRoute"
  | "contestedRoute";
export type MissionProfile = {
  family: MissionFamily;
  variant: MissionProfileVariant;
};
export type BalanceStrategy = "competent" | "baseline" | "rush" | "turtle" | "greed" | "infantry" | "vehicles";
export type Formation = "line" | "column" | "wedge";
export type Stance = "aggressive" | "defensive" | "hold";
export type ControlGroupSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ControlGroups = Partial<Record<ControlGroupSlot, number[]>>;
export type ScenarioRole = "convoy" | "stranded" | "cargo";
export type OrderMode = "move" | "attackMove" | "attack";
export type LossReason = "yardDestroyed" | "deadline" | "objectiveTargetLost";
export type MissionDirectorPhase = "opening" | "pressure" | "finale";
export type WeaponType = "smallArms" | "antiArmor" | "cannon" | "airStrike" | "antiAir";
export type ArmorType = "light" | "heavy" | "structure";
export type TutorialStage = "select" | "move" | "build" | "produce" | "attack" | "repair" | "complete";
export type AiBehavior = "economy" | "defense" | "assault" | "retreat" | "regroup";

/** Last-known information the enemy may use after a player entity leaves sight. */
export type AiContact = {
  id: number;
  class: EntityClass;
  kind: UnitKind | BuildingKind;
  x: number;
  y: number;
  lastSeenTick: number;
};

export type SecondaryObjective = {
  id: string;
  label: string;
  kind: "preserveYard" | "destroyTarget" | "completeBefore" | "keepUnits";
  target?: number;
  targetId?: number;
  completed?: boolean;
};

export type MissionDirectorState = {
  phase: MissionDirectorPhase;
  pressureStart: number;
  finaleStart: number;
  eventCount: number;
};

export type MissionRuntime = {
  kind: MissionKind;
  phase: "active" | "extraction" | "complete";
  targetIds: number[];
  convoyStartTick?: number;
  zone?: Vec2;
  deadline?: number;
  rescued: number;
  required: number;
  extractedIds?: number[];
  /** Rescue targets that have been contacted and are now player-controlled. */
  contactedIds?: number[];
  /** Rescue targets that have reached the player Command HQ zone. */
  rescuedIds?: number[];
  /** Edge state used to avoid repeating the HQ threat warning. */
  hqThreatActive?: boolean;
  secondary: SecondaryObjective[];
  director?: MissionDirectorState;
};

// Contact is resolved around the target's occupied tile. A radius below four
// leaves units that cannot enter the target cell visibly adjacent but unable to
// trigger rescue/extraction, especially at map edges or in a formation.
export const RESCUE_CONTACT_RADIUS = 3.5;
export const OBJECTIVE_ZONE_RADIUS = 6;

export function inObjectiveZone(
  x: number,
  y: number,
  zone: Vec2 | undefined,
  radius = OBJECTIVE_ZONE_RADIUS,
): boolean {
  return !!zone && Math.hypot(x - zone.x, y - zone.y) <= radius;
}

export function missionUsesObjectiveZone(kind: MissionKind | undefined): boolean {
  return kind === "escort" || kind === "rescue" || kind === "extraction";
}

export type CampaignProgress = {
  version: 1;
  seed: number;
  tutorialComplete: boolean;
  unlockedMission: number;
  completedMissions: number[];
  medals: Record<string, number>;
  bestScores: Record<string, number>;
};

export type WinCategory = {
  kind: MissionKind;
  target?: number;
  role?: UnitKind;
  building?: BuildingKind;
  targetCount?: number;
  targetIds?: number[];
  ticks?: number;
};

export type TileKind = 0 | 1 | 2 | 3;

export const TILE_CLEAR = 0 as const;
export const TILE_WATER = 1 as const;
export const TILE_RESOURCE = 2 as const;
export const TILE_BLOCKED = 3 as const;

export type SurfaceKind = 0 | 1 | 2;
export const SURFACE_NONE = 0 as const;
export const SURFACE_ROAD = 1 as const;
export const SURFACE_CONCRETE = 2 as const;

export type BiomeName =
  | "ash plains"
  | "crystal flats"
  | "rust canyons"
  | "salt marshes"
  | "glass desert"
  | "tundra grid"
  | "jungle wreckage"
  | "volcanic shelf";

export type Facing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Vec2 = { x: number; y: number };

export type Entity = {
  id: number;
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
export function isHiddenObjectiveAsset(entity: Pick<Entity, "owner" | "neutral" | "scenarioRole">): boolean {
  return entity.owner === 0 && entity.neutral === true &&
    (entity.scenarioRole === "stranded" || entity.scenarioRole === "cargo");
}

/** Stranded rescue units are objective actors, not player-selectable units. */
export function isPlayerSelectableUnit(entity: Entity): boolean {
  return entity.class === "unit" && entity.scenarioRole !== "stranded";
}

export function isPlayerSelectableEntity(entity: Entity): boolean {
  return entity.class === "building" || isPlayerSelectableUnit(entity);
}

export type Palette = {
  primary: string;
  secondary: string;
  accent: string;
  outline: string;
  light: string;
  dark: string;
};

export type FactionVisualProfile = {
  designFamily: 0 | 1 | 2;
  material: "brushed" | "armored" | "industrial";
  trimPattern: 0 | 1 | 2 | 3;
  insignia: 0 | 1 | 2 | 3 | 4;
  weathering: 0 | 1 | 2 | 3;
  lightRig: "cyan" | "amber" | "red";
};

export type CampaignArtFamily = 0 | 1 | 2;

export type CampaignVisualProfile = {
  family: CampaignArtFamily;
  terrainTreatment: "modular" | "armored" | "expeditionary";
  terrainAccent: "cyan" | "amber" | "red";
};

export type Faction = {
  id: Owner;
  name: string;
  adjective: string;
  palette: Palette;
};

export type FaceDna = {
  portraitId: string;
  feminine: boolean;
};

export type CharacterRole = "commander" | "advisor" | "enemyLeader";

export type Character = {
  role: CharacterRole;
  name: string;
  title: string;
  face: FaceDna;
};

export type BriefingLine = {
  speaker: CharacterRole;
  text: string;
};

export type WorldSetting = {
  name: string;
  tone: string;
  conflict: string;
  era: string;
  biome: BiomeName;
};

export type MissionDef = {
  index: number;
  name: string;
  briefing: BriefingLine[];
  win: WinCategory;
  mapSize: number;
  biome: BiomeName;
  kind?: MissionKind;
  /** Seed-derived tactical and narrative identity; omitted by legacy fixtures. */
  profile?: MissionProfile;
};

export type MapSpawnTopology =
  | "corner-nw-se"
  | "corner-se-nw"
  | "corner-sw-ne"
  | "corner-ne-sw"
  | "edge-w-e"
  | "edge-e-w"
  | "edge-n-s"
  | "edge-s-n"
  | "center-player"
  | "center-enemy";

export type LandmarkKind =
  | "crater"
  | "canyon"
  | "spireRidge"
  | "delta"
  | "caldera"
  | "crevasse"
  | "ruinClearing"
  | "basaltShelf";

/** Recursive readonly view for generated data shared by the simulation and UI. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export type ReadonlyMissionDef = DeepReadonly<MissionDef>;
export type ReadonlyWinCategory = DeepReadonly<WinCategory>;

/** Generated campaigns are immutable views; mutable state is created at the sim boundary. */
export type Campaign = DeepReadonly<{
  seed: string;
  seedNumber: number;
  world: WorldSetting;
  factions: [Faction, Faction];
  characters: {
    commander: Character;
    advisor: Character;
    enemyLeader: Character;
  };
  missions: MissionDef[];
}>;

/** A campaign exposed to callers is immutable because generated campaigns are cached. */
export type ReadonlyCampaign = Campaign;

export type ShapeSpec = {
  type: "rect" | "ellipse" | "poly" | "diamond" | "line";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  alpha?: number;
  points?: number[];
};

export type SpriteCrop = {
  x: number;
  y: number;
  w: number;
  h: number;
  sourceW: number;
  sourceH: number;
  refW?: number;
  refH?: number;
};

export type SpriteSpec = {
  id: string;
  kind: "unit" | "building" | "tile";
  w: number;
  h: number;
  palette: Palette;
  shapes: ShapeSpec[];
  svg?: string;
  /** A project-local pre-rendered sprite. Kept optional for deterministic procedural fallbacks. */
  imageSrc?: string;
  /** Seeded campaign-grade color treatment composited over a pre-rendered sprite. */
  imageTint?: string;
  /** Optional source-image crop used to remove adjacent artwork from generated raster assets. */
  imageCrop?: SpriteCrop;
  /** Normalized source-image point that should sit on the sprite's logical anchor. */
  imageAnchorX?: number;
  imageAnchorY?: number;
  /** A subtle material plate composited into procedural terrain without replacing map geometry. */
  imageTextureSrc?: string;
  imageTextureOpacity?: number;
  imageTextureOffset?: number;
  /** How much of a raster, from the ground up, is visible. Used for building construction. */
  imageReveal?: number;
  /** Screen-space turn applied around the sprite anchor (used by raster units). */
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  pixelScale?: number;
};

export type TileContour = "none" | "bank" | "ridge";

export type TileSpriteOptions = {
  biome?: BiomeName;
  variant?: number;
  edgeMask?: number;
  /** Cardinal boundary mask for contiguous roads/pads; used to avoid cell-by-cell seams. */
  surfaceMask?: number;
  surface?: SurfaceKind;
  resourceLevel?: number;
  contour?: TileContour;
  campaignProfile?: CampaignVisualProfile;
};

export type AnimFrame = 0 | 1 | 2 | 3;

export type UnitSpriteOptions = {
  variant?: number;
  facing?: Facing;
  animationFrame?: AnimFrame;
  /** Selects the generated four-frame walk cycle for bipedal units. */
  motion?: "walk";
  damageStage?: 0 | 1 | 2;
  profile?: FactionVisualProfile;
};

export type BuildingSpriteOptions = {
  variant?: number;
  animationFrame?: AnimFrame;
  damageStage?: 0 | 1 | 2;
  constructionStage?: 0 | 1 | 2 | 3;
  profile?: FactionVisualProfile;
};

export type SimState = {
  seed: number;
  missionIndex: number;
  tick: number;
  width: number;
  height: number;
  tiles: number[];
  heights: number[];
  surfaces: SurfaceKind[];
  biome: BiomeName;
  resourceAmount: number[];
  fog: number[];
  entities: Entity[];
  nextId: number;
  credits: [number, number];
  creditsEarned: [number, number];
  unitsProduced: [number, number];
  unitsProducedByRole: Record<UnitKind, number>;
  buildingsCompleted: [number, number];
  buildingsCompletedByKind: Record<string, number>;
  losses: {
    units: [number, number];
    buildings: [number, number];
  };
  win: WinCategory;
  result: "playing" | "won" | "lost";
  lossReason?: LossReason;
  rngState: number;
  factions: [Faction, Faction];
  missionName: string;
  missionKind?: MissionKind;
  runtime?: MissionRuntime;
  tutorialStage?: TutorialStage;
  /** Optional enemy unit created as the tutorial's close-range combat drill. */
  tutorialTargetId?: number;
  /** Power Plant entity being built for the tutorial's construction lesson. */
  tutorialBuildId?: number;
  aiState?: AiBehavior;
  /** Tick when the current retreat began. Cleared when the army leaves retreat. */
  aiRetreatTick?: number;
  /** After a timed-out retreat, stay out until average HP recovers to the leave threshold. */
  aiRetreatLocked?: boolean;
  /** Deterministic, serializable last-known player contacts used by enemy AI. */
  aiContacts?: Record<string, AiContact>;
  /** Player control-group membership, persisted with the mission but ignored by simulation identity. */
  controlGroups: ControlGroups;
  /** Increments whenever a building footprint changes the static navigation grid. */
  navigationRevision: number;
  /** Per-tick pathfinding search budget tracking. */
  pathBudget?: { remaining: number; used: number };
};

export type Command =
  | { type: "move"; unitIds: number[]; x: number; y: number; formation?: Formation }
  | { type: "attackMove"; unitIds: number[]; x: number; y: number; formation?: Formation }
  | { type: "attack"; unitIds: number[]; targetId: number }
  | { type: "support"; unitIds: number[]; targetId: number }
  | { type: "land"; unitIds: number[]; runwayId: number }
  | { type: "harvest"; unitIds: number[]; x: number; y: number }
  | { type: "build"; building: BuildingKind; x: number; y: number }
  | { type: "produce"; fromId: number; unit: UnitKind }
  | { type: "rally"; buildingId: number; x: number; y: number }
  | { type: "cancelBuild"; building: BuildingKind }
  | { type: "cancelProduce"; unit: UnitKind }
  | { type: "repair"; buildingId: number }
  | { type: "sell"; buildingId: number }
  | { type: "stop"; unitIds: number[] }
  | { type: "stance"; unitIds: number[]; stance: Stance }
  | { type: "formation"; unitIds: number[]; formation: Formation };

export type SimEvent =
  | { type: "produced"; owner: Owner; kind: UnitKind; id?: number; x?: number; y?: number; sourceId?: number }
  | { type: "built"; owner: Owner; kind: BuildingKind; id?: number; x?: number; y?: number }
  | { type: "destroyed"; id: number; owner: Owner; kind: UnitKind | BuildingKind; x: number; y: number }
  | { type: "sold"; id: number; kind: UnitKind | BuildingKind; x: number; y: number }
  | { type: "repairStarted"; x: number; y: number }
  | { type: "repair"; owner: Owner; buildingId: number; kind: BuildingKind; amount: number; cost: number; x: number; y: number }
  | {
      type: "combat";
      owner: Owner;
      attackerKind: UnitKind | BuildingKind;
      weapon: WeaponType;
      x: number;
      y: number;
      targetX: number;
      targetY: number;
      targetOwner: Owner;
      targetKind: UnitKind | BuildingKind;
      destroyed: boolean;
    }
  | {
      type: "support";
      owner: Owner;
      providerId: number;
      providerKind: UnitKind;
      targetId: number;
      targetKind: UnitKind;
      amount: number;
      x: number;
      y: number;
      targetX: number;
      targetY: number;
    }
  | { type: "aircraftStatus"; owner: Owner; aircraftId: number; runwayId?: number; status: "returning" | "landed" | "launched"; x: number; y: number }
  | { type: "credits"; owner: Owner; amount: number }
  | { type: "won" }
  | { type: "lost" }
  | { type: "objectiveExpired"; kind: MissionKind }
  | {
      type: "objectiveMilestone";
      kind: MissionKind;
      milestone: "firstContact" | "allContacted" | "firstReturned" | "complete";
      text: string;
    }
  | { type: "commandRejected"; reason: string }
  | { type: "alert"; kind: "warning" | "objective" | "contact"; text: string }
  | { type: "suppressed"; id: number }
  | { type: "powerShortage"; owner: Owner }
  | { type: "deadlineWarning"; remainingTicks: number };

export type InspectReport = {
  seed: string;
  missionIndex: number;
  tick: number;
  credits: number;
  creditsEarned: number;
  units: { player: number; enemy: number };
  buildings: { player: number; enemy: number };
  objective: { kind: MissionKind; label: string; current: number; target: number };
  result: SimState["result"];
};
