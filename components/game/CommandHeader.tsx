import type { PauseView } from "@/lib/ui/shortcuts";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./CommandSidebar.module.css";

export function CommandHeader({
  factionName,
  onPause,
}: {
  factionName: string;
  onPause: (view?: PauseView) => void;
}) {
  return (
    <button
      type="button"
      className={styles.header}
      data-tooltip="Pause menu · F1 for controls"
      data-shortcut={SHORTCUT.pause}
      onClick={() => onPause("main")}
      aria-label="Open Shifting Front pause menu. F1 for controls"
      aria-keyshortcuts="Escape F1"
    >
      <p className={styles.title}>SHIFTING FRONT</p>
      <p className={styles.faction}>{factionName}</p>
    </button>
  );
}
