import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import { useWeeklyCountdown } from "./useWeeklyCountdown";
import styles from "./MenuMainPanel.module.css";

export function MenuMainPanel({
  onNewGame,
  onTutorial,
  onLoadMission,
  onOptions,
}: {
  onNewGame: () => void;
  onTutorial: () => void;
  onLoadMission: () => void;
  onOptions: () => void;
}) {
  const { countdown } = useWeeklyCountdown();

  return (
    <MetalPanel as="nav" className={styles.panel} data-testid="menu-dashboard" aria-label="Main menu">
      <div className={styles.panelHeader}>
        <ConsoleLabel>Deploy</ConsoleLabel>
        <span className={styles.status} data-testid="weekly-countdown" title="Time until current campaign expires">
          Current campaign expires in {countdown}
        </span>
      </div>

      <div className={styles.actions}>
        <ConsoleButton className={styles.primaryAction} tooltip="Open campaign setup" shortcut={SHORTCUT.newGame} onClick={onNewGame}>
          NEW GAME
        </ConsoleButton>
        <ConsoleButton muted className={`${styles.utilityAction} ${styles.loadAction}`} tooltip="Open the training range" shortcut={SHORTCUT.tutorial} onClick={onTutorial}>
          TUTORIAL
        </ConsoleButton>
        <ConsoleButton muted className={`${styles.utilityAction} ${styles.loadAction}`} tooltip="Open the campaign archive" shortcut={SHORTCUT.load} onClick={onLoadMission}>
          LOAD MISSION
        </ConsoleButton>
        <ConsoleButton muted className={styles.utilityAction} tooltip="Audio and game options" shortcut={SHORTCUT.options} onClick={onOptions}>
          OPTIONS
        </ConsoleButton>
      </div>
    </MetalPanel>
  );
}
