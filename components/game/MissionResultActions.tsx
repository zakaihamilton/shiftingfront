import { useState } from "react";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ActionRail } from "@/components/ui/Dossier";
import { MISSION_MAX } from "@/lib/seed/rng";
import type { SimState } from "@/lib/types";
import { formatMissionShareCard } from "@/lib/ui/shareCard";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./MissionResultActions.module.css";

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
  const multiplayer = state.multiplayer === true;
  const draw = multiplayer && state.winner === null;
  const outcome = draw ? "draw" : state.result;

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
    <ActionRail
      className={styles.actions}
      data-outcome={outcome}
      data-multiplayer={multiplayer ? "true" : "false"}
      data-result={state.result}
    >
      {!multiplayer && state.result === "won" && state.missionIndex < MISSION_MAX ? (
        <ConsoleButton
          tooltip="Advance to the next briefing"
          shortcut={SHORTCUT.resultPrimary}
          onClick={onNextBriefing}
        >
          Next briefing
        </ConsoleButton>
      ) : null}
      {!multiplayer && state.result === "won" && state.missionIndex >= MISSION_MAX ? (
        <ConsoleButton
          tooltip="Return to the main menu"
          shortcut={SHORTCUT.resultPrimary}
          onClick={onCampaignVictory}
        >
          Campaign victory
        </ConsoleButton>
      ) : null}
      {!multiplayer && state.result === "won" ? (
        <ConsoleButton
          muted
          className={styles.shareAction}
          tooltip={copied ? "Result copied to clipboard!" : "Copy mission score to clipboard"}
          onClick={handleShare}
        >
          {copied ? "Copied!" : "Share result"}
        </ConsoleButton>
      ) : null}
      {!multiplayer && state.result === "won" ? (
        <ConsoleButton muted tooltip="Replay this mission" onClick={onRetry}>
          Replay mission
        </ConsoleButton>
      ) : null}
      {!multiplayer && state.result === "lost" ? (
        <ConsoleButton
          tooltip="Retry this mission"
          shortcut={SHORTCUT.resultPrimary}
          onClick={onRetry}
        >
          Retry
        </ConsoleButton>
      ) : null}
      <ConsoleButton
        muted={!multiplayer}
        tooltip="Return to the main menu"
        shortcut={multiplayer ? SHORTCUT.resultPrimary : SHORTCUT.resultMenu}
        onClick={onMenu}
      >
        {multiplayer ? "Return to menu" : "Menu"}
      </ConsoleButton>
    </ActionRail>
  );
}
