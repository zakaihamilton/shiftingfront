import { isAirUnit, isUnitKind, UNIT_STATS, labelFor } from "@/lib/catalog";
import { cx } from "@/lib/ui/cx";
import type { Entity, FactionVisualProfile, Palette, Stance } from "@/lib/types";
import { SUPPORT_MODE_LABEL, stanceLabel } from "@/lib/ui/copy";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import { triggerHaptic } from "@/lib/ui/haptics";
import { SpritePreview } from "./SpritePreview";
import styles from "./SelectionPanel.module.css";

export function SelectionIdentity({
  selected,
  palette,
  profile,
  stance,
  onCenter,
}: {
  selected: Entity;
  palette: Palette;
  profile: FactionVisualProfile;
  stance: Stance;
  onCenter?: () => void;
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
  const healthText = `Health ${Math.ceil(selected.hp)} / ${selected.maxHp}`;
  const stanceText = `Stance ${stanceLabel(stance)}`;
  const supportText = selected.supportMode ? `Support: ${SUPPORT_MODE_LABEL[selected.supportMode]}` : "";
  const orderText = currentOrder ? `Order: ${currentOrder}` : "";
  const suppressionText = `Suppressed ${Math.ceil(selected.suppression ?? 0)}%`;
  const cargoText = `Cargo ${selected.carry} / ${UNIT_STATS.harvester.carryMax}`;
  const ammoText = selected.class === "unit" && isAirUnit(selected.kind)
    ? `Ammo ${selected.ammo ?? 0} / ${selected.maxAmmo ?? UNIT_STATS[selected.kind].ammoMax ?? 0}${selected.flightState === "servicing" ? " · Servicing runway" : selected.landingRunwayId !== undefined ? " · Returning to runway" : ""}`
    : "";
  const runwayText = selected.assignedPlaneId !== undefined ? `Assigned plane #${selected.assignedPlaneId}` : "Ready for aircraft";
  const warningText = selected.neutral
    ? "Stranded — cannot move until freed"
    : selected.marked && selected.class === "unit"
      ? "Cargo — return to extraction zone"
      : "";
  return (
    <div className={cx(styles.row, selected.class === "unit" && styles.unitRow)}>
      <div className={styles.portrait}>
        <SpritePreview kind={selected.kind} palette={palette} profile={profile} />
      </div>
      <div>
        <strong
          className={cx(styles.name, onCenter && styles.centerable)}
          data-testid="selected-kind"
          data-tooltip={`${labelFor(selected.kind)}${isUnitKind(selected.kind) ? ` · ${UNIT_STATS[selected.kind].armor} armor · ${UNIT_STATS[selected.kind].weapon} weapon` : ""}${onCenter ? " · Click to center camera" : ""}`}
          data-shortcut={SHORTCUT.center}
          role={onCenter ? "button" : undefined}
          tabIndex={onCenter ? 0 : undefined}
          onClick={onCenter ? () => {
            triggerHaptic("tap");
            onCenter();
          } : undefined}
          onKeyDown={onCenter ? (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              triggerHaptic("tap");
              onCenter();
            }
          } : undefined}
        >
          {labelFor(selected.kind)}
        </strong>
        <span className={styles.stat} data-tooltip={healthText}>{healthText}</span>
        {selected.neutral ? (
          <span className={styles.warning} data-testid="selected-status" data-tooltip={warningText}>{warningText}</span>
        ) : selected.marked && selected.class === "unit" ? (
          <span className={styles.warning} data-testid="selected-status" data-tooltip={warningText}>{warningText}</span>
        ) : selected.class === "unit" ? <span className={styles.stat} data-tooltip={stanceText}>{stanceText}</span> : null}
        {selected.class === "unit" && selected.supportMode ? (
          <span className={styles.stat} data-testid="selected-support-status" data-tooltip={supportText}>
            {supportText}
          </span>
        ) : null}
        {currentOrder ? <span className={styles.orderStatus} data-testid="selected-order" data-tooltip={orderText}>{orderText}</span> : null}
        {(selected.suppression ?? 0) > 0 ? <span className={styles.stat} data-tooltip={suppressionText}>{suppressionText}</span> : null}
        {selected.kind === "harvester" ? (
          <span className={styles.carry} data-tooltip={cargoText}>
            {cargoText}
          </span>
        ) : null}
        {selected.class === "unit" && isAirUnit(selected.kind) ? (
          <span className={styles.stat} data-testid="selected-ammo" data-tooltip={ammoText}>
            {ammoText}
          </span>
        ) : null}
        {selected.class === "building" && selected.kind === "runway" ? (
          <span className={styles.stat} data-testid="runway-status" data-tooltip={runwayText}>
            {runwayText}
          </span>
        ) : null}
      </div>
    </div>
  );
}
