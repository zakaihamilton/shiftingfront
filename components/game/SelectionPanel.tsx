import { BUILDING_DEFINITIONS, BUILDING_STATS, MAX_PRODUCTION_QUEUE, TICKS_PER_SECOND, UNIT_STATS, labelFor } from "@/lib/catalog";
import { ProgressMeter } from "@/components/ui/ProgressMeter";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { cx } from "@/lib/ui/cx";
import { isBuildingEntity, type Entity, type FactionVisualProfile, type Formation, type Palette, type Stance } from "@/lib/types";
import { SelectionIdentity } from "./SelectionIdentity";
import { SelectionOrders } from "./SelectionOrders";
import styles from "./SelectionPanel.module.css";

export function SelectionPanel({
  selected,
  selectionCount = selected ? 1 : 0,
  palette,
  profile,
  className,
  onStop,
  onStance,
  onFormation,
  onCenter,
}: {
  selected: Entity | undefined;
  selectionCount?: number;
  palette: Palette;
  profile: FactionVisualProfile;
  className?: string;
  onStop?: () => void;
  onStance?: (stance: Stance) => void;
  onFormation?: (formation: Formation) => void;
  onCenter?: () => void;
}) {
  const friendlyUnit = selected && selected.owner === 0 && selected.class === "unit" && !selected.neutral;
  const friendlyProducer = selected && isBuildingEntity(selected) && selected.owner === 0 && selected.constructing <= 0 && Boolean(BUILDING_DEFINITIONS[selected.kind].production);
  const stance = selected?.stance ?? "aggressive";
  const formation = selected?.formation;
  return (
    <section className={cx(styles.section, className)}>
      <ConsoleLabel className={styles.label}>{selectionCount > 1 ? `${selectionCount} units selected` : "Selected"}</ConsoleLabel>
      {selected ? (
        <div className={styles.body}>
          <SelectionIdentity selected={selected} palette={palette} profile={profile} stance={stance} onCenter={onCenter} />
          {selected.class === "unit" ? (
            <ProgressMeter
              label="Health"
              ratio={selected.maxHp > 0 ? selected.hp / selected.maxHp : 1}
              detail={`${Math.ceil(selected.hp)} / ${selected.maxHp}`}
            />
          ) : null}
          {friendlyUnit && onStop && onStance && onFormation ? (
            <SelectionOrders
              stance={stance}
              formation={formation}
              onStop={onStop}
              onStance={onStance}
              onFormation={onFormation}
            />
          ) : null}
          {selected.constructing > 0 && isBuildingEntity(selected) ? (
            <ProgressMeter
              label="Under construction"
              ratio={1 - selected.constructing / (BUILDING_STATS[selected.kind].buildTicks || 1)}
              detail={`${Math.ceil(selected.constructing / TICKS_PER_SECOND)}s`}
            />
          ) : null}
          {selected.producing ? (
            <ProgressMeter
              label={`Training ${labelFor(selected.producing.kind)}`}
              ratio={1 - selected.producing.remaining / (UNIT_STATS[selected.producing.kind].buildTicks || 1)}
              detail={
                (selected.queue?.length ?? 0) > 0
                  ? `Queue ${(selected.queue?.length ?? 0) + 1} of ${MAX_PRODUCTION_QUEUE}`
                  : `${Math.ceil(selected.producing.remaining / TICKS_PER_SECOND)}s`
              }
            />
          ) : null}
          {friendlyProducer ? (
            <span className={styles.orderStatus} data-testid="rally-status">
              {selected.rallyPoint ? `Rally point ${selected.rallyPoint.x}, ${selected.rallyPoint.y}` : "Rally point not set"}
            </span>
          ) : null}
          {selected.repairing ? (
            <ProgressMeter
              label="Repairing"
              ratio={selected.maxHp > 0 ? selected.hp / selected.maxHp : 1}
            />
          ) : null}
        </div>
      ) : <p className={styles.empty}>Awaiting selection</p>}
    </section>
  );
}
