import { isUnitKind, UNIT_STATS, labelFor } from "@/lib/catalog";
import type { Entity, FactionVisualProfile, Palette, Stance } from "@/lib/types";
import { SUPPORT_MODE_LABEL, stanceLabel } from "@/lib/ui/copy";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import { SpritePreview } from "./SpritePreview";
import styles from "./SelectionPanel.module.css";

export function SelectionIdentity({
  selected,
  palette,
  profile,
  stance,
}: {
  selected: Entity;
  palette: Palette;
  profile: FactionVisualProfile;
  stance: Stance;
}) {
  const currentOrder = selected.class === "unit"
    ? selected.repairing
      ? "Repairing"
      : selected.gatherX !== undefined
        ? "Harvesting"
        : selected.orderMode === "attackMove"
          ? "Attack-move"
          : selected.orderMode === "attack"
            ? "Engaging"
            : selected.orderMode === "move"
              ? "Moving"
              : selected.idle ? "Idle" : "Holding position"
    : undefined;
  return (
    <div className={styles.row}>
      <div className={styles.portrait}>
        <SpritePreview kind={selected.kind} palette={palette} profile={profile} />
      </div>
      <div>
        <strong
          className={styles.name}
          data-testid="selected-kind"
          data-tooltip={`${labelFor(selected.kind)}${isUnitKind(selected.kind) ? ` · ${UNIT_STATS[selected.kind].armor} armor · ${UNIT_STATS[selected.kind].weapon} weapon` : ""}`}
          data-shortcut={SHORTCUT.center}
        >
          {labelFor(selected.kind)}
        </strong>
        <span className={styles.stat}>Health {Math.ceil(selected.hp)} / {selected.maxHp}</span>
        {selected.neutral ? (
          <span className={styles.warning} data-testid="selected-status">Stranded — cannot move until freed</span>
        ) : selected.marked && selected.class === "unit" ? (
          <span className={styles.warning} data-testid="selected-status">Cargo — return to extraction zone</span>
        ) : selected.class === "unit" ? <span className={styles.stat}>Stance {stanceLabel(stance)}</span> : null}
        {selected.class === "unit" && selected.supportMode ? (
          <span className={styles.stat} data-testid="selected-support-status">
            Support: {SUPPORT_MODE_LABEL[selected.supportMode]}
          </span>
        ) : null}
        {currentOrder ? <span className={styles.orderStatus} data-testid="selected-order">Order: {currentOrder}</span> : null}
        {(selected.suppression ?? 0) > 0 ? <span className={styles.stat}>Suppressed {Math.ceil(selected.suppression ?? 0)}%</span> : null}
        {selected.kind === "harvester" ? (
          <span className={styles.carry}>
            Cargo {selected.carry} / {UNIT_STATS.harvester.carryMax}
          </span>
        ) : null}
      </div>
    </div>
  );
}
