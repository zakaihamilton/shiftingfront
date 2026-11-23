import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAudioPreferences } from "@/components/audio/useAudioPreferences";
import { cachedLocalStorage, type SaveSession } from "@/lib/persist/save";
import type { GameSettings } from "@/lib/persist/settings";
import { clearTelemetry, readTelemetry, serializeTelemetry } from "@/lib/persist/telemetry";
import type { PauseView } from "@/lib/ui/shortcuts";
import { useMissionBackGuard } from "./useMissionBackGuard";
import { useMissionConfirmation } from "./useMissionConfirmation";
import { type MissionPersistenceParams, useMissionPersistence } from "./useMissionPersistence";
import { useMissionRoutes } from "./useMissionRoutes";

export { initialMission, prepareInitialMission } from "./initialMission";
export type { MissionConfirmation, MissionConfirmationAction } from "./missionConfirmation";

export function useGameSession({
  seed,
  stateRef,
  setState,
  commitSelection,
  commandPort,
  cmdQRef,
  fxRef,
  clearTools,
  resetInput,
  resetCamera,
  pausedRef,
  setPaused,
  setPauseView,
  setPauseNotice,
  campaignRecordedRef,
  terminalSaveRef,
  settings,
  setSettings,
  saveSession,
  tutorial = false,
  suppressImplicitSavesRef,
  browserBackGuardEnabled = false,
  onBrowserBackLeave,
}: MissionPersistenceParams & {
  settings: GameSettings;
  setSettings: Dispatch<SetStateAction<GameSettings>>;
  saveSession: SaveSession;
  tutorial?: boolean;
  browserBackGuardEnabled?: boolean;
  onBrowserBackLeave?: () => void;
}) {
  const {
    toggleSound,
    toggleMusic,
    toggleVoice,
    toggleReducedMotion,
    toggleHighContrast,
    cycleColorblind,
    cycleHudScale,
    updateKeyBindings,
    updateVolume,
  } = useAudioPreferences(settings, setSettings);
  const [, setTelemetryRevision] = useState(0);
  const telemetryRecordCount = tutorial ? 0 : readTelemetry(cachedLocalStorage()).length;
  const [canLeaveWithoutSave, setCanLeaveWithoutSave] = useState(false);
  const leaveWithoutSaveRef = useRef<(() => void) | null>(null);
  const onSaveError = useCallback(
    (message: string, fallback: () => void) => {
      leaveWithoutSaveRef.current = fallback;
      setCanLeaveWithoutSave(true);
      pausedRef.current = true;
      setPaused(true);
      setPauseView("main");
      setPauseNotice(message);
    },
    [pausedRef, setPaused, setPauseView, setPauseNotice],
  );
  const routes = useMissionRoutes({ stateRef, saveSession, tutorial, onSaveError });
  const { goHomeNow, prepareLeave } = routes;
  const browserBackRef = useRef(false);
  const browserBackPausedRef = useRef(false);
  const leaveBackRef = useRef<() => void>(() => undefined);
  const leaveWithoutSave = useCallback(() => {
    const fallback = leaveWithoutSaveRef.current;
    leaveWithoutSaveRef.current = null;
    setCanLeaveWithoutSave(false);
    fallback?.();
  }, []);
  const clearLeaveFallback = useCallback(() => {
    leaveWithoutSaveRef.current = null;
    setCanLeaveWithoutSave(false);
  }, []);
  const confirmGoHome = useCallback(() => {
    if (browserBackRef.current) {
      browserBackRef.current = false;
      const saved = prepareLeave(() => leaveBackRef.current());
      if (saved instanceof Promise) {
        void saved.then((ok) => {
          if (ok) leaveBackRef.current();
        });
      } else if (saved) leaveBackRef.current();
      return;
    }
    goHomeNow();
  }, [goHomeNow, prepareLeave]);
  const persistence = useMissionPersistence({
    seed,
    stateRef,
    setState,
    commitSelection,
    commandPort,
    cmdQRef,
    fxRef,
    clearTools,
    resetInput,
    resetCamera,
    pausedRef,
    setPaused,
    setPauseView,
    setPauseNotice,
    campaignRecordedRef,
    terminalSaveRef,
    saveSession,
    tutorial,
    suppressImplicitSavesRef,
  });
  const persistNamedSlot = persistence.saveNamedSlot;
  const confirmation = useMissionConfirmation({
    restartNow: persistence.restartMissionNow,
    goHomeNow: confirmGoHome,
    getResult: useCallback(() => stateRef.current.result, [stateRef]),
    isMultiplayer: useCallback(() => Boolean(stateRef.current.multiplayer), [stateRef]),
  });
  const { goHome: requestConfirmationLeave, cancelConfirmation: cancelConfirmationState } =
    confirmation;
  const requestBrowserLeave = useCallback(() => {
    onBrowserBackLeave?.();
    browserBackRef.current = true;
    browserBackPausedRef.current = !pausedRef.current;
    pausedRef.current = true;
    setPaused(true);
    requestConfirmationLeave();
  }, [onBrowserBackLeave, pausedRef, requestConfirmationLeave, setPaused]);
  const backGuard = useMissionBackGuard({
    enabled: browserBackGuardEnabled,
    onRequestLeave: requestBrowserLeave,
  });

  useEffect(() => {
    leaveBackRef.current = backGuard.leave;
    return () => {
      leaveBackRef.current = () => undefined;
    };
  }, [backGuard.leave]);

  const openPauseMenu = useCallback(
    (view: PauseView = "main") => {
      pausedRef.current = true;
      setPaused(true);
      setPauseView(view);
      setPauseNotice("");
    },
    [pausedRef, setPaused, setPauseNotice, setPauseView],
  );

  const resumeMission = useCallback(() => {
    clearLeaveFallback();
    pausedRef.current = false;
    setPaused(false);
    setPauseView("main");
    setPauseNotice("");
  }, [clearLeaveFallback, pausedRef, setPaused, setPauseNotice, setPauseView]);

  const cancelConfirmation = useCallback(() => {
    browserBackRef.current = false;
    if (browserBackPausedRef.current) {
      browserBackPausedRef.current = false;
      pausedRef.current = false;
      setPaused(false);
    }
    cancelConfirmationState();
  }, [cancelConfirmationState, pausedRef, setPaused]);

  const saveNamedSlot = useCallback(
    (name: string, overwriteId: string | null) => {
      const saved = persistNamedSlot(name, overwriteId);
      if (saved instanceof Promise) {
        void saved.then((ok) => {
          if (ok) clearLeaveFallback();
        });
      } else if (saved) clearLeaveFallback();
      return saved;
    },
    [clearLeaveFallback, persistNamedSlot],
  );

  const exportTelemetry = useCallback(() => {
    if (tutorial || typeof window === "undefined") return false;
    try {
      const blob = new Blob([serializeTelemetry(cachedLocalStorage())], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `shifting-front-telemetry-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      return true;
    } catch {
      return false;
    }
  }, [tutorial]);

  const clearMissionTelemetry = useCallback(() => {
    if (tutorial) return false;
    const cleared = clearTelemetry(cachedLocalStorage());
    if (cleared) setTelemetryRevision((revision) => revision + 1);
    return cleared;
  }, [tutorial]);

  return {
    router: routes.router,
    confirmation: confirmation.confirmation,
    confirmAction: confirmation.confirmAction,
    cancelConfirmation,
    openPauseMenu,
    resumeMission,
    saveMission: persistence.openSaveSlots,
    loadMission: persistence.openLoadSlots,
    saveNamedSlot,
    loadArchiveEntry: persistence.loadArchiveEntry,
    deleteArchiveEntry: persistence.deleteArchiveEntry,
    defaultSlotName: persistence.defaultSlotName,
    listSaveSlots: persistence.listSaveSlots,
    listLoadEntries: persistence.listLoadEntries,
    viewMissionBriefing: routes.viewMissionBriefing,
    restartMission: confirmation.restartMission,
    toggleSound,
    toggleMusic,
    toggleVoice,
    toggleReducedMotion,
    toggleHighContrast,
    cycleColorblind,
    cycleHudScale,
    updateKeyBindings,
    updateVolume,
    exitTutorial: routes.exitTutorial,
    backTutorial: routes.backTutorial,
    resultPrimary: routes.resultPrimary,
    goHome: confirmation.goHome,
    goMenu: confirmation.goHome,
    goNextBriefing: routes.goNextBriefing,
    goCampaignVictory: routes.goCampaignVictory,
    goCampaignMap: routes.goCampaignMap,
    goRetry: routes.goRetry,
    canLeaveWithoutSave,
    leaveWithoutSave,
    telemetryEnabled: !tutorial,
    telemetryRecordCount,
    exportTelemetry,
    clearTelemetry: clearMissionTelemetry,
  };
}

export type GameSession = ReturnType<typeof useGameSession>;
