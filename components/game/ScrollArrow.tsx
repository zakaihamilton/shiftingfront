import type { CardinalPanDir } from "@/lib/render/camera";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import { cx } from "@/lib/ui/cx";
import styles from "./ScrollArrow.module.css";

const SCROLL_ROTATION: Record<CardinalPanDir, number> = { up: 0, right: 90, down: 180, left: 270 };
const DIR_CLASS: Record<CardinalPanDir, string> = {
  up: styles.up,
  right: styles.right,
  down: styles.down,
  left: styles.left,
};

function ScrollArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false" className={styles.icon}>
      <path
        d="M5 16 L12 7 L19 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ScrollArrow({
  dir,
  available,
  hot,
}: {
  dir: CardinalPanDir;
  available: boolean;
  hot: boolean;
}) {
  const label = dir;
  const tooltipPos = dir === "up" ? "below" : dir === "left" ? "right" : dir === "right" ? "left" : "above";
  const showTip = hot && available;
  return (
    <div
      className={cx(styles.arrow, DIR_CLASS[dir], !available && styles.off, showTip && styles.hot)}
      data-testid={`scroll-arrow-${dir}`}
      data-tooltip={`Scroll ${label}`}
      data-shortcut={SHORTCUT.pan[dir]}
      data-tooltip-pos={tooltipPos}
      {...(showTip ? { "data-tooltip-open": "" } : {})}
      aria-hidden
    >
      <span className={styles.glyph} style={{ transform: `rotate(${SCROLL_ROTATION[dir]}deg)` }}>
        <ScrollArrowIcon />
      </span>
    </div>
  );
}
