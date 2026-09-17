import { useEffect, useRef, type MutableRefObject } from "react";
import type { Camera } from "@/lib/iso";
import type { FxBurst } from "@/lib/render/fx";
import type { PanAvailability, PanDir } from "@/lib/render/camera";
import type { Command, SimState } from "@/lib/types";
import type { SaveSession } from "@/lib/persist/save";
import type { MissionUxTelemetry } from "@/lib/persist/telemetry";
import { createGameRuntimeFacade } from "./runtime/facade";
import type { RuntimeLifecycleState, RuntimePersistenceState, RuntimePorts, RuntimeRefs } from "./runtime/types";

function createFallbackUxTelemetry(): MissionUxTelemetry {
  return {
    briefingSkipped: false,
    controlsOpened: 0,
    tutorialCompleted: false,
    tutorialExited: false,
    mobilePanelOpened: 0,
    objectivePanelToggles: 0,
    commandFeedbackCount: 0,
    commandRejectionsByReason: {},
  };
}

export function useGameLoop({
  stateRef,
  setState,
  cmdQ,
  pausedRef,
  camRef,
  canvasRef,
  keys,
  edgePanHover,
  panHold,
  panAvailRef,
  setPanAvail,
  applyEdgePan,
  fxRef,
  fxSeq,
  screenShakeRef,
  terminalSaveRef,
  campaignRecordedRef,
  redraw,
  onAlert,
  onCommandNotice,
  saveSession,
  persistCampaign = true,
  uxRef: suppliedUxRef,
  suppressImplicitSavesRef,
}: {
  stateRef: MutableRefObject<SimState>;
  setState: (s: SimState) => void;
  cmdQ: MutableRefObject<Command[]>;
  pausedRef: MutableRefObject<boolean>;
  camRef: MutableRefObject<Camera>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  keys: MutableRefObject<Record<string, boolean>>;
  edgePanHover: MutableRefObject<{ dir: PanDir; startedAt: number } | null>;
  panHold: MutableRefObject<PanDir | null>;
  panAvailRef: MutableRefObject<PanAvailability>;
  setPanAvail: (v: PanAvailability) => void;
  applyEdgePan: (dir: PanDir | null) => void;
  fxRef: MutableRefObject<FxBurst[]>;
  fxSeq: MutableRefObject<number>;
  screenShakeRef?: MutableRefObject<import("@/lib/render/screenShake").ScreenShakeState>;
  terminalSaveRef: MutableRefObject<boolean>;
  campaignRecordedRef: MutableRefObject<boolean>;
  redraw: (nowMs?: number, subTickAlpha?: number) => void;
  onAlert: (text: string, kind?: "warning" | "objective" | "contact" | "system") => void;
  onCommandNotice?: (text: string, kind?: "success" | "info" | "warning" | "error") => void;
  saveSession: SaveSession;
  persistCampaign?: boolean;
  uxRef?: { current: import("@/lib/persist/telemetry").MissionUxTelemetry };
  suppressImplicitSavesRef?: MutableRefObject<() => void>;
}) {
  const fallbackUxRef = useRef(createFallbackUxTelemetry());
  const uxRef = suppliedUxRef ?? fallbackUxRef;
  const lifecycleRef = useRef<RuntimeLifecycleState>({
    sessionState: null,
    terminalPresented: false,
    commandApplied: false,
    counters: { commandsIssued: 0, commandRejections: 0, assaultTransitions: 0, ux: createFallbackUxTelemetry() },
  });
  const persistenceRef = useRef<RuntimePersistenceState>({
    saveRetry: { state: null, retry: false, nextAttemptMs: 0, lastStatus: "saved" },
    nextCampaignSaveAttemptMs: 0,
  });

  useEffect(() => {
    const refs: RuntimeRefs = {
      stateRef,
      commandQueue: cmdQ,
      pausedRef,
      cameraRef: camRef,
      canvasRef,
      keys,
      edgePanHover,
      panHold,
      panAvailabilityRef: panAvailRef,
      fxRef,
      fxSequence: fxSeq,
      screenShakeRef,
      terminalSaveRef,
      campaignRecordedRef,
      lifecycleRef,
      persistenceRef,
      uxRef,
      suppressImplicitSavesRef,
    };
    const ports: RuntimePorts = {
      setState,
      setPanAvailability: setPanAvail,
      applyEdgePan,
      redraw,
      onAlert,
      onCommandNotice: onCommandNotice ?? (() => undefined),
      saveSession,
      persistCampaign,
    };
    const runtime = createGameRuntimeFacade(refs, ports);
    runtime.start();
    return () => runtime.stop();
  }, [
    applyEdgePan,
    campaignRecordedRef,
    camRef,
    canvasRef,
    cmdQ,
    edgePanHover,
    fxRef,
    fxSeq,
    keys,
    onAlert,
    onCommandNotice,
    panAvailRef,
    panHold,
    pausedRef,
    redraw,
    saveSession,
    setPanAvail,
    setState,
    stateRef,
    terminalSaveRef,
    persistCampaign,
    uxRef,
    suppressImplicitSavesRef,
    screenShakeRef,
  ]);
}
