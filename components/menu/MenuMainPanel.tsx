import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import type { SaveMeta } from "@/lib/persist/save";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./MenuMainPanel.module.css";

export function MenuMainPanel({
  resumeSave = null,
  onResumeCampaign = () => undefined,
  onNewGame,
  onTutorial,
  onLoadMission,
  onOptions,
  onMultiplayer = () => undefined,
}: {
  resumeSave?: SaveMeta | null;
  onResumeCampaign?: () => void;
  onNewGame: () => void;
  onTutorial: () => void;
  onLoadMission: () => void;
  onOptions: () => void;
  onMultiplayer?: () => void;
}) {
  return (
    <MetalPanel as="nav" className={styles.panel} data-testid="menu-dashboard" aria-label="Main menu">
      <div className={styles.panelHeader}>
        <ConsoleLabel>Deploy</ConsoleLabel>
      </div>

      <div className={styles.actions}>
        {resumeSave ? (
          <ConsoleButton
            className={`${styles.primaryAction} ${styles.resumeAction}`}
            tooltip={`Resume ${resumeSave.campaignName}, mission ${resumeSave.missionIndex + 1}`}
            aria-label="Resume Campaign"
            onClick={onResumeCampaign}
          >
            <span>RESUME CAMPAIGN</span>
            <span className={styles.resumeMeta} aria-hidden="true">
              {resumeSave.campaignName} · MISSION {String(resumeSave.missionIndex + 1).padStart(2, "0")}
            </span>
          </ConsoleButton>
        ) : null}
        <ConsoleButton
          muted={Boolean(resumeSave)}
          className={resumeSave ? styles.utilityAction : styles.primaryAction}
          tooltip="Open campaign setup"
          shortcut={SHORTCUT.newGame}
          onClick={onNewGame}
        >
          NEW GAME
        </ConsoleButton>
        <ConsoleButton muted className={`${styles.utilityAction} ${styles.loadAction}`} tooltip="Host or join an online skirmish" onClick={onMultiplayer}>
          MULTIPLAYER
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
