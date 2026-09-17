import { useEffect, useState, type PointerEventHandler, type Ref } from "react";
import type { CommandBuildControls } from "./commandCatalogTypes";
import { CommandBuildSection } from "./CommandBuildSection";
import { CommandHeader } from "./CommandHeader";
import { MinimapFrame } from "./MinimapFrame";
import { ResourceDock } from "./ResourceDock";
import type { MinimapPing } from "./MinimapFrame";
import styles from "./CommandSidebar.module.css";

export function CommandSidebar({
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
  onMinimapPointerDown,
  onMinimapPointerMove,
  onMinimapPointerUp,
  isMinimapDragging,
  minimapPing,
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
  mobilePanelOpen,
  selectionCount = 0,
}: CommandBuildControls & {
  factionName: string;
  produced: number;
  used: number;
  miniRef: Ref<HTMLCanvasElement>;
  onPause: () => void;
  onMinimapPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onMinimapPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onMinimapPointerUp: PointerEventHandler<HTMLCanvasElement>;
  isMinimapDragging: boolean;
  minimapPing?: MinimapPing;
  mobilePanelOpen: boolean;
  selectionCount?: number;
}) {
  const [portraitViewport, setPortraitViewport] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia("(max-width: 1023px) and (orientation: portrait)");
    const update = () => setPortraitViewport(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  const panelHidden = portraitViewport && !mobilePanelOpen;

  return (
    <aside
      id="command-sidebar"
      className={styles.sidebar}
      data-mobile-open={mobilePanelOpen ? "true" : "false"}
      data-testid="command-sidebar"
      aria-hidden={panelHidden || undefined}
      inert={panelHidden || undefined}
    >
      <span className={styles.rail} aria-hidden />
      <CommandHeader factionName={factionName} onPause={onPause} />

      <div className={styles.radarSlot}>
        <MinimapFrame
          canvasRef={miniRef}
          onPointerDown={onMinimapPointerDown}
          onPointerMove={onMinimapPointerMove}
          onPointerUp={onMinimapPointerUp}
          isDragging={isMinimapDragging}
          ping={minimapPing}
        />
      </div>

      <div className={styles.resourceSlot}>
        <ResourceDock credits={state.credits[0]} produced={produced} used={used} surplus={power} />
      </div>

      <CommandBuildSection
        state={state}
        palette={palette}
        profile={profile}
        selected={selected}
        placeKind={placeKind}
        repairMode={repairMode}
        sellMode={sellMode}
        activeTab={activeTab}
        selectionCount={selectionCount}
        power={power}
        onTab={onTab}
        onRepair={onRepair}
        onSell={onSell}
        onPlace={onPlace}
        onCancelBuilding={onCancelBuilding}
        onQueueUnit={onQueueUnit}
        onCancelUnit={onCancelUnit}
        availableProducer={availableProducer}
        onStop={onStop}
        onStance={onStance}
        onFormation={onFormation}
      />
    </aside>
  );
}
