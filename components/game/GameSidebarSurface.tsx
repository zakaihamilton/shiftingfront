import type { PointerEventHandler, Ref } from "react";
import type { Entity, FactionVisualProfile, Palette, SimState } from "@/lib/types";
import type { CommandTab } from "@/lib/ui/shortcuts";
import { CommandSidebar } from "./CommandSidebar";
import type { MinimapPing } from "./MinimapFrame";
import type { GameActions } from "./hooks/useGameActions";
import type { GameCamera } from "./hooks/useGameCamera";
import type { GameSession } from "./hooks/useGameSession";

export function GameSidebarSurface({
  factionName,
  state,
  palette,
  profile,
  selected,
  placeKind,
  repairMode,
  sellMode,
  activeTab,
  power,
  produced,
  used,
  miniRef,
  onPause,
  onToggleMobilePanel,
  camera,
  onTab,
  actions,
  mobilePanelOpen,
  selectionCount,
  minimapPing,
}: {
  factionName: string;
  state: SimState;
  palette: Palette;
  profile: FactionVisualProfile;
  selected: Entity | undefined;
  placeKind: GameActions["placeKind"];
  repairMode: boolean;
  sellMode: boolean;
  activeTab: CommandTab;
  power: number;
  produced: number;
  used: number;
  miniRef: Ref<HTMLCanvasElement>;
  onPause: GameSession["openPauseMenu"];
  onToggleMobilePanel: () => void;
  camera: GameCamera;
  onTab: (tab: CommandTab) => void;
  actions: GameActions;
  mobilePanelOpen: boolean;
  selectionCount: number;
  minimapPing?: MinimapPing;
}) {
  const onMinimapPointerDown: PointerEventHandler<HTMLCanvasElement> = camera.onMinimapPointerDown;
  const onMinimapPointerMove: PointerEventHandler<HTMLCanvasElement> = camera.onMinimapPointerMove;
  const onMinimapPointerUp: PointerEventHandler<HTMLCanvasElement> = camera.onMinimapPointerUp;

  return (
    <CommandSidebar
      factionName={factionName}
      state={state}
      palette={palette}
      profile={profile}
      selected={selected}
      placeKind={placeKind}
      repairMode={repairMode}
      sellMode={sellMode}
      activeTab={activeTab}
      power={power}
      produced={produced}
      used={used}
      miniRef={miniRef}
      onPause={onPause}
      onPlace={(kind) => {
        actions.togglePlace(kind);
        if (mobilePanelOpen) onToggleMobilePanel();
      }}
      onMinimapPointerDown={onMinimapPointerDown}
      onMinimapPointerMove={onMinimapPointerMove}
      onMinimapPointerUp={onMinimapPointerUp}
      isMinimapDragging={camera.isMinimapDragging}
      minimapPing={minimapPing}
      mobilePanelOpen={mobilePanelOpen}
      onTab={onTab}
      onRepair={actions.toggleRepair}
      onSell={actions.toggleSell}
      onCancelBuilding={actions.cancelBuilding}
      onQueueUnit={actions.queueUnit}
      onCancelUnit={actions.cancelUnit}
      availableProducer={actions.availableProducer}
      onStop={() => actions.issueSelectedCommand("stop")}
      onStance={(stance) => actions.issueSelectedCommand("stance", stance)}
      onFormation={(formation) => actions.issueSelectedCommand("formation", formation)}
      selectionCount={selectionCount}
    />
  );
}
