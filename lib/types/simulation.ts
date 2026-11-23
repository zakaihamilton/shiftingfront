import type {
  BuildingKind,
  ControlGroups,
  Entity,
  Formation,
  GameplayRulesVersion,
  Owner,
  SharedProducerKind,
  SharedProductionQueue,
  Stance,
  UnitKind,
  WeaponType,
} from "./entities";
import type { BiomeName, SurfaceKind } from "./map";
import type {
  AiBehavior,
  AiContact,
  LossReason,
  MissionKind,
  MissionRuntime,
  MultiplayerAiMemory,
  TutorialStage,
  WinCategory,
} from "./missions";
import type { Faction } from "./visuals";

export type SimState = {
  gameplayRulesVersion?: GameplayRulesVersion;
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
  /** Shared Barracks and Vehicle Plant production queues, keyed by owner and producer type. */
  productionQueues?: Partial<
    Record<Owner, Partial<Record<SharedProducerKind, SharedProductionQueue>>>
  >;
  /** Active Barracks and Vehicle Plant for each owner. */
  activeProducerIds?: Partial<Record<Owner, Partial<Record<SharedProducerKind, number>>>>;
  nextId: number;
  credits: number[];
  creditsEarned: number[];
  unitsProduced: number[];
  unitsProducedByRole: Record<UnitKind, number>;
  buildingsCompleted: number[];
  buildingsCompletedByKind: Record<string, number>;
  losses: {
    units: number[];
    buildings: number[];
  };
  win: WinCategory;
  result: "playing" | "won" | "lost";
  /** The peer's local seat. Omitted in campaign missions, which always use owner 0. */
  viewOwner?: Owner;
  /** Versus battles use Construction Yard elimination instead of campaign objectives and AI. */
  multiplayer?: boolean;
  /** Seats participating in this versus match, in stable owner order. */
  multiplayerOwners?: Owner[];
  /** Seats already eliminated from the skirmish. */
  multiplayerEliminated?: Owner[];
  /** Guest seats controlled by deterministic multiplayer AI. */
  multiplayerAiOwners?: Owner[];
  /** Per-bot decision state shared by every lockstep peer. */
  multiplayerAiMemory?: Partial<Record<Owner, MultiplayerAiMemory>>;
  /** Temporary command context set only while one queued order is applied. */
  commandOwner?: Owner;
  winner?: Owner | null;
  lossReason?: LossReason;
  rngState: number;
  factions: Faction[];
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
  /**
   * Campaign proficiency snapshotted when the mission starts.
   * Omitted means neutral. Live pressure is derived each decision and is not stored.
   */
  proficiencyBand?: -1 | 0 | 1;
  /** Extra power granted by the power-reserve deployment edge. */
  powerReserve?: number;
  /** Deterministic, serializable last-known player contacts used by enemy AI. */
  aiContacts?: Record<string, AiContact>;
  /** Player control-group membership, persisted with the mission but ignored by simulation identity. */
  controlGroups: ControlGroups;
  /** Increments whenever a building footprint changes the static navigation grid. */
  navigationRevision: number;
  /** Per-tick pathfinding search budget tracking. */
  pathBudget?: { remaining: number; used: number };
};

type CommandOrder =
  | { type: "move"; unitIds: number[]; x: number; y: number; formation?: Formation }
  | { type: "attackMove"; unitIds: number[]; x: number; y: number; formation?: Formation }
  | { type: "attack"; unitIds: number[]; targetId: number }
  | { type: "support"; unitIds: number[]; targetId: number }
  | { type: "land"; unitIds: number[]; runwayId: number }
  | { type: "harvest"; unitIds: number[]; x: number; y: number }
  | { type: "build"; building: BuildingKind; x: number; y: number }
  | { type: "produce"; fromId: number; unit: UnitKind }
  | { type: "activateProducer"; buildingId: number }
  | { type: "rally"; buildingId: number; x: number; y: number }
  | { type: "cancelBuild"; building: BuildingKind }
  | { type: "cancelProduce"; unit: UnitKind }
  | { type: "repair"; buildingId: number }
  | { type: "sell"; buildingId: number }
  | { type: "stop"; unitIds: number[] }
  | { type: "stance"; unitIds: number[]; stance: Stance }
  | { type: "formation"; unitIds: number[]; formation: Formation }
  | { type: "brace"; unitIds: number[] }
  | { type: "bombard"; unitIds: number[]; x: number; y: number };

/** Owner is assigned by the host arbiter; single-player commands default to owner 0. */
export type Command = CommandOrder & { owner?: Owner };

export type SimEvent =
  | {
      type: "produced";
      owner: Owner;
      kind: UnitKind;
      id?: number;
      x?: number;
      y?: number;
      sourceId?: number;
    }
  | { type: "built"; owner: Owner; kind: BuildingKind; id?: number; x?: number; y?: number }
  | {
      type: "destroyed";
      id: number;
      owner: Owner;
      kind: UnitKind | BuildingKind;
      x: number;
      y: number;
    }
  | { type: "sold"; id: number; kind: UnitKind | BuildingKind; x: number; y: number }
  | { type: "repairStarted"; x: number; y: number }
  | {
      type: "repair";
      owner: Owner;
      buildingId: number;
      kind: BuildingKind;
      amount: number;
      cost: number;
      x: number;
      y: number;
    }
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
      /** Presentational blast radius. Bombard sets this because it reaches past the weapon splash radius. */
      areaRadius?: number;
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
  | {
      type: "aircraftStatus";
      owner: Owner;
      aircraftId: number;
      runwayId?: number;
      status: "returning" | "landed" | "launched";
      x: number;
      y: number;
    }
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
  | { type: "commandRejected"; reason: string; owner?: Owner }
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
