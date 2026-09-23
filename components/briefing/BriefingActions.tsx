import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import type { Campaign } from "@/lib/types";
import styles from "./BriefingScreen.module.css";

export function BriefingActions({
  campaign,
  returnToGame,
  onReplay,
  onSkip = () => undefined,
  isComplete = false,
  onLaunch,
  onBack,
  backLabel,
}: {
  campaign: Campaign;
  returnToGame: boolean;
  onReplay: () => void;
  onSkip?: () => void;
  isComplete?: boolean;
  onLaunch: () => void;
  onBack: () => void;
  backLabel: string;
}) {
  return (
    <div className={styles.actions} data-testid="briefing-actions">
      {!returnToGame ? (
        <ConsoleButton
          muted
          tooltip={backLabel}
          shortcut={SHORTCUT.back}
          onClick={onBack}
        >
          {backLabel}
        </ConsoleButton>
      ) : null}
      <ConsoleButton
        tooltip="Replay the incoming transmission"
        shortcut={SHORTCUT.replay}
        onClick={onReplay}
      >
        Replay
      </ConsoleButton>
      {isComplete ? (
        <ConsoleButton
          className={`${styles.skip} ${styles.skipPlaceholder}`}
          muted
          disabled
          aria-hidden="true"
          tabIndex={-1}
        >
          Skip transmission
        </ConsoleButton>
      ) : (
        <ConsoleButton
          className={styles.skip}
          muted
          tooltip="Reveal the full transmission"
          shortcut={SHORTCUT.skip}
          onClick={onSkip}
        >
          Skip transmission
        </ConsoleButton>
      )}
      <ConsoleButton
        className={styles.launch}
        tooltip={returnToGame ? "Return to the battlefield" : "Launch this mission"}
        shortcut={returnToGame ? SHORTCUT.resume : SHORTCUT.launch}
        onClick={onLaunch}
      >
        {returnToGame ? "Return to mission" : "Launch"}
      </ConsoleButton>
      <p className={styles.tone}>
        {campaign.world.tone} · {campaign.world.conflict}
      </p>
    </div>
  );
}
