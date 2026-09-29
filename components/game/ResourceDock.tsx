import { CreditsCounter } from "./CreditsCounter";
import { PowerMeter } from "./PowerMeter";
import styles from "./ResourceDock.module.css";

export function ResourceDock({
  credits,
  produced,
  used,
  surplus,
}: {
  credits: number;
  produced: number;
  used: number;
  surplus: number;
}) {
  const powerTip = `${surplus < 0 ? "Power deficit" : used / Math.max(1, produced) >= 0.82 ? "Power grid near capacity" : "Base power surplus"} · Using ${used} of ${produced} power`;
  return (
    <div className={styles.dock}>
      <div className={styles.host} data-tooltip="Available credits">
        <CreditsCounter value={credits} />
      </div>
      <div className={styles.host} data-tooltip={powerTip}>
        <PowerMeter produced={produced} used={used} />
      </div>
    </div>
  );
}
