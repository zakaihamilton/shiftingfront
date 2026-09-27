"use client";

import { type CSSProperties } from "react";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { useModalFocus } from "@/components/ui/useModalFocus";
import { RASTER_ART } from "@/lib/gen/visualAssets";
import { missionDebrief } from "@/lib/sim/debrief";
import type { SimState } from "@/lib/types";
import { MissionBattleRecord, MissionForceDisposition, MissionOutcome } from "./MissionResultSections";
import { MissionResultActions } from "./MissionResultActions";
import styles from "./MissionResult.module.css";

export function MissionResult({
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
  const dialogRef = useModalFocus(state.result !== "playing", state.result, "dialog");
  if (state.result === "playing") return null;
  const draw = state.multiplayer && state.winner === null;
  const resultTitle = state.multiplayer
    ? draw ? "Draw" : state.result === "won" ? "Skirmish won" : "Skirmish lost"
    : state.result === "won" ? "Mission complete" : "Mission failed";
  const debrief = missionDebrief(state);
  return (
    <div
      className={styles.overlay}
      data-testid="mission-result"
      data-result={state.result}
      style={{ "--result-art": `url("${RASTER_ART[state.result === "won" ? "victory" : "defeat"]}")` } as CSSProperties}
    >
      <MetalPanel
        ref={dialogRef}
        tabIndex={-1}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-result-title"
      >
        <header className={styles.header}>
          <ConsoleLabel className={styles.headerLabel}>{state.multiplayer ? "Online skirmish" : "Campaign status"}</ConsoleLabel>
          <h2 id="mission-result-title" className={styles.title}>{resultTitle}</h2>
          <p className={styles.mission}>{state.multiplayer ? state.missionName : `Mission ${state.missionIndex + 1} // ${state.missionName}`}</p>
        </header>
        <div className={styles.resultGrid}>
          <MissionOutcome debrief={debrief} />
          <MissionBattleRecord debrief={debrief} />
          <MissionForceDisposition debrief={debrief} />
        </div>
        <MissionResultActions
          state={state}
          onNextBriefing={onNextBriefing}
          onCampaignVictory={onCampaignVictory}
          onRetry={onRetry}
          onMenu={onMenu}
        />
      </MetalPanel>
    </div>
  );
}
