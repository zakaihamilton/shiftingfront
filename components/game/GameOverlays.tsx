import type { OverlaySurfaceModel } from "./hooks/runtime/types";
import { shouldShowCommandSidebar } from "@/lib/sim/debrief";
import { GamePauseSurface } from "./GamePauseSurface";
import { GameSidebarSurface } from "./GameSidebarSurface";
import { MobileCommandLauncher } from "./MobileCommandLauncher";
import { MobileOrientationHint } from "./MobileOrientationHint";
import { MissionConfirmation } from "./MissionConfirmation";

function tutorialNeedsCommandSurface(stage: OverlaySurfaceModel["state"]["tutorialStage"]): boolean {
  return stage === "build" || stage === "produce" || stage === "repair";
}

export type GameOverlayProps = OverlaySurfaceModel;

export function GameOverlays({
  state,
  tutorial,
  mobilePanelOpen,
  mobileLauncherRef,
  paused,
  onToggleMobilePanel,
  onMobileSheetDrag,
  sidebar,
  pause,
  confirmation,
  hideNonConfirmation = false,
}: GameOverlayProps & { hideNonConfirmation?: boolean }) {
  return (
    <>
      {!hideNonConfirmation && !paused && state.result === "playing" && !confirmation ? (
        <>
          <MobileCommandLauncher
            open={mobilePanelOpen}
            onToggle={onToggleMobilePanel}
            onDrag={onMobileSheetDrag}
            buttonRef={mobileLauncherRef}
            tutorialFocus={tutorial && !mobilePanelOpen && tutorialNeedsCommandSurface(state.tutorialStage) ? "command-launcher" : undefined}
          />
          <MobileOrientationHint />
        </>
      ) : null}

      {!hideNonConfirmation && shouldShowCommandSidebar(state.result) ? <GameSidebarSurface {...sidebar} /> : null}
      {!hideNonConfirmation && paused && pause ? <GamePauseSurface {...pause} /> : null}
      {confirmation ? <MissionConfirmation confirmation={confirmation.value} onConfirm={confirmation.onConfirm} onCancel={confirmation.onCancel} /> : null}
    </>
  );
}
