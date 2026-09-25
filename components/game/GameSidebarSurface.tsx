import type { PointerEventHandler } from "react";
import { CommandSidebar } from "./CommandSidebar";
import type { SidebarSurfaceModel } from "./hooks/runtime/types";

export function GameSidebarSurface({
  factionName, state, palette, profile, selected, activeTab, power, produced, used, miniRef,
  onPause, onToggleMobilePanel, camera, onTab, commands, mobilePanelOpen, selectionCount, minimapPing,
}: SidebarSurfaceModel) {
  const { placeKind, repairMode, sellMode, onPlace, onRepair, onSell, onCancelBuilding, onQueueUnit, onCancelUnit, availableProducer, onStop, onStance, onFormation } = commands;
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
        onPlace(kind);
        if (mobilePanelOpen) onToggleMobilePanel();
      }}
      onMinimapPointerDown={onMinimapPointerDown}
      onMinimapPointerMove={onMinimapPointerMove}
      onMinimapPointerUp={onMinimapPointerUp}
      isMinimapDragging={camera.isMinimapDragging}
      minimapPing={minimapPing}
      mobilePanelOpen={mobilePanelOpen}
      onTab={onTab}
      onRepair={onRepair}
      onSell={onSell}
      onCancelBuilding={onCancelBuilding}
      onQueueUnit={onQueueUnit}
      onCancelUnit={onCancelUnit}
      availableProducer={availableProducer}
      onStop={onStop}
      onStance={onStance}
      onFormation={onFormation}
      onCenter={() => selected && camera.centerSelection(new Set([selected.id]))}
      selectionCount={selectionCount}
    />
  );
}
