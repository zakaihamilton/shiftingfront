import styles from "./ProgressMeter.module.css";

export function ProgressMeter({
  label,
  ratio,
  detail,
}: {
  label: string;
  ratio: number;
  detail?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return (
    <div className={styles.root}>
      <div className={styles.meta}>
        <span className={styles.label} data-tooltip={label}>{label}</span>
        <span className={styles.detail} data-tooltip={`${pct}%${detail ? ` · ${detail}` : ""}`}>
          {pct}%{detail ? ` · ${detail}` : ""}
        </span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
