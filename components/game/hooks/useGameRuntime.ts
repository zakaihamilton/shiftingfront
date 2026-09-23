"use client";

import { useMemo, useRef } from "react";
import { createRuntimeCommandPort } from "./runtime/facade";
import type { GameRuntime } from "./runtime/types";
import { useGameChrome } from "./useGameChrome";
import { useGameRuntimeFeedback } from "./useGameRuntimeFeedback";
import { useGameRuntimeInteraction } from "./useGameRuntimeInteraction";
import { useGameRuntimeLifecycle } from "./useGameRuntimeLifecycle";
import { useGameRuntimeState } from "./useGameRuntimeState";

/** Composition facade for the mission runtime. Rendering and simulation details live in focused hooks. */
export function useGameRuntime({ seed, mission, resume, fresh = false, slot, tutorial = false }: { seed: number; mission: number; resume: boolean; fresh?: boolean; slot?: string; tutorial?: boolean }): GameRuntime {
  const durable = useGameRuntimeState({ seed, mission, resume, fresh, slot, tutorial });
  const chrome = useGameChrome(durable.state.result);
  const commandPort = useMemo(() => createRuntimeCommandPort(chrome.cmdQ), [chrome.cmdQ]);
  const suppressImplicitSavesRef = useRef<() => void>(() => undefined);

  const feedback = useGameRuntimeFeedback({
    seed,
    mission,
    tutorial,
    showCommandNotice: chrome.announceCommand,
  });
  const interaction = useGameRuntimeInteraction({
    state: durable.state,
    tutorial,
    stateRef: durable.stateRef,
    setState: durable.setState,
    hostRef: durable.hostRef,
    canvasRef: durable.canvasRef,
    tooltipCanvasRef: durable.tooltipCanvasRef,
    miniRef: durable.miniRef,
    mobileMiniRef: durable.mobileMiniRef,
    audioSettings: chrome.audioSettings,
    pausedRef: chrome.pausedRef,
    mobilePanelOpen: chrome.mobilePanelOpen,
    setMobilePanelOpen: chrome.setMobilePanelOpen,
    setActiveTab: chrome.setActiveTab,
    commandPort,
    feedback,
  });
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
    canvasRef: durable.canvasRef,
  });

  return {
    campaign: durable.campaign,
    playerVisualProfile: durable.playerVisualProfile,
    palette: durable.state.factions[0].palette,
    state: durable.state,
    tutorial,
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
