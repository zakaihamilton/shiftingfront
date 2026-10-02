import { deadlineUrgency } from "@/lib/ui/missionPresentation";
import { BattlefieldOperationBar } from "./BattlefieldOperationBar";
import type { BattlefieldHudProps } from "./BattlefieldHud.types";
import { MissionDirectivePanel } from "./MissionDirectivePanel";
import styles from "./Battlefield.module.css";

export type { BattlefieldHudProps } from "./BattlefieldHud.types";

export function isMobileDirectiveViewport(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(
    "(max-width: 1023px) and (orientation: portrait), (max-height: 600px), (max-width: 799px), (pointer: coarse) and (max-width: 1400px)",
  ).matches;
}

export function BattlefieldHud(props: BattlefieldHudProps) {
  const urgency = deadlineUrgency(props.timeRemainingTicks);
  return (
    <div className={styles.status} data-testid="battlefield-status" data-urgency={urgency}>
      <BattlefieldOperationBar
        seed={props.seed}
        levelNumber={props.levelNumber}
        levelCount={props.levelCount}
        missionName={props.missionName}
        profileLabel={props.profileLabel}
        multiplayerPingMs={props.multiplayerPingMs}
        multiplayerHost={props.multiplayerHost}
      />
      <MissionDirectivePanel
        objective={props.objective}
        doctrineHints={props.doctrineHints}
        timeRemaining={props.timeRemaining}
        convoyDeparture={props.convoyDeparture}
        briefingObjectives={props.briefingObjectives}
        objectiveCards={props.objectiveCards}
        phaseLabel={props.phaseLabel}
        timeRemainingTicks={props.timeRemainingTicks}
        timeLimitTicks={props.timeLimitTicks}
        onObjectivePanelToggle={props.onObjectivePanelToggle}
        urgency={urgency}
      />
      <div className={styles.statusBackdrop} aria-hidden="true" />
    </div>
  );
}
