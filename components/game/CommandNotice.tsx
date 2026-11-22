import styles from "./CommandNotice.module.css";
import type { CommandNoticeState } from "./hooks/useGameChrome";
import { NotificationIcon } from "./NotificationIcon";

export function CommandNotice({ notice }: { notice: CommandNoticeState }) {
  if (!notice) return null;
  const urgent = notice.kind === "warning" || notice.kind === "error";
  return (
    <p
      className={styles.notice}
      data-kind={notice.kind}
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      data-testid="command-notice"
    >
      <span className={styles.icon}>
        <NotificationIcon kind={notice.kind} className={styles.iconSvg} />
      </span>
      <span>{notice.text}</span>
    </p>
  );
}
