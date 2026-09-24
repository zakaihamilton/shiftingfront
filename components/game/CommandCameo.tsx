import type { CSSProperties } from "react";
import { isUnitKind, labelFor, UNIT_STATS, type CameoStatus } from "@/lib/catalog";
import { cx } from "@/lib/ui/cx";
import type { BuildingKind, FactionVisualProfile, Palette, UnitKind } from "@/lib/types";
import { SpritePreview } from "./SpritePreview";
import styles from "./CommandCameo.module.css";
import { useShortcutLabel } from "@/components/ui/useShortcutLabel";

export function CommandCameo({
  kind,
  palette,
  profile,
  cost,
  disabled,
  disabledReason,
  detail,
  active,
  tutorialFocus,
  cameo,
  shortcut,
  onClick,
  onContextMenu,
}: {
  kind: BuildingKind | UnitKind;
  palette: Palette;
  profile: FactionVisualProfile;
  cost: number;
  disabled?: boolean;
  disabledReason?: string;
  detail?: string;
  active?: boolean;
  tutorialFocus?: string;
  cameo: CameoStatus;
  shortcut?: string;
  onClick: () => void;
  onContextMenu?: () => void;
}) {
  const formattedShortcut = useShortcutLabel(shortcut ?? "");
  const displayShortcut = shortcut ? formattedShortcut : undefined;
  const busy = cameo.phase !== "idle";
  const showCount = cameo.queued > 1 || cameo.phase === "waiting";
  const cancellable = busy || active;
  const role = isUnitKind(kind) ? ` · ${UNIT_STATS[kind].armor} armor · ${UNIT_STATS[kind].weapon} weapon` : "";
  const tooltip = `${labelFor(kind)}${role} · ${cost} credits${busy ? (cameo.phase === "waiting" ? ` · ${cameo.queued} in queue` : ` · ${Math.round(cameo.ratio * 100)}% complete`) : ""}${cancellable ? " · Right-click or use Cancel" : ""}${disabledReason ? ` · ${disabledReason}` : ""}`;
  const ariaStatus = disabledReason ? `, ${disabledReason}` : "";
  return (
    <span
      className={styles.wrap}
      data-tooltip={tooltip}
      data-shortcut={displayShortcut}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.();
      }}
    >
      <button
        type="button"
        disabled={disabled}
        className={cx(styles.card, active && styles.active, busy && styles.busy, tutorialFocus && styles.tutorialFocus)}
        data-tutorial-focus={tutorialFocus}
        onClick={onClick}
        aria-label={`${labelFor(kind)}, ${cost} credits${busy ? `, ${cameo.phase === "waiting" ? `${cameo.queued} in queue` : `${Math.round(cameo.ratio * 100)} percent complete`}` : ""}${cancellable ? ", cancel available" : ""}${ariaStatus}`}
        aria-keyshortcuts={displayShortcut}
      >
        <span className={styles.art}>
          <SpritePreview kind={kind} palette={palette} profile={profile} className={styles.sprite} />
          {busy ? (
            <span
              className={cx(styles.progress, cameo.phase === "waiting" && styles.waiting)}
              style={{ "--cameo-remain": `${Math.max(0, (1 - cameo.ratio) * 100)}%` } as CSSProperties}
              data-testid={`cameo-progress-${kind}`}
              data-phase={cameo.phase}
              data-queued={cameo.queued}
            />
          ) : null}
          {showCount ? <span className={styles.count}>{cameo.queued}</span> : null}
        </span>
        <span className={styles.caption}>
          <span className={styles.captionTop}>
            <span>{labelFor(kind)}</span>
            <b>{cost}</b>
          </span>
          <span className={cx(styles.status, disabledReason && styles.blocked)}>
            {disabledReason ?? (busy ? cameo.phase === "waiting" ? `Queue ${cameo.queued}` : `${Math.round(cameo.ratio * 100)}% ready` : "Ready")}
          </span>
          <span className={styles.detail}>{detail ?? "\u00a0"}</span>
        </span>
      </button>
      {cancellable && onContextMenu ? (
        <button
          type="button"
          className={styles.cancel}
          aria-label={`Cancel ${labelFor(kind)}`}
          data-testid={`cameo-cancel-${kind}`}
          onClick={(event) => {
            event.stopPropagation();
            onContextMenu();
          }}
        >
          <span className={styles.cancelIcon} aria-hidden="true">×</span>
        </button>
      ) : null}
    </span>
  );
}
