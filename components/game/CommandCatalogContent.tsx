import type { CommandCatalogContentProps } from "./commandCatalogTypes";
import { ConstructionCameos } from "./ConstructionCameos";
import { ProductionCameos } from "./ProductionCameos";
import { SelectionPanel } from "./SelectionPanel";

export function CommandCatalogContent({
  state,
  palette,
  profile,
  activeTab,
  placeKind,
  selected,
  selectionCount,
  power,
  availableProducer,
  onPlace,
  onCancelBuilding,
  onQueueUnit,
  onCancelUnit,
  onStop,
  onStance,
  onFormation,
  onCenter,
  selectedClassName,
}: CommandCatalogContentProps) {
  if (activeTab === "construction") {
    return (
      <ConstructionCameos
        state={state}
        palette={palette}
        profile={profile}
        placeKind={placeKind}
        onPlace={onPlace}
        onCancelBuilding={onCancelBuilding}
      />
    );
  }

  if (activeTab === "production") {
    return (
      <ProductionCameos
        state={state}
        palette={palette}
        profile={profile}
        power={power}
        availableProducer={availableProducer}
        onQueueUnit={onQueueUnit}
        onCancelUnit={onCancelUnit}
      />
    );
  }

  return (
    <SelectionPanel
      selected={selected}
      selectionCount={selectionCount}
      palette={palette}
      profile={profile}
      className={selectedClassName}
      onStop={onStop}
      onStance={onStance}
      onFormation={onFormation}
      onCenter={onCenter}
    />
  );
}
