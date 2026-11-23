import styles from "./CombatAlert.module.css";
import type { CombatAlertKind } from "./hooks/useCombatAlert";
import { NotificationIcon } from "./NotificationIcon";

export function CombatAlert({ text, kind = "warning" }: { text: string; kind?: CombatAlertKind }) {
  const urgent = kind === "warning" || kind === "system";
  return (
    <p
      className={styles.banner}
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      data-testid="combat-alert"
      data-kind={kind}
    >
      <span className={styles.icon}>
        <NotificationIcon kind={kind} className={styles.iconSvg} />
      </span>
      {text}
    </p>
  );
}
