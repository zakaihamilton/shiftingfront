"use client";

import { useCallback, useEffect, useRef } from "react";
import { tutorialFocusPoint, tutorialTargets } from "@/lib/sim/tutorial";
import type { SimState } from "@/lib/types";
import type { GameSettings } from "@/lib/persist/settings";
import type { RuntimeCommandPort } from "./runtime/facade";
import { useGameActions } from "./useGameActions";
import { useGameCamera } from "./useGameCamera";
import { useGameInput } from "./useGameInput";
import { useGameRenderer } from "./useGameRenderer";
import { useGameSelection } from "./useGameSelection";
import type { GameRuntimeFeedback } from "./useGameRuntimeFeedback";

const TUTORIAL_CAMERA_FOCUS_MS = 900;

export function useGameRuntimeInteraction({
  state,
  tutorial,
  stateRef,
  setState,
  hostRef,
  canvasRef,
  miniRef,
  mobileMiniRef,
  audioSettings,
  pausedRef,
  mobilePanelOpen,
  setMobilePanelOpen,
  setActiveTab,
  commandPort,
  feedback,
}: {
  state: SimState;
  tutorial: boolean;
  stateRef: React.MutableRefObject<SimState>;
  setState: (state: SimState) => void;
  hostRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  miniRef: React.RefObject<HTMLCanvasElement | null>;
  mobileMiniRef: React.RefObject<HTMLCanvasElement | null>;
  audioSettings: Pick<GameSettings, "reducedMotion" | "colorblindMode">;
  pausedRef: React.MutableRefObject<boolean>;
  mobilePanelOpen: boolean;
  setMobilePanelOpen: (open: boolean) => void;
  setActiveTab: (tab: "construction" | "production" | "selected") => void;
  commandPort: RuntimeCommandPort;
  feedback: GameRuntimeFeedback;
}) {
  const { uxRef, announceCommandFeedback, recordCommandRejection, recordMobilePanelOpened } = feedback;
  const onSelectionTab = useCallback(() => setActiveTab("selected"), [setActiveTab]);
  const selection = useGameSelection({ stateRef, setState, uxRef, onSelectionTab });
  const { selected, selectedIds, selectionMode, selectionModeRef, commitSelection, assignControlGroup, recallControlGroup, setSelectionMode } = selection;

  const assignGroup = useCallback((slot: Parameters<typeof assignControlGroup>[0]) => {
    const count = assignControlGroup(slot);
    announceCommandFeedback(count > 0 ? `Control group ${slot} assigned to ${count} unit${count === 1 ? "" : "s"}.` : `Control group ${slot} cleared.`, "success");
  }, [announceCommandFeedback, assignControlGroup]);
  const recallGroup = useCallback((slot: Parameters<typeof recallControlGroup>[0]) => {
    const count = recallControlGroup(slot);
    announceCommandFeedback(count > 0 ? `Control group ${slot} selected.` : `Control group ${slot} is empty.`, count > 0 ? "success" : "info");
  }, [announceCommandFeedback, recallControlGroup]);

  const camera = useGameCamera({ stateRef, canvasRef, hostRef });
  const { camRef, panAvail, panAvailRef, hotPan, panHold, edgePanHover, applyEdgePan, focusTileAnimated, resetCamera } = camera;

  const tutorialFocusStageRef = useRef<typeof state.tutorialStage>(undefined);
  useEffect(() => {
    const stage = state.tutorialStage;
    if (!tutorial || !stage || tutorialFocusStageRef.current === stage || !canvasRef.current) return;
    if (stage === "move") { tutorialFocusStageRef.current = stage; return; }
    const targets = tutorialTargets(state);
    const target = targets[0];
    const point = tutorialFocusPoint(state);
    if (!point) return;
    focusTileAnimated(Math.round(point.x), Math.round(point.y), state.tutorialStage === "attack" && targets.length > 1 ? 0.32 : target?.kind === "entity" ? 0.44 : 0.56, audioSettings.reducedMotion ? 0 : TUTORIAL_CAMERA_FOCUS_MS);
    tutorialFocusStageRef.current = stage;
  }, [audioSettings.reducedMotion, canvasRef, focusTileAnimated, state, tutorial]);

  const actions = useGameActions({ stateRef, commandPort, selected, selectedIds, onCommandNotice: announceCommandFeedback, onCommandRejection: recordCommandRejection, uxRef });
  const { place, placeKind, setPlaceKind, repair, repairMode, setRepairMode, sell, sellMode, setSellMode, mobileCommand, setMobileCommandState, resetMobileCommand, cancelMobileCommand, clearTools, issueSelectedCommand, toggleRepair, toggleSell, activateCameo } = actions;
  const mobileLauncherRef = useRef<HTMLButtonElement>(null);

  const input = useGameInput({
    stateRef, camRef, selectedRef: selected, selectedIds, commitSelection, commandPort,
    placeRef: place, placeKind, setPlaceKind, repairRef: repair, repairMode, setRepairMode,
    sellRef: sell, sellMode, setSellMode, clearTools, mobileCommandRef: mobileCommand,
    setMobileCommandState, pausedRef, panAvailRef, applyEdgePan, selectionModeRef, setSelectionMode,
    onCommandNotice: announceCommandFeedback, onCommandRejection: recordCommandRejection, uxRef,
  });
  const { hoverRef, cursorRef, boxRef, commandMarkerRef, resetInput, onDown, onEnter, onMove, onLeave, onUp, onCancel } = input;

  const renderer = useGameRenderer({
    stateRef, hostRef, canvasRef, miniRef, mobileMiniRef, camRef, selected, hoverRef, cursorRef, boxRef, commandMarkerRef,
    place, repair, sell, reducedMotionOverride: audioSettings.reducedMotion, colorblindMode: audioSettings.colorblindMode,
  });

  const resetTransientMobileUi = useCallback(() => {
    resetMobileCommand();
    clearTools();
    resetInput();
    setSelectionMode(false);
    setMobilePanelOpen(false);
  }, [clearTools, resetInput, resetMobileCommand, setMobilePanelOpen, setSelectionMode]);

  const closeMobilePanel = useCallback(() => { setMobilePanelOpen(false); mobileLauncherRef.current?.focus(); }, [setMobilePanelOpen]);
  const openMobilePanel = useCallback(() => { setSelectionMode(false); setMobilePanelOpen(true); recordMobilePanelOpened(); }, [recordMobilePanelOpened, setMobilePanelOpen, setSelectionMode]);
  const toggleMobilePanel = useCallback(() => { if (mobilePanelOpen) closeMobilePanel(); else openMobilePanel(); }, [closeMobilePanel, mobilePanelOpen, openMobilePanel]);
  const onMobileSheetDrag = useCallback((direction: "open" | "close") => { if (direction === "open" && !mobilePanelOpen) openMobilePanel(); if (direction === "close" && mobilePanelOpen) closeMobilePanel(); }, [closeMobilePanel, mobilePanelOpen, openMobilePanel]);
  const cancelKeyboardTool = useCallback(() => { cancelMobileCommand(); resetInput(); setSelectionMode(false); }, [cancelMobileCommand, resetInput, setSelectionMode]);

  return {
    selection,
    selected,
    selectedIds,
    selectionMode,
    selectionModeRef,
    assignGroup,
    recallGroup,
    setSelectionMode,
    camera,
    actions,
    place,
    repair,
    sell,
    mobileCommand,
    resetMobileCommand,
    cancelMobileCommand,
    clearTools,
    issueSelectedCommand,
    toggleRepair,
    toggleSell,
    activateCameo,
    mobileLauncherRef,
    resetInput,
    resetCamera,
    renderer,
    keysInput: { onDown, onEnter, onMove, onLeave, onUp, onCancel },
    resetTransientMobileUi,
    closeMobilePanel,
    toggleMobilePanel,
    onMobileSheetDrag,
    cancelKeyboardTool,
    panAvail,
    hotPan,
    camRef,
    panAvailRef,
    panHold,
    edgePanHover,
  };
}

export type GameRuntimeInteraction = ReturnType<typeof useGameRuntimeInteraction>;
