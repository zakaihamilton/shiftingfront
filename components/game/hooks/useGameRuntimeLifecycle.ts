"use client";

import { useCallback, useEffect } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import type { SaveSession } from "@/lib/persist/save";
import type { GameSettings } from "@/lib/persist/settings";
import type { SimState } from "@/lib/types";
import type { PauseView } from "@/lib/ui/shortcuts";
import { clearRenderSessionCaches } from "@/lib/render/sessionCache";
import { useGameAudioLifecycle } from "./useGameAudioLifecycle";
import { useGameKeyboard } from "./useGameKeyboard";
import { useGameLoop } from "./useGameLoop";
import { useGameSession } from "./useGameSession";
import type { GameRuntimeFeedback } from "./useGameRuntimeFeedback";
import type { GameRuntimeInteraction } from "./useGameRuntimeInteraction";
import type { RuntimeCommandPort } from "./runtime/facade";
import { useWakeLock } from "@/lib/ui/wakeLock";

export function useGameRuntimeLifecycle({
  seed, tutorial, state, stateRef, setState, saveSession, commitSelection, commandPort, cmdQ,
  interaction, feedback, audioSettings, setAudioSettings, paused, setPaused, pausedRef, pauseViewRef,
  setPauseView, setPauseNotice, activeTabRef, setActiveTab, mobilePanelOpen,
  terminalSaveRef, campaignRecordedRef, suppressImplicitSavesRef, canvasRef,
}: {
  seed: number;
  tutorial: boolean;
  state: SimState;
  stateRef: MutableRefObject<SimState>;
  setState: Dispatch<SetStateAction<SimState>>;
  saveSession: SaveSession;
  commitSelection: (ids: number[]) => void;
  commandPort: RuntimeCommandPort;
  cmdQ: MutableRefObject<import("@/lib/types").Command[]>;
  interaction: GameRuntimeInteraction;
  feedback: GameRuntimeFeedback;
  audioSettings: GameSettings;
  setAudioSettings: Dispatch<SetStateAction<GameSettings>>;
  paused: boolean;
  setPaused: Dispatch<SetStateAction<boolean>>;
  pausedRef: MutableRefObject<boolean>;
  pauseViewRef: MutableRefObject<PauseView>;
  setPauseView: Dispatch<SetStateAction<PauseView>>;
  setPauseNotice: Dispatch<SetStateAction<string>>;
  activeTabRef: MutableRefObject<"construction" | "production" | "selected">;
  setActiveTab: Dispatch<SetStateAction<"construction" | "production" | "selected">>;
  mobilePanelOpen: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  terminalSaveRef: MutableRefObject<boolean>;
  campaignRecordedRef: MutableRefObject<boolean>;
  suppressImplicitSavesRef: MutableRefObject<() => void>;
}) {
  const session = useGameSession({
    seed, stateRef, setState, commitSelection, commandPort, cmdQRef: cmdQ,
    fxRef: interaction.renderer.fxRef, clearTools: interaction.clearTools, resetInput: interaction.resetInput,
    resetCamera: interaction.resetCamera, pausedRef, setPaused, setPauseView, setPauseNotice,
    campaignRecordedRef, terminalSaveRef, settings: audioSettings, setSettings: setAudioSettings, saveSession,
    tutorial, suppressImplicitSavesRef, browserBackGuardEnabled: !tutorial && state.result === "playing",
    onBrowserBackLeave: interaction.resetTransientMobileUi,
  });

  const resetTransientMobileUi = interaction.resetTransientMobileUi;
  const openMissionPause = session.openPauseMenu;
  const exitTutorial = session.exitTutorial;
  const recordControlsOpened = feedback.recordControlsOpened;
  const openPauseMenu = useCallback((view: PauseView = "main") => {
    if (view === "controls") recordControlsOpened();
    resetTransientMobileUi();
    openMissionPause(view);
  }, [openMissionPause, recordControlsOpened, resetTransientMobileUi]);

  const onExitTutorial = useCallback(() => {
    feedback.recordTutorialResult(state.tutorialStage === "complete");
    exitTutorial();
  }, [exitTutorial, feedback, state.tutorialStage]);

  useEffect(() => {
    const onOrientationChange = () => resetTransientMobileUi();
    window.addEventListener("orientationchange", onOrientationChange);
    return () => window.removeEventListener("orientationchange", onOrientationChange);
  }, [resetTransientMobileUi]);

  useEffect(() => {
    if (tutorial || paused || state.result !== "playing") resetTransientMobileUi();
  }, [paused, resetTransientMobileUi, state.result, tutorial]);

  useWakeLock(!paused && state.result === "playing");

  const { keys } = useGameKeyboard({
    stateRef,
    pausedRef,
    pauseViewRef,
    activeTabRef,
    place: interaction.place,
    repair: interaction.repair,
    sell: interaction.sell,
    openPauseMenu,
    resumeMission: session.resumeMission,
    setPauseView,
    setPauseNotice,
    setActiveTab,
    activateCameo: interaction.activateCameo,
    assignControlGroup: interaction.assignGroup,
    recallControlGroup: interaction.recallGroup,
    jumpHome: interaction.camera.jumpHome,
    centerSelection: () => interaction.camera.centerSelection(interaction.selected.current),
    toggleRepair: interaction.toggleRepair,
    toggleSell: interaction.toggleSell,
    stopSelected: () => interaction.issueSelectedCommand("stop"),
    clearTools: interaction.cancelKeyboardTool,
    saveMission: session.saveMission,
    loadMission: session.loadMission,
    viewMissionBriefing: session.viewMissionBriefing,
    restartMission: session.restartMission,
    toggleSound: session.toggleSound,
    toggleMusic: session.toggleMusic,
    toggleVoice: session.toggleVoice,
    resultPrimary: session.resultPrimary,
    onNavigateHome: session.goHome,
    confirmationOpen: session.confirmation !== null,
    cancelConfirmation: session.cancelConfirmation,
    mobilePanelOpen,
    closeMobilePanel: interaction.closeMobilePanel,
    mobileToolActive: interaction.selectionMode || interaction.actions.mobileCommandState !== null,
    keyBindings: audioSettings.keyBindings,
  });

  useGameLoop({
    stateRef, setState, cmdQ, pausedRef, camRef: interaction.camRef, canvasRef,
    keys, edgePanHover: interaction.edgePanHover, panHold: interaction.panHold,
    panAvailRef: interaction.panAvailRef, setPanAvail: interaction.camera.setPanAvail, applyEdgePan: interaction.camera.applyEdgePan,
    fxRef: interaction.renderer.fxRef, fxSeq: interaction.renderer.fxSeq, screenShakeRef: interaction.renderer.screenShakeRef,
    terminalSaveRef, campaignRecordedRef, saveSession, redraw: interaction.renderer.redraw,
    onAlert: feedback.onAlert, onCommandNotice: feedback.announceCommandFeedback, persistCampaign: !tutorial,
    uxRef: feedback.uxRef, suppressImplicitSavesRef, keyBindings: audioSettings.keyBindings,
  });

  useGameAudioLifecycle({ seed, missionIndex: state.missionIndex, tutorial, paused, result: state.result });
  useEffect(() => () => clearRenderSessionCaches(), []);

  return { session, openPauseMenu, onExitTutorial };
}

export type GameRuntimeLifecycle = ReturnType<typeof useGameRuntimeLifecycle>;
