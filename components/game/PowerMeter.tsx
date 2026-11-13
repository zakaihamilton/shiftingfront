import { cx } from "@/lib/ui/cx";
import styles from "./PowerMeter.module.css";

function PowerIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 14 16" width="14" height="16" aria-hidden="true" focusable="false">
      <path d="M8.2 1 3 8.6h3.4L4.6 15 12 6.8H8.4z" fill="#5ce1e6" stroke="#123038" strokeWidth="0.8" strokeLinejoin="miter" />
      <path d="M7.6 3.2 5.2 8.1h2.2" fill="none" stroke="#e8f2f6" strokeWidth="0.7" />
    </svg>
  );
}

export function PowerMeter({ produced, used }: { produced: number; used: number }) {
  const surplus = produced - used;
  const ratio = produced <= 0 ? (used > 0 ? 1 : 0) : Math.min(1, used / produced);
  const deficit = surplus < 0;
  const tight = !deficit && ratio >= 0.82;
  const label = deficit ? "Power deficit" : tight ? "Power grid near capacity" : "Base power surplus";
  const signed = surplus > 0 ? `+${surplus}` : String(surplus);
  return (
    <div className={cx(styles.meter, deficit && styles.low, tight && styles.tight)} role="status" aria-label={`${label}: ${signed}, using ${used} of ${produced} power`}>
      <PowerIcon />
      <span className={styles.label}>Power</span>
      <div className={styles.lcd}>
        <strong data-testid="power" className={styles.digits}>{signed}</strong>
        <span className={styles.bar} aria-hidden="true">
          <span className={styles.fill} style={{ width: `${Math.round(ratio * 100)}%` }} />
        </span>
      </div>
    </div>
  );
}
