import type { CommandBuildControls } from "./commandCatalogTypes";
import { CommandCatalogContent } from "./CommandCatalogContent";
import { CommandTabs } from "./CommandTabs";
import styles from "./CommandSidebar.module.css";

export function CommandBuildSection({
  state,
  palette,
  profile,
  selected,
  placeKind,
  repairMode,
  sellMode,
  activeTab,
  selectionCount,
  power,
  onTab,
  onRepair,
  onSell,
  onPlace,
  onCancelBuilding,
  onQueueUnit,
  onCancelUnit,
  availableProducer,
  onStop,
  onStance,
  onFormation,
}: CommandBuildControls) {
  const catalog = (
    <CommandCatalogContent
      state={state}
      palette={palette}
      profile={profile}
      activeTab={activeTab}
      placeKind={placeKind}
      selected={selected}
      selectionCount={selectionCount}
      power={power}
      availableProducer={availableProducer}
      onPlace={onPlace}
      onCancelBuilding={onCancelBuilding}
      onQueueUnit={onQueueUnit}
      onCancelUnit={onCancelUnit}
      onStop={onStop}
      onStance={onStance}
      onFormation={onFormation}
      selectedClassName={activeTab === "selected" ? styles.selectedBody : undefined}
    />
  );
  const tutorialFocus = state.tutorialStage === "build"
    ? "construction-tab"
    : state.tutorialStage === "produce"
      ? "production-tab"
      : state.tutorialStage === "repair"
        ? "repair-control"
        : undefined;

  return (
    <section className={styles.build} data-testid="build-progress">
      <CommandTabs
        activeTab={activeTab}
        repairMode={repairMode}
        sellMode={sellMode}
        onConstruction={() => onTab("construction")}
        onProduction={() => onTab("production")}
        onSelected={() => onTab("selected")}
        onRepair={onRepair}
        onSell={onSell}
        tutorialFocus={tutorialFocus}
      />
      <div className={styles.contentScroll} data-testid="command-items-scroll">
        {activeTab === "selected" ? (
          <div className={styles.selected} data-testid="selected-panel">
            {catalog}
          </div>
        ) : catalog}
      </div>
    </section>
  );
}
