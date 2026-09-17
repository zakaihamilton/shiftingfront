import type { MutableRefObject } from "react";
import type { SaveSession, SaveWriteStatus } from "@/lib/persist/save";
import type { MissionUxTelemetry } from "@/lib/persist/telemetry";
import type { Camera } from "@/lib/iso";
import type { FxBurst } from "@/lib/render/fx";
import type { PanAvailability, PanDir } from "@/lib/render/camera";
import type { ScreenShakeState } from "@/lib/render/screenShake";
import type { Command, SimEvent, SimState } from "@/lib/types";

export type RuntimeRefs = {
  stateRef: MutableRefObject<SimState>;
  commandQueue: MutableRefObject<Command[]>;
  pausedRef: MutableRefObject<boolean>;
  cameraRef: MutableRefObject<Camera>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  keys: MutableRefObject<Record<string, boolean>>;
  edgePanHover: MutableRefObject<{ dir: PanDir; startedAt: number } | null>;
  panHold: MutableRefObject<PanDir | null>;
  panAvailabilityRef: MutableRefObject<PanAvailability>;
  fxRef: MutableRefObject<FxBurst[]>;
  fxSequence: MutableRefObject<number>;
  screenShakeRef?: MutableRefObject<ScreenShakeState>;
  terminalSaveRef: MutableRefObject<boolean>;
  campaignRecordedRef: MutableRefObject<boolean>;
  lifecycleRef: MutableRefObject<RuntimeLifecycleState>;
  persistenceRef: MutableRefObject<RuntimePersistenceState>;
  uxRef: MutableRefObject<MissionUxTelemetry>;
  /** Prevents the old runtime from overwriting a checkpoint during load navigation. */
  suppressImplicitSavesRef?: MutableRefObject<() => void>;
};

export type RuntimePorts = {
  setState: (state: SimState) => void;
  setPanAvailability: (availability: PanAvailability) => void;
  applyEdgePan: (direction: PanDir | null) => void;
  redraw: (nowMs?: number, subTickAlpha?: number) => void;
  onAlert: (text: string, kind?: "warning" | "objective" | "contact" | "system") => void;
  onCommandNotice: (text: string, kind?: "success" | "info" | "warning" | "error") => void;
  saveSession: SaveSession;
  persistCampaign: boolean;
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
