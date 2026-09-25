import { useEffect, useRef } from "react";
import { gameCommandFromKey, isEditableTarget } from "@/lib/ui/shortcuts";
import { applyGameCommand, type GameKeyboardParams } from "./gameKeyboard";

export function useGameKeyboard({
  stateRef,
  pausedRef,
  pauseViewRef,
  activeTabRef,
  place,
  repair,
  sell,
  openPauseMenu,
  resumeMission,
  setPauseView,
  setPauseNotice,
  setActiveTab,
  activateCameo,
  assignControlGroup,
  recallControlGroup,
  jumpHome,
  centerSelection,
  toggleRepair,
  toggleSell,
  stopSelected,
  clearTools,
  saveMission,
  loadMission,
  viewMissionBriefing,
  restartMission,
  toggleSound,
  toggleMusic,
  toggleVoice,
  resultPrimary,
  onNavigateHome,
  confirmationOpen = false,
  cancelConfirmation = () => {},
  mobilePanelOpen = false,
  closeMobilePanel = () => {},
  mobileToolActive = false,
  keyBindings,
}: GameKeyboardParams) {
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const clearKeys = () => {
      for (const k of Object.keys(keys.current)) {
        keys.current[k] = false;
      }
    };
    if (confirmationOpen) clearKeys();

    const down = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (confirmationOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelConfirmation();
        }
        return;
      }
      if (e.key === "Escape" && mobilePanelOpen && !pausedRef.current && stateRef.current.result === "playing") {
        e.preventDefault();
        closeMobilePanel();
        return;
      }
      if (!pausedRef.current && stateRef.current.result === "playing") {
        keys.current[e.key] = true;
      }
      const isPanKey = (k: string) => {
        const panKeys = [
          keyBindings?.panUp || "w",
          keyBindings?.panDown || "s",
          keyBindings?.panLeft || "a",
          keyBindings?.panRight || "d",
        ].map((s) => s.toLowerCase());
        return panKeys.includes(k.toLowerCase()) || k.startsWith("Arrow");
      };
      if (
        !isEditableTarget(e.target) &&
        !pausedRef.current &&
        stateRef.current.result === "playing" &&
        isPanKey(e.key)
      ) {
        e.preventDefault();
      }
      const command = gameCommandFromKey(
        e,
        {
          typing: isEditableTarget(e.target),
          playing: !pausedRef.current && stateRef.current.result === "playing",
          paused: pausedRef.current,
          pauseView: pauseViewRef.current,
          result: stateRef.current.result,
          toolActive: !!(place.current || repair.current || sell.current || mobileToolActive),
        },
        keyBindings,
      );
      if (!command) return;
      e.preventDefault();
      if (command.type === "pause") {
        clearKeys();
      }
      applyGameCommand(command, {
        activeTab: activeTabRef.current,
        openPauseMenu,
        resumeMission,
        setPauseView,
        setPauseNotice,
        setActiveTab,
        activateCameo,
        assignControlGroup,
        recallControlGroup,
        jumpHome,
        centerSelection,
        toggleRepair,
        toggleSell,
        stopSelected,
        clearTools,
        saveMission,
        loadMission,
        viewMissionBriefing,
        restartMission,
        toggleSound,
        toggleMusic,
        toggleVoice,
        resultPrimary,
        onNavigateHome,
      });
    };

    const up = (e: KeyboardEvent) => {
      keys.current[e.key] = false;
    };

    const blur = () => {
      for (const k of Object.keys(keys.current)) {
        keys.current[k] = false;
      }
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [
    activateCameo,
    assignControlGroup,
    activeTabRef,
    cancelConfirmation,
    closeMobilePanel,
    centerSelection,
    confirmationOpen,
    clearTools,
    jumpHome,
    loadMission,
    onNavigateHome,
    openPauseMenu,
    pauseViewRef,
    pausedRef,
    place,
    repair,
    restartMission,
    recallControlGroup,
    resultPrimary,
    resumeMission,
    saveMission,
    sell,
    setActiveTab,
    setPauseNotice,
    setPauseView,
    stateRef,
    stopSelected,
    toggleRepair,
    toggleSell,
    toggleSound,
    toggleMusic,
    toggleVoice,
    viewMissionBriefing,
    mobilePanelOpen,
    mobileToolActive,
    keyBindings,
  ]);

  return { keys };
}
