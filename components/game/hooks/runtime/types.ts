import type { MutableRefObject, PointerEventHandler, RefObject } from "react";
import type { SaveSession, SaveWriteStatus } from "@/lib/persist/save";
import type { MissionUxTelemetry } from "@/lib/persist/telemetry";
import type { Camera } from "@/lib/iso";
import type { FxBurst } from "@/lib/render/fx";
import type { PanAvailability, PanDir } from "@/lib/render/camera";
import type { ScreenShakeState } from "@/lib/render/screenShake";
import type { Campaign, Entity, FactionVisualProfile, Palette, BuildingKind, Command, Formation, SimEvent, SimState, Stance, UnitKind } from "@/lib/types";
import type { GameSettings, KeyBindings } from "@/lib/persist/settings";
import type { FieldGuideTopic } from "@/lib/fieldGuide";
import type { ArchiveEntry, SlotMeta } from "@/lib/persist/save";
import type { AudioVolumeKey } from "@/lib/audio/mixer";
import type { CommandTab, PauseView } from "@/lib/ui/shortcuts";
import type { MissionConfirmation } from "../missionConfirmation";
import type { GameActions } from "../useGameActions";
import type { GameCamera } from "../useGameCamera";
import type { GameSession } from "../useGameSession";
import type { CombatAlertKind } from "../useCombatAlert";
import type { CommandNoticeState } from "../useGameChrome";
import type { MinimapPing } from "../../MinimapFrame";

export type SimulationRuntimeRefs = {
  stateRef: MutableRefObject<SimState>;
  commandQueue: MutableRefObject<Command[]>;
  pausedRef: MutableRefObject<boolean>;
  terminalSaveRef: MutableRefObject<boolean>;
  campaignRecordedRef: MutableRefObject<boolean>;
  lifecycleRef: MutableRefObject<RuntimeLifecycleState>;
  persistenceRef: MutableRefObject<RuntimePersistenceState>;
  uxRef: MutableRefObject<MissionUxTelemetry>;
  /** Prevents the old runtime from overwriting a checkpoint during load navigation. */
  suppressImplicitSavesRef?: MutableRefObject<() => void>;
};

export type InteractionRuntimeRefs = {
  cameraRef: MutableRefObject<Camera>;
  keys: MutableRefObject<Record<string, boolean>>;
  edgePanHover: MutableRefObject<{ dir: PanDir; startedAt: number } | null>;
  panHold: MutableRefObject<PanDir | null>;
  panAvailabilityRef: MutableRefObject<PanAvailability>;
};

export type RenderingRuntimeRefs = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  fxRef: MutableRefObject<FxBurst[]>;
  fxSequence: MutableRefObject<number>;
  screenShakeRef?: MutableRefObject<ScreenShakeState>;
};

export type SimulationRuntimePorts = {
  setState: (state: SimState) => void;
};

export type FrameRuntimePorts = {
  setPanAvailability: (availability: PanAvailability) => void;
  applyEdgePan: (direction: PanDir | null) => void;
  redraw: (nowMs?: number, subTickAlpha?: number) => void;
};

export type PresentationRuntimePorts = {
  onAlert: (text: string, kind?: "warning" | "objective" | "contact" | "system") => void;
  onCommandNotice: (text: string, kind?: "success" | "info" | "warning" | "error") => void;
};

export type PersistenceRuntimePorts = {
  saveSession: SaveSession;
  persistCampaign: boolean;
};

export type RuntimeKernelRefs = {
  simulation: SimulationRuntimeRefs;
  interaction: InteractionRuntimeRefs;
  rendering: RenderingRuntimeRefs;
};

export type RuntimeKernelPorts = {
  simulation: SimulationRuntimePorts;
  frame: FrameRuntimePorts;
  presentation: PresentationRuntimePorts;
  persistence: PersistenceRuntimePorts;
};

export type RuntimeKernel = {
  refs: RuntimeKernelRefs;
  ports: RuntimeKernelPorts;
};

export type RuntimeCounters = {
  commandsIssued: number;
  commandRejections: number;
  firstCombatTick?: number;
  firstPressureTick?: number;
  firstHqThreatTick?: number;
  hqHealthAtPressure?: number;
  hqHealthAtEnd?: number;
  primaryCompletedTick?: number;
  assaultTransitions: number;
  lastAiState?: SimState["aiState"];
  ux: MissionUxTelemetry;
};

export type RuntimeLifecycleState = {
  sessionState: SimState | null;
  terminalPresented: boolean;
  commandApplied: boolean;
  counters: RuntimeCounters;
};

export type RuntimePersistenceState = {
  saveRetry: {
    state: SimState | null;
    retry: boolean;
    nextAttemptMs: number;
    lastStatus: SaveWriteStatus;
  };
  nextCampaignSaveAttemptMs: number;
};

export type RuntimeController = {
  start: () => void;
  stop: () => void;
  drainCommands: () => Command[];
  onTick: (state: SimState, events: SimEvent[], now: number) => void;
  onFrame: (now: number, state: SimState, paused: boolean, subTickAlpha: number, frameMs: number) => void;
};

export type CanvasPointerHandlers = {
  onPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onPointerEnter: PointerEventHandler<HTMLCanvasElement>;
  onPointerLeave: PointerEventHandler<HTMLCanvasElement>;
  onPointerUp: PointerEventHandler<HTMLCanvasElement>;
  onPointerCancel: PointerEventHandler<HTMLCanvasElement>;
};

export type PlayFieldSurfaceModel = {
  hostRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  tooltipCanvasRef: RefObject<HTMLCanvasElement | null>;
  panAvail: PanAvailability;
  hotPan: PanDir | null;
  campaign: Campaign;
  state: SimState;
  tutorial: boolean;
  paused: boolean;
  pointer: CanvasPointerHandlers;
  resultActions: {
    onExitTutorial: () => void;
    onBackTutorial: () => void;
    onNextBriefing: () => void;
    onCampaignVictory: () => void;
    onRetry: () => void;
    onMenu: () => void;
  };
  feedback: {
    combatAlert?: string | null;
    combatAlertKind?: CombatAlertKind;
    commandNotice?: CommandNoticeState;
  };
  onObjectivePanelToggle?: () => void;
};

export type SidebarCommandModel = {
  placeKind: BuildingKind | null;
  repairMode: boolean;
  sellMode: boolean;
  onPlace: (kind: BuildingKind) => void;
  onRepair: () => void;
  onSell: () => void;
  onCancelBuilding: (kind: BuildingKind) => void;
  onQueueUnit: (unit: UnitKind) => void;
  onCancelUnit: (unit: UnitKind) => void;
  availableProducer: (unit: UnitKind) => Entity | undefined;
  onStop: () => void;
  onStance: (stance: Stance) => void;
  onFormation: (formation: Formation) => void;
};

export type SidebarSurfaceModel = {
  factionName: string;
  state: SimState;
  palette: Palette;
  profile: FactionVisualProfile;
  selected: Entity | undefined;
  activeTab: CommandTab;
  power: number;
  produced: number;
  used: number;
  miniRef: RefObject<HTMLCanvasElement | null>;
  camera: GameCamera;
  onPause: () => void;
  onToggleMobilePanel: () => void;
  onTab: (tab: CommandTab) => void;
  commands: SidebarCommandModel;
  mobilePanelOpen: boolean;
  selectionCount: number;
  minimapPing?: MinimapPing;
};

export type PauseSessionModel = {
  saveSlots: SlotMeta[];
  loadEntries: ArchiveEntry[];
  defaultSlotName: string;
  telemetryEnabled: boolean;
  telemetryRecordCount?: number;
  onResume: () => void;
  onSave: () => void;
  onLoad: () => void;
  onCommitSave: (name: string, overwriteId: string | null) => boolean;
  onLoadEntry: (entry: ArchiveEntry) => void;
  onDeleteEntry?: (entry: ArchiveEntry) => void;
  onBriefing: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onLeaveWithoutSave?: () => void;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onToggleVoice?: () => void;
  onToggleReducedMotion?: () => void;
  onToggleHighContrast?: () => void;
  onCycleColorblind?: () => void;
  onCycleHudScale?: () => void;
  onUpdateKeyBindings?: (bindings: KeyBindings) => void;
  onVolumeChange: (key: AudioVolumeKey, value: number) => void;
  onMarkFieldGuideTopicSeen?: (topic: FieldGuideTopic) => void;
  onExportTelemetry?: () => boolean;
  onClearTelemetry?: () => boolean;
};

export type PauseSurfaceModel = {
  view: PauseView;
  notice: string;
  settings: GameSettings;
  tutorial: boolean;
  setView: (view: PauseView) => void;
  setNotice: (notice: string) => void;
  onControlsOpened?: () => void;
  session: PauseSessionModel;
};

export type OverlaySurfaceModel = {
  campaign: Campaign;
  state: SimState;
  playerVisualProfile: FactionVisualProfile;
  selectedIds: number[];
  tutorial: boolean;
  mobilePanelOpen: boolean;
  mobileLauncherRef: RefObject<HTMLButtonElement | null>;
  miniRef: RefObject<HTMLCanvasElement | null>;
  activeTab: CommandTab;
  onTab: (tab: CommandTab) => void;
  paused: boolean;
  audioSettings: GameSettings;
  camera: GameCamera;
  onToggleMobilePanel: () => void;
  onMobileSheetDrag?: (direction: "open" | "close") => void;
  sidebar: SidebarSurfaceModel;
  pause: PauseSurfaceModel | null;
  confirmation: {
    value: MissionConfirmation;
    onConfirm: () => void;
    onCancel: () => void;
  } | null;
};

export interface GameRuntime {
  campaign: Campaign;
  playerVisualProfile: FactionVisualProfile;
  palette: Palette;
  state: SimState;
  tutorial: boolean;
  paused: boolean;
  hostRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  tooltipCanvasRef: RefObject<HTMLCanvasElement | null>;
  miniRef: RefObject<HTMLCanvasElement | null>;
  panAvail: PanAvailability;
  hotPan: PanDir | null;
  onPointerDown: CanvasPointerHandlers["onPointerDown"];
  onPointerMove: CanvasPointerHandlers["onPointerMove"];
  onPointerEnter: CanvasPointerHandlers["onPointerEnter"];
  onPointerLeave: CanvasPointerHandlers["onPointerLeave"];
  onPointerUp: CanvasPointerHandlers["onPointerUp"];
  onPointerCancel: CanvasPointerHandlers["onPointerCancel"];
  onExitTutorial: () => void;
  onBackTutorial: () => void;
  onNextBriefing: () => void;
  onCampaignVictory: () => void;
  onRetry: () => void;
  onMenu: () => void;
  combatAlert: string | null;
  combatAlertKind: CombatAlertKind;
  commandNotice: CommandNoticeState;
  selectedIds: number[];
  selectionMode: boolean;
  setSelectionMode: (value: boolean) => void;
  mobilePanelOpen: boolean;
  mobileLauncherRef: RefObject<HTMLButtonElement | null>;
  activeTab: CommandTab;
  onTab: (tab: CommandTab) => void;
  pauseView: PauseView;
  pauseNotice: string;
  audioSettings: GameSettings;
  camera: GameCamera;
  setPauseView: (view: PauseView) => void;
  setPauseNotice: (notice: string) => void;
  onToggleMobilePanel: () => void;
  onMobileSheetDrag: (direction: "open" | "close") => void;
  onObjectivePanelToggle: () => void;
  onControlsOpened: () => void;
  onPause: (view?: PauseView) => void;
  actions: GameActions;
  session: GameSession;
}
