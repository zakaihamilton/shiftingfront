import { useState } from "react";
import { ActionRail } from "@/components/ui/Dossier";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import { formatMissionShareCard } from "@/lib/ui/shareCard";
import { MISSION_MAX } from "@/lib/seed/rng";
import { persistDeploymentEdge } from "@/lib/persist/deploymentEdge";
import type { DeploymentEdge, SimState } from "@/lib/types";
import styles from "./MissionResult.module.css";

const DEPLOYMENT_CHOICES: ReadonlyArray<{ id: DeploymentEdge; label: string; detail: string }> = [
  { id: "veteranSquad", label: "Veteran squad", detail: "Four veteran infantry deploy with the next operation." },
  { id: "forwardTurret", label: "Forward turret", detail: "A gun turret is already built at the start of the next operation." },
  { id: "airSortie", label: "Air sortie", detail: "One strike plane begins the next operation with a full load." },
  { id: "powerReserve", label: "Power reserve", detail: "The next operation starts with extra power." },
];

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

  const chooseEdge = (edge: DeploymentEdge) => {
    persistDeploymentEdge(state.seed, edge);
    onNextBriefing();
  };

  return (
    <ActionRail className={styles.actions}>
      {!multiplayer && state.result === "won" && state.missionIndex < MISSION_MAX ? (
        <div className={styles.deployment} data-testid="deployment-choices">
          {DEPLOYMENT_CHOICES.map((choice) => (
            <ConsoleButton
              key={choice.id}
              muted
              tooltip={choice.detail}
              onClick={() => chooseEdge(choice.id)}
            >
              {choice.label}
            </ConsoleButton>
          ))}
        </div>
      ) : null}
      {!multiplayer && state.result === "won" && state.missionIndex < MISSION_MAX ? (
        <ConsoleButton tooltip="Advance to the next briefing" shortcut={SHORTCUT.resultPrimary} onClick={onNextBriefing}>
          Next briefing
        </ConsoleButton>
      ) : null}
      {!multiplayer && state.result === "won" && state.missionIndex >= MISSION_MAX ? (
        <ConsoleButton tooltip="Return to the main menu" shortcut={SHORTCUT.resultPrimary} onClick={onCampaignVictory}>
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
        <ConsoleButton tooltip="Retry this mission" shortcut={SHORTCUT.resultPrimary} onClick={onRetry}>
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
