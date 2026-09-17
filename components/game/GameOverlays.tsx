import { useMemo, type Ref } from "react";
import { powerBreakdown } from "@/lib/sim/world";
import { shouldShowCommandSidebar } from "@/lib/sim/debrief";
import type { GameSettings } from "@/lib/persist/settings";
import type { Campaign, FactionVisualProfile, SimState } from "@/lib/types";
import type { CommandTab, PauseView } from "@/lib/ui/shortcuts";
import { gameOverlayModel, powerSignature } from "./gameOverlayModel";
import { GamePauseSurface } from "./GamePauseSurface";
import { GameSidebarSurface } from "./GameSidebarSurface";
import { MobileCommandLauncher } from "./MobileCommandLauncher";
import { MissionConfirmation } from "./MissionConfirmation";
import type { GameActions } from "./hooks/useGameActions";
import type { GameCamera } from "./hooks/useGameCamera";
import type { GameSession } from "./hooks/useGameSession";
import { minimapPingFor } from "@/lib/ui/missionPresentation";

function tutorialNeedsCommandSurface(stage: SimState["tutorialStage"]): boolean {
  return stage === "build" || stage === "produce" || stage === "repair";
}

export type GameOverlayProps = {
  campaign: Campaign;
  state: SimState;
  playerVisualProfile: FactionVisualProfile;
  selectedIds: number[];
  tutorial: boolean;
  mobilePanelOpen: boolean;
  mobileLauncherRef: Ref<HTMLButtonElement>;
  miniRef: Ref<HTMLCanvasElement>;
  activeTab: CommandTab;
  onTab: (tab: CommandTab) => void;
  paused: boolean;
  pauseView: PauseView;
  pauseNotice: string;
  audioSettings: GameSettings;
  camera: GameCamera;
  setPauseView: (view: PauseView) => void;
  setPauseNotice: (notice: string) => void;
  onToggleMobilePanel: () => void;
  onMobileSheetDrag?: (direction: "open" | "close") => void;
  onPause: () => void;
  onControlsOpened?: () => void;
  combatAlert?: string | null;
  combatAlertKind?: import("./hooks/useCombatAlert").CombatAlertKind;
  actions: GameActions;
  session: GameSession;
};

export function GameOverlays({
  campaign,
  state,
  playerVisualProfile,
  selectedIds,
  tutorial,
  mobilePanelOpen,
  mobileLauncherRef,
  miniRef,
  activeTab,
  onTab,
  paused,
  pauseView,
  pauseNotice,
  audioSettings,
  camera,
  setPauseView,
  setPauseNotice,
  onToggleMobilePanel,
  onMobileSheetDrag,
  onPause,
  onControlsOpened,
  combatAlert,
  combatAlertKind,
  actions,
  session,
}: GameOverlayProps) {
  // Memoized so the selected-entity snapshot is not rebuilt on unrelated re-renders.
  const { palette, selected } = useMemo(
    () => gameOverlayModel({ state, selectedIds }),
    [state, selectedIds],
  );
  // The power grid only changes when an owner-0 building finishes, starts
  // construction, or dies; keying on the signature skips the full entity
  // rescan during unit-movement ticks and selection/pause churn.
  const powerSig = powerSignature(state);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on derived signature, not raw state
  const grid = useMemo(() => powerBreakdown(state, 0), [powerSig]);
  const minimapPing = useMemo(() => {
    if (!combatAlert) return undefined;
    if (combatAlertKind === "warning") return minimapPingFor(state, "urgent");
    if (combatAlertKind === "objective") return minimapPingFor(state, "objective");
    return undefined;
  }, [combatAlert, combatAlertKind, state]);

  return (
    <>
      {!paused && state.result === "playing" && !session.confirmation ? (
        <MobileCommandLauncher
          open={mobilePanelOpen}
          onToggle={onToggleMobilePanel}
          onDrag={onMobileSheetDrag}
          buttonRef={mobileLauncherRef}
          tutorialFocus={tutorial && !mobilePanelOpen && tutorialNeedsCommandSurface(state.tutorialStage) ? "command-launcher" : undefined}
        />
      ) : null}

      {shouldShowCommandSidebar(state.result) ? (
        <GameSidebarSurface
          factionName={campaign.factions[0].name}
          state={state}
          palette={palette}
          profile={playerVisualProfile}
          selected={selected}
          placeKind={actions.placeKind}
          repairMode={actions.repairMode}
          sellMode={actions.sellMode}
          activeTab={activeTab}
          power={grid.surplus}
          produced={grid.produced}
          used={grid.used}
          miniRef={miniRef}
          onPause={onPause}
          onToggleMobilePanel={onToggleMobilePanel}
          camera={camera}
          onTab={onTab}
          actions={actions}
          mobilePanelOpen={mobilePanelOpen}
          selectionCount={selectedIds.length}
          minimapPing={minimapPing}
        />
      ) : null}

      {paused ? (
        <GamePauseSurface
          view={pauseView}
          notice={pauseNotice}
          settings={audioSettings}
          tutorial={tutorial}
          setView={setPauseView}
          setNotice={setPauseNotice}
          onControlsOpened={onControlsOpened}
          session={session}
        />
      ) : null}

      {session.confirmation ? (
        <MissionConfirmation
          confirmation={session.confirmation}
          onConfirm={session.confirmAction}
          onCancel={session.cancelConfirmation}
        />
      ) : null}
    </>
  );
}
