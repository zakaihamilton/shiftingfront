import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { clearMusicPosition } from "@/lib/audio/music";
import { useAudioPreferences } from "@/components/audio/useAudioPreferences";
import { campaignKey, readCampaignProgress, writeCampaignProgress } from "@/lib/persist/campaign";
import { createMission } from "@/lib/sim/api";
import { createTutorialMission } from "@/lib/sim/tutorial";
import {
  cachedLocalStorage,
  cachedCampaignStorage,
  getSaveRepository,
  readSave,
  safeGetItem,
  readSlot,
} from "@/lib/persist/save";
import { clearTelemetry, readTelemetry, serializeTelemetry } from "@/lib/persist/telemetry";
import { campaignProficiencyBand } from "@/lib/sim/proficiency";
import { persistDeploymentEdge } from "@/lib/persist/deploymentEdge";
import { deploymentEdgeForMission } from "@/lib/sim/fieldIdentity";
import { consumeFreshLaunchIntent, consumeResultReturnSnapshot } from "@/lib/persist/navigation";
import { restoreSlot } from "@/lib/persist/save/restore";
import type { SaveSession } from "@/lib/persist/save";
import type { GameSettings } from "@/lib/persist/settings";
import type { CampaignProgress, DeploymentEdge, SimState } from "@/lib/types";
import type { PauseView } from "@/lib/ui/shortcuts";
import { useMissionConfirmation } from "./useMissionConfirmation";
import { useMissionPersistence, type MissionPersistenceParams } from "./useMissionPersistence";
import { useMissionRoutes } from "./useMissionRoutes";
import { useMissionBackGuard } from "./useMissionBackGuard";

export type { MissionConfirmation, MissionConfirmationAction } from "./missionConfirmation";

function isBrowserReload(): boolean {
  if (typeof window === "undefined") return false;

  const navigation = window.performance?.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (navigation) return navigation.type === "reload";

  // Keep compatibility with browsers that only expose the legacy navigation API.
  const legacyNavigation = (window.performance as Performance & { navigation?: { type?: number } }).navigation;
  return legacyNavigation?.type === 1;
}

type FreshLaunch = {
  fresh: true;
  progress: CampaignProgress;
  rules: 1 | 2;
  proficiencyBand: ReturnType<typeof campaignProficiencyBand> | undefined;
  deploymentEdge: DeploymentEdge | undefined;
};

function planInitialMission(
  seed: number,
  mission: number,
  resume: boolean,
  tutorial: boolean,
  fresh = false,
  slotId?: string | null,
): SimState | FreshLaunch {
  if (tutorial) return createTutorialMission();
  if (slotId && typeof window !== "undefined" && getSaveRepository()?.mode !== "indexeddb") {
    const isReload = isBrowserReload();
    const saved = readSave(cachedCampaignStorage(), seed);
    if (isReload && saved && (resume || saved.missionIndex === mission)) {
      return saved;
    }
    const slot = readSlot(cachedCampaignStorage(), slotId);
    if (slot && slot.state.seed === seed) {
      const error = restoreSlot(cachedLocalStorage(), slot);
      if (error) throw new Error(error);
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("slot")) {
          url.searchParams.delete("slot");
          url.searchParams.set("resume", "1");
          window.history.replaceState(null, "", url.toString());
        }
      } catch {
        // Ignore URL replace errors in unsupported environments
      }
      return slot.state;
    }
  }
  const freshLaunchIntent = consumeFreshLaunchIntent(seed, mission);
  const startFresh = fresh && (freshLaunchIntent || !isBrowserReload());
  if (startFresh) {
    clearMusicPosition("mission", seed, mission);
  }
  if (!startFresh && typeof window !== "undefined") {
    if (resume) {
      const resultState = consumeResultReturnSnapshot(seed, mission);
      if (resultState) return resultState;
    }
    const saved = readSave(cachedCampaignStorage(), seed);
    if (saved && (resume || saved.missionIndex === mission)) return saved;
  }
  const progress = readCampaignProgress(cachedCampaignStorage(), seed);
  if (safeGetItem(cachedCampaignStorage(), campaignKey(seed)) === null) {
    const previous = readSave(cachedCampaignStorage(), seed);
    if (previous) progress.gameplayRulesVersion = previous.gameplayRulesVersion ?? 1;
  }
  const rules = progress.gameplayRulesVersion ?? 2;
  const proficiencyBand = typeof window === "undefined" ? undefined : campaignProficiencyBand(readTelemetry(cachedLocalStorage()));
  const deploymentEdge = typeof window === "undefined" ? undefined : deploymentEdgeForMission(progress, mission);
  if (deploymentEdge) delete progress.deploymentEdge;
  return { fresh: true, progress, rules, proficiencyBand, deploymentEdge };
}

function isFreshLaunch(value: SimState | FreshLaunch): value is FreshLaunch {
  return "fresh" in value && value.fresh === true;
}

function missionFromFreshLaunch(seed: number, mission: number, launch: FreshLaunch): SimState {
  return createMission({
    seed,
    missionIndex: mission,
    gameplayRulesVersion: launch.rules,
    proficiencyBand: launch.proficiencyBand,
    deploymentEdge: launch.deploymentEdge,
  });
}

/**
 * IndexedDB owns the campaign record. Rewriting the legacy envelope changes
 * savedAt, and the next open treats that as a new import: it bumps the
 * autosave revision and can file the crash journal as an interrupted save.
 * A failed reward clear still leaves a newer legacy envelope so the next open
 * can drop the reward without touching that revision.
 */
function persistFreshLaunch(seed: number, launch: FreshLaunch): Promise<void> | void {
  if (typeof window === "undefined") return;
  const repository = getSaveRepository();
  if (repository?.mode === "indexeddb") {
    if (!launch.deploymentEdge) return;
    return repository.setDeploymentEdge(seed, undefined).then((cleared) => {
      if (!cleared) writeCampaignProgress(cachedLocalStorage(), launch.progress);
    });
  }
  writeCampaignProgress(cachedLocalStorage(), launch.progress);
  if (launch.deploymentEdge) persistDeploymentEdge(seed, undefined);
}

export function initialMission(
  seed: number,
  mission: number,
  resume: boolean,
  tutorial: boolean,
  fresh = false,
  slotId?: string | null,
): SimState {
  const launch = planInitialMission(seed, mission, resume, tutorial, fresh, slotId);
  if (!isFreshLaunch(launch)) return launch;
  const pending = persistFreshLaunch(seed, launch);
  if (pending) void pending.catch(() => undefined);
  return missionFromFreshLaunch(seed, mission, launch);
}

export async function prepareInitialMission({ seed, mission, resume, fresh = false, slot }: {
  seed: number; mission: number; resume: boolean; fresh?: boolean; slot?: string;
}): Promise<SimState> {
  const repository = getSaveRepository();
  if (slot && repository) {
    const saved = readSave(cachedCampaignStorage(), seed);
    if (isBrowserReload() && saved && (resume || saved.missionIndex === mission)) return saved;
    const named = readSlot(cachedCampaignStorage(), slot);
    if (named && named.state.seed === seed) {
      const error = await repository.restoreSlot(named);
      if (error) throw new Error(error);
      const url = new URL(window.location.href);
      url.searchParams.delete("slot"); url.searchParams.set("resume", "1");
      window.history.replaceState(window.history.state, "", url.toString());
      return named.state;
    }
  }
  if (resume) {
    const resultState = consumeResultReturnSnapshot(seed, mission);
    if (resultState) return resultState;
  }
  if (repository?.mode === "indexeddb") {
    const launch = planInitialMission(seed, mission, resume, false, fresh);
    if (!isFreshLaunch(launch)) return launch;
    await persistFreshLaunch(seed, launch);
    return missionFromFreshLaunch(seed, mission, launch);
  }
  return initialMission(seed, mission, resume, false, fresh);
}

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
  const { toggleSound, toggleMusic, toggleVoice, toggleReducedMotion, toggleHighContrast, cycleColorblind, cycleHudScale, updateKeyBindings, updateVolume } = useAudioPreferences(settings, setSettings);
  const [, setTelemetryRevision] = useState(0);
  const telemetryRecordCount = tutorial ? 0 : readTelemetry(cachedLocalStorage()).length;
  const [canLeaveWithoutSave, setCanLeaveWithoutSave] = useState(false);
  const leaveWithoutSaveRef = useRef<(() => void) | null>(null);
  const onSaveError = useCallback((message: string, fallback: () => void) => {
    leaveWithoutSaveRef.current = fallback;
    setCanLeaveWithoutSave(true);
    pausedRef.current = true;
    setPaused(true);
    setPauseView("main");
    setPauseNotice(message);
  }, [pausedRef, setPaused, setPauseView, setPauseNotice]);
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
      if (saved instanceof Promise) void saved.then((ok) => { if (ok) leaveBackRef.current(); });
      else if (saved) leaveBackRef.current();
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
  const { goHome: requestConfirmationLeave, cancelConfirmation: cancelConfirmationState } = confirmation;
  const requestBrowserLeave = useCallback(() => {
    onBrowserBackLeave?.();
    browserBackRef.current = true;
    browserBackPausedRef.current = !pausedRef.current;
    pausedRef.current = true;
    setPaused(true);
    requestConfirmationLeave();
  }, [onBrowserBackLeave, pausedRef, requestConfirmationLeave, setPaused]);
  const backGuard = useMissionBackGuard({ enabled: browserBackGuardEnabled, onRequestLeave: requestBrowserLeave });

  useEffect(() => {
    leaveBackRef.current = backGuard.leave;
    return () => {
      leaveBackRef.current = () => undefined;
    };
  }, [backGuard.leave]);

  const openPauseMenu = useCallback((view: PauseView = "main") => {
    pausedRef.current = true;
    setPaused(true);
    setPauseView(view);
    setPauseNotice("");
  }, [pausedRef, setPaused, setPauseNotice, setPauseView]);

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

  const saveNamedSlot = useCallback((name: string, overwriteId: string | null) => {
    const saved = persistNamedSlot(name, overwriteId);
    if (saved instanceof Promise) void saved.then((ok) => { if (ok) clearLeaveFallback(); });
    else if (saved) clearLeaveFallback();
    return saved;
  }, [clearLeaveFallback, persistNamedSlot]);

  const exportTelemetry = useCallback(() => {
    if (tutorial || typeof window === "undefined") return false;
    try {
      const blob = new Blob([serializeTelemetry(cachedLocalStorage())], { type: "application/json" });
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
