import { useState } from "react";
import { ActionRail } from "@/components/campaign/CampaignDossier";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import { formatMissionShareCard } from "@/lib/ui/shareCard";
import type { SimState } from "@/lib/types";
import styles from "./MissionResult.module.css";

export function MissionResultActions({
  state,
  onNextBriefing,
  onCampaignVictory,
  onRetry,
  onMenu,
}: {
  state: SimState;
  onNextBriefing: () => void;
  onCampaignVictory: () => void;
  onRetry: () => void;
  onMenu: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    try {
      const card = formatMissionShareCard(state);
      await navigator.clipboard?.writeText(card);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <ActionRail className={styles.actions}>
      {state.result === "won" && state.missionIndex < 5 ? (
        <ConsoleButton tooltip="Advance to the next briefing" shortcut={SHORTCUT.resultPrimary} onClick={onNextBriefing}>
          Next briefing
        </ConsoleButton>
      ) : null}
      {state.result === "won" && state.missionIndex >= 5 ? (
        <ConsoleButton tooltip="Return to the main menu" shortcut={SHORTCUT.resultPrimary} onClick={onCampaignVictory}>
          Campaign victory
        </ConsoleButton>
      ) : null}
      {state.result === "won" ? (
        <ConsoleButton
          muted
          className={styles.shareAction}
          tooltip={copied ? "Result copied to clipboard!" : "Copy mission score to clipboard"}
          onClick={handleShare}
        >
          {copied ? "Copied!" : "Share result"}
        </ConsoleButton>
      ) : null}
      {state.result === "won" ? (
        <ConsoleButton muted tooltip="Replay this mission" onClick={onRetry}>
          Replay mission
        </ConsoleButton>
      ) : null}
      {state.result === "lost" ? (
        <ConsoleButton tooltip="Retry this mission" shortcut={SHORTCUT.resultPrimary} onClick={onRetry}>
          Retry
        </ConsoleButton>
      ) : null}
      <ConsoleButton muted tooltip="Return to the main menu" shortcut={SHORTCUT.resultMenu} onClick={onMenu}>
        Menu
      </ConsoleButton>
    </ActionRail>
  );
}
