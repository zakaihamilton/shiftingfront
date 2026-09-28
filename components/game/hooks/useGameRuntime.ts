"use client";

import { useEffect, useMemo, useRef } from "react";
import { createRuntimeCommandPort } from "./runtime/facade";
import type { GameRuntime } from "./runtime/types";
import { useGameChrome } from "./useGameChrome";
import { useGameRuntimeFeedback } from "./useGameRuntimeFeedback";
import { useGameRuntimeInteraction } from "./useGameRuntimeInteraction";
import { useGameRuntimeLifecycle } from "./useGameRuntimeLifecycle";
import { useGameRuntimeState } from "./useGameRuntimeState";
import type { MultiplayerSession } from "@/lib/multiplayer/session";
import { useMissionIntro } from "./useMissionIntro";

/** Composition facade for the mission runtime. Rendering and simulation details live in focused hooks. */
export function useGameRuntime({ seed, mission, resume, fresh = false, slot, tutorial = false, multiplayerSession }: { seed: number; mission: number; resume: boolean; fresh?: boolean; slot?: string; tutorial?: boolean; multiplayerSession?: MultiplayerSession }): GameRuntime {
  const durable = useGameRuntimeState({
    seed, mission, resume, fresh, slot, tutorial,
    multiplayerOwner: multiplayerSession?.owner,
    multiplayerOwners: multiplayerSession?.owners,
    multiplayerAiOwners: multiplayerSession?.aiOwners,
  });
  const chrome = useGameChrome(durable.state.result, durable.initialIntro && !multiplayerSession);
  const commandPort = useMemo(() => createRuntimeCommandPort(chrome.cmdQ, multiplayerSession ? (command) => multiplayerSession.submit(command) : undefined), [chrome.cmdQ, multiplayerSession]);
  const suppressImplicitSavesRef = useRef<() => void>(() => undefined);
  const jumpHomeRef = useRef<() => void>(() => undefined);
  const missionIntro = useMissionIntro({
    state: durable.state,
    initiallyActive: durable.initialIntro,
    assetsReady: durable.battlefieldReady,
    session: multiplayerSession,
    reducedMotion: chrome.audioSettings.reducedMotion,
    pausedRef: chrome.pausedRef,
    setPaused: chrome.setPaused,
    onHandoff: () => jumpHomeRef.current(),
  });

  const feedback = useGameRuntimeFeedback({
    seed,
    mission,
    tutorial,
    showCommandNotice: chrome.announceCommand,
  });
  const interaction = useGameRuntimeInteraction({
    state: durable.state,
    battlefieldReady: durable.battlefieldReady,
    tutorial,
    stateRef: durable.stateRef,
    setState: durable.setState,
    hostRef: durable.hostRef,
    canvasRef: durable.canvasRef,
    tooltipCanvasRef: durable.tooltipCanvasRef,
    miniRef: durable.miniRef,
    mobileMiniRef: durable.mobileMiniRef,
    audioSettings: chrome.audioSettings,
    missionIntroRef: missionIntro.playbackRef,
    pausedRef: chrome.pausedRef,
    mobilePanelOpen: chrome.mobilePanelOpen,
    setMobilePanelOpen: chrome.setMobilePanelOpen,
    setActiveTab: chrome.setActiveTab,
    commandPort,
    feedback,
  });
  useEffect(() => {
    jumpHomeRef.current = interaction.camera.jumpHome;
  }, [interaction.camera.jumpHome]);
  const lifecycle = useGameRuntimeLifecycle({
    seed,
    tutorial,
    state: durable.state,
    stateRef: durable.stateRef,
    setState: durable.setState,
    saveSession: durable.saveSession,
    commitSelection: interaction.selection.commitSelection,
    commandPort,
    cmdQ: chrome.cmdQ,
    multiplayerSession,
    interaction,
    feedback,
    audioSettings: chrome.audioSettings,
    setAudioSettings: chrome.setAudioSettings,
    paused: chrome.paused,
    setPaused: chrome.setPaused,
    pausedRef: chrome.pausedRef,
    pauseViewRef: chrome.pauseViewRef,
    setPauseView: chrome.setPauseView,
    setPauseNotice: chrome.setPauseNotice,
    activeTabRef: chrome.activeTabRef,
    setActiveTab: chrome.setActiveTab,
    mobilePanelOpen: chrome.mobilePanelOpen,
    terminalSaveRef: chrome.terminalSaveRef,
    campaignRecordedRef: chrome.campaignRecordedRef,
    suppressImplicitSavesRef,
    missionIntroActiveRef: missionIntro.activeRef,
    battlefieldReady: durable.battlefieldReady,
    onRestartMission: missionIntro.begin,
    canvasRef: durable.canvasRef,
  });

  return {
    campaign: durable.campaign,
    playerVisualProfile: durable.playerVisualProfile,
    palette: durable.state.factions[durable.state.viewOwner ?? 0].palette,
    state: durable.state,
    tutorial,
    battlefieldReady: durable.battlefieldReady,
    missionIntroActive: missionIntro.active,
    missionIntroWaiting: missionIntro.awaiting,
    missionIntroPhase: missionIntro.phase,
    onSkipMissionIntro: missionIntro.skip,
    paused: chrome.paused,
    hostRef: durable.hostRef,
    canvasRef: durable.canvasRef,
    tooltipCanvasRef: durable.tooltipCanvasRef,
    miniRef: durable.miniRef,
    panAvail: interaction.panAvail,
    hotPan: interaction.hotPan,
    onPointerDown: interaction.keysInput.onDown,
    onPointerMove: interaction.keysInput.onMove,
    onPointerEnter: interaction.keysInput.onEnter,
    onPointerLeave: interaction.keysInput.onLeave,
    onPointerUp: interaction.keysInput.onUp,
    onPointerCancel: interaction.keysInput.onCancel,
    onExitTutorial: lifecycle.onExitTutorial,
    onBackTutorial: lifecycle.session.backTutorial,
    onNextBriefing: lifecycle.session.goNextBriefing,
    onCampaignVictory: lifecycle.session.goCampaignVictory,
    onRetry: lifecycle.session.goRetry,
    onMenu: lifecycle.session.goMenu,
    combatAlert: feedback.combatAlert,
    combatAlertKind: feedback.combatAlertKind,
    commandNotice: chrome.commandNotice,
    selectedIds: interaction.selectedIds,
    selectionMode: interaction.selectionMode,
    setSelectionMode: interaction.setSelectionMode,
    mobilePanelOpen: chrome.mobilePanelOpen,
    mobileLauncherRef: interaction.mobileLauncherRef,
    activeTab: chrome.activeTab,
    onTab: chrome.setActiveTab,
    pauseView: chrome.pauseView,
    pauseNotice: chrome.pauseNotice,
    audioSettings: chrome.audioSettings,
    camera: interaction.camera,
    setPauseView: chrome.setPauseView,
    setPauseNotice: chrome.setPauseNotice,
    onToggleMobilePanel: interaction.toggleMobilePanel,
    onMobileSheetDrag: interaction.onMobileSheetDrag,
    onObjectivePanelToggle: feedback.onObjectivePanelToggle,
    onControlsOpened: feedback.recordControlsOpened,
    onPause: lifecycle.openPauseMenu,
    actions: interaction.actions,
    session: lifecycle.session,
  };
}
