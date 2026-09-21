import { powerBreakdown } from "@/lib/sim/world";
import { gameOverlayModel, powerSignature } from "../../gameOverlayModel";
import { minimapPingFor } from "@/lib/ui/missionPresentation";
import type { GameRuntime, OverlaySurfaceModel, PlayFieldSurfaceModel } from "./types";

export type GameRuntimeSurfaces = {
  playField: PlayFieldSurfaceModel;
  overlays: OverlaySurfaceModel;
};

export type GameRuntimeSurfaceCache = {
  powerSig: string | null;
  power: ReturnType<typeof powerBreakdown> | null;
};

export function createGameRuntimeSurfaceCache(): GameRuntimeSurfaceCache {
  return { powerSig: null, power: null };
}

/** The single adapter between runtime orchestration and screen view models. */
export function createGameRuntimeSurfaces(runtime: GameRuntime, cache: GameRuntimeSurfaceCache): GameRuntimeSurfaces {
  const { palette, selected } = gameOverlayModel({ state: runtime.state, selectedIds: runtime.selectedIds });
  const powerSig = powerSignature(runtime.state);
  const grid = cache.powerSig === powerSig && cache.power
    ? cache.power
    : powerBreakdown(runtime.state, 0);
  cache.powerSig = powerSig;
  cache.power = grid;
  const minimapPing = runtime.combatAlert
    ? runtime.combatAlertKind === "warning"
      ? minimapPingFor(runtime.state, "urgent")
      : runtime.combatAlertKind === "objective"
        ? minimapPingFor(runtime.state, "objective")
        : undefined
    : undefined;
  const pointer = {
    onPointerDown: runtime.onPointerDown,
    onPointerMove: runtime.onPointerMove,
    onPointerEnter: runtime.onPointerEnter,
    onPointerLeave: runtime.onPointerLeave,
    onPointerUp: runtime.onPointerUp,
    onPointerCancel: runtime.onPointerCancel,
  };

  const playField: PlayFieldSurfaceModel = {
    hostRef: runtime.hostRef,
    canvasRef: runtime.canvasRef,
    panAvail: runtime.panAvail,
    hotPan: runtime.hotPan,
    campaign: runtime.campaign,
    state: runtime.state,
    tutorial: runtime.tutorial,
    paused: runtime.paused,
    pointer,
    resultActions: {
      onExitTutorial: runtime.onExitTutorial,
      onBackTutorial: runtime.onBackTutorial,
      onNextBriefing: runtime.onNextBriefing,
      onCampaignVictory: runtime.onCampaignVictory,
      onRetry: runtime.onRetry,
      onMenu: runtime.onMenu,
    },
    feedback: {
      combatAlert: runtime.combatAlert,
      combatAlertKind: runtime.combatAlertKind,
      commandNotice: runtime.commandNotice,
    },
    onObjectivePanelToggle: runtime.onObjectivePanelToggle,
  };

  const overlays: OverlaySurfaceModel = {
    campaign: runtime.campaign,
    state: runtime.state,
    playerVisualProfile: runtime.playerVisualProfile,
    selectedIds: runtime.selectedIds,
    tutorial: runtime.tutorial,
    mobilePanelOpen: runtime.mobilePanelOpen,
    mobileLauncherRef: runtime.mobileLauncherRef,
    miniRef: runtime.miniRef,
    activeTab: runtime.activeTab,
    onTab: runtime.onTab,
    paused: runtime.paused,
    audioSettings: runtime.audioSettings,
    camera: runtime.camera,
    onToggleMobilePanel: runtime.onToggleMobilePanel,
    onMobileSheetDrag: runtime.onMobileSheetDrag,
    sidebar: {
      factionName: runtime.campaign.factions[0].name,
      state: runtime.state,
      palette,
      profile: runtime.playerVisualProfile,
      selected,
      activeTab: runtime.activeTab,
      power: grid.surplus,
      produced: grid.produced,
      used: grid.used,
      miniRef: runtime.miniRef,
      camera: runtime.camera,
      onPause: () => runtime.onPause(),
      onToggleMobilePanel: runtime.onToggleMobilePanel,
      onTab: runtime.onTab,
      commands: {
        placeKind: runtime.actions.placeKind,
        repairMode: runtime.actions.repairMode,
        sellMode: runtime.actions.sellMode,
        onPlace: runtime.actions.togglePlace,
        onRepair: runtime.actions.toggleRepair,
        onSell: runtime.actions.toggleSell,
        onCancelBuilding: runtime.actions.cancelBuilding,
        onQueueUnit: runtime.actions.queueUnit,
        onCancelUnit: runtime.actions.cancelUnit,
        availableProducer: runtime.actions.availableProducer,
        onStop: () => runtime.actions.issueSelectedCommand("stop"),
        onStance: (stance) => runtime.actions.issueSelectedCommand("stance", stance),
        onFormation: (formation) => runtime.actions.issueSelectedCommand("formation", formation),
      },
      mobilePanelOpen: runtime.mobilePanelOpen,
      selectionCount: runtime.selectedIds.length,
      minimapPing,
    },
    pause: runtime.paused
      ? {
          view: runtime.pauseView,
          notice: runtime.pauseNotice,
          settings: runtime.audioSettings,
          tutorial: runtime.tutorial,
          setView: runtime.setPauseView,
          setNotice: runtime.setPauseNotice,
          onControlsOpened: runtime.onControlsOpened,
          session: {
            saveSlots: runtime.session.listSaveSlots(),
            loadEntries: runtime.session.listLoadEntries(),
            defaultSlotName: runtime.session.defaultSlotName(),
            telemetryEnabled: runtime.session.telemetryEnabled,
            telemetryRecordCount: runtime.session.telemetryRecordCount,
            onResume: runtime.session.resumeMission,
            onSave: runtime.session.saveMission,
            onLoad: runtime.session.loadMission,
            onCommitSave: runtime.session.saveNamedSlot,
            onLoadEntry: runtime.session.loadArchiveEntry,
            onDeleteEntry: runtime.session.deleteArchiveEntry,
            onBriefing: runtime.session.viewMissionBriefing,
            onRestart: runtime.session.restartMission,
            onMenu: runtime.session.goMenu,
            onLeaveWithoutSave: runtime.session.canLeaveWithoutSave ? runtime.session.leaveWithoutSave : undefined,
            onToggleSound: runtime.session.toggleSound,
            onToggleMusic: runtime.session.toggleMusic,
            onToggleReducedMotion: runtime.session.toggleReducedMotion,
            onToggleHighContrast: runtime.session.toggleHighContrast,
            onCycleColorblind: runtime.session.cycleColorblind,
            onCycleHudScale: runtime.session.cycleHudScale,
            onUpdateKeyBindings: runtime.session.updateKeyBindings,
            onVolumeChange: runtime.session.updateVolume,
            onExportTelemetry: runtime.session.telemetryEnabled ? runtime.session.exportTelemetry : undefined,
            onClearTelemetry: runtime.session.telemetryEnabled ? runtime.session.clearTelemetry : undefined,
          },
        }
      : null,
    confirmation: runtime.session.confirmation
      ? { value: runtime.session.confirmation, onConfirm: runtime.session.confirmAction, onCancel: runtime.session.cancelConfirmation }
      : null,
  };

  return { playField, overlays };
}
