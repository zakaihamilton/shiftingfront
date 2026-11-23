import type { BuildingKind, EntityClass, GameplayRulesVersion, Owner, UnitKind } from "./entities";
import type { BiomeName, Vec2, WorldSetting } from "./map";
import type { BriefingLine, Character, Faction } from "./visuals";

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
export type BalanceStrategy =
  | "behemoths"
  | "aircraft"
  | "support"
  | "competent"
  | "baseline"
  | "rush"
  | "turtle"
  | "greed"
  | "infantry"
  | "vehicles";
export type LossReason = "yardDestroyed" | "deadline" | "objectiveTargetLost";
export type MissionDirectorPhase = "opening" | "pressure" | "finale";
export type TutorialStage =
  | "select"
  | "move"
  | "build"
  | "produce"
  | "attack"
  | "repair"
  | "complete";
export type AiBehavior = "economy" | "defense" | "assault" | "retreat" | "regroup";

/** Last-known information the enemy may use after a player entity leaves sight. */
export type AiContact = {
  id: number;
  owner?: Owner;
  class: EntityClass;
  kind: UnitKind | BuildingKind;
  x: number;
  y: number;
  lastSeenTick: number;
};

export type MultiplayerAiMemory = {
  behavior?: AiBehavior;
  retreatTick?: number;
  retreatLocked?: boolean;
  contacts?: Record<string, AiContact>;
  scoutAssignments?: Record<string, { unitId: number; target: Vec2; assignedTick: number }>;
  nextScoutTargetIndex?: number;
};

export type SecondaryObjective = {
  id: string;
  label: string;
  priority?: "primary" | "optional";
  zone?: Vec2;
  radius?: number;
  progressTicks?: number;
  kind: "secureZone" | "preserveYard" | "destroyTarget" | "completeBefore" | "keepUnits";
  target?: number;
  targetId?: number;
  completed?: boolean;
};

export type MissionDirectorState = {
  phase: MissionDirectorPhase;
  pressureStart: number;
  finaleStart: number;
  eventCount: number;
  /** Set after the pre-finale warning has been spoken. */
  finaleWarned?: boolean;
  /** Set after an optional cache pulls the finale earlier. */
  finalePulled?: boolean;
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
  /** Optional cache reward has already been paid. */
  cachePaid?: boolean;
  /** Ticks removed from the finale after the supply cache is raided. */
  finalePullTicks?: number;
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

export type DeploymentEdge = "veteranSquad" | "forwardTurret" | "airSortie" | "powerReserve";

export type CampaignProgress = {
  gameplayRulesVersion?: GameplayRulesVersion;
  version: 1;
  seed: number;
  tutorialComplete: boolean;
  unlockedMission: number;
  completedMissions: number[];
  medals: Record<string, number>;
  bestScores: Record<string, number>;
  /** Chosen reward applied to the next unlocked mission, then cleared. */
  deploymentEdge?: DeploymentEdge;
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

export type MissionDef = {
  gameplayRulesVersion?: GameplayRulesVersion;
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
  gameplayRulesVersion?: GameplayRulesVersion;
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
