import type { GameOverlayProps } from "../../GameOverlays";
import type { GamePlayFieldProps } from "../../GamePlayField";
import type { GameRuntime } from "../useGameRuntime";

export type GameRuntimeSurfaces = {
  playField: GamePlayFieldProps;
  overlays: GameOverlayProps;
};

/**
 * Adapts the gameplay runtime contract to the two screen surfaces.
 *
 * Keeping this mapping pure means a screen can be rearranged, replaced, or
 * tested without changing the simulation loop, command queue, or persistence
 * lifecycle owned by useGameRuntime.
 */
export function createGameRuntimeSurfaces(runtime: GameRuntime): GameRuntimeSurfaces {
  return {
    playField: {
      hostRef: runtime.hostRef,
      canvasRef: runtime.canvasRef,
      panAvail: runtime.panAvail,
      hotPan: runtime.hotPan,
      campaign: runtime.campaign,
      state: runtime.state,
      tutorial: runtime.tutorial,
      paused: runtime.paused,
      onPointerDown: runtime.onPointerDown,
      onPointerMove: runtime.onPointerMove,
      onPointerEnter: runtime.onPointerEnter,
      onPointerLeave: runtime.onPointerLeave,
      onPointerUp: runtime.onPointerUp,
      onPointerCancel: runtime.onPointerCancel,
      onExitTutorial: runtime.onExitTutorial,
      onBackTutorial: runtime.onBackTutorial,
      onNextBriefing: runtime.onNextBriefing,
      onCampaignVictory: runtime.onCampaignVictory,
      onRetry: runtime.onRetry,
      onMenu: runtime.onMenu,
      combatAlert: runtime.combatAlert,
      combatAlertKind: runtime.combatAlertKind,
      commandNotice: runtime.commandNotice,
      onObjectivePanelToggle: runtime.onObjectivePanelToggle,
    },
    overlays: {
      campaign: runtime.campaign,
      state: runtime.state,
      playerVisualProfile: runtime.playerVisualProfile,
      selectedIds: runtime.selectedIds,
      tutorial: runtime.tutorial,
      selectionMode: runtime.selectionMode,
      mobilePanelOpen: runtime.mobilePanelOpen,
      mobileLauncherRef: runtime.mobileLauncherRef,
      miniRef: runtime.miniRef,
      activeTab: runtime.activeTab,
      onTab: runtime.onTab,
      paused: runtime.paused,
      pauseView: runtime.pauseView,
      pauseNotice: runtime.pauseNotice,
      audioSettings: runtime.audioSettings,
      camera: runtime.camera,
      setPauseView: runtime.setPauseView,
      setPauseNotice: runtime.setPauseNotice,
      onSelectionMode: runtime.setSelectionMode,
      onToggleMobilePanel: runtime.onToggleMobilePanel,
      onMobileSheetDrag: runtime.onMobileSheetDrag,
      onPause: runtime.onPause,
      onControlsOpened: runtime.onControlsOpened,
      combatAlert: runtime.combatAlert,
      combatAlertKind: runtime.combatAlertKind,
      actions: runtime.actions,
      session: runtime.session,
    },
  };
}
