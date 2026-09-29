import type { CommandCatalogContentProps } from "./commandCatalogTypes";
import { ConstructionCameos } from "./ConstructionCameos";
import { ProductionCameos } from "./ProductionCameos";
import { SelectionPanel } from "./SelectionPanel";
import { activeProducerFor, isSharedProducerKind, readSharedProductionQueue } from "@/lib/sim/producerState";

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
      playerOwner={state.viewOwner ?? 0}
      className={selectedClassName}
      power={power}
      sharedQueue={selected && selected.class === "building" && selected.owner === (state.viewOwner ?? 0) && isSharedProducerKind(selected.kind)
        ? readSharedProductionQueue(state, state.viewOwner ?? 0, selected.kind)
        : undefined}
      activeProducerId={selected && selected.class === "building" && isSharedProducerKind(selected.kind)
        ? activeProducerFor(state, selected.owner, selected.kind)?.id
        : undefined}
      onStop={onStop}
      onStance={onStance}
      onFormation={onFormation}
      onCenter={onCenter}
    />
  );
}
