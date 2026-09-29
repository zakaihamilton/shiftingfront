"use client";

import { type CSSProperties } from "react";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { StatusBadge } from "@/components/ui/Dossier";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { useModalFocus } from "@/components/ui/useModalFocus";
import { biomeArt, RASTER_ART } from "@/lib/gen/visualAssets";
import { biomeLabel } from "@/lib/gen/names";
import { formatSeed } from "@/lib/seed/rng";
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
  const outcome = draw ? "draw" : state.result;
  const winnerFaction = state.winner === undefined || state.winner === null
    ? undefined
    : state.factions.find((faction) => faction.id === state.winner);
  const resultTitle = state.multiplayer
    ? draw ? "Draw" : state.result === "won" ? "Skirmish won" : "Skirmish lost"
    : state.result === "won" ? "Mission complete" : "Mission failed";
  const debrief = missionDebrief(state);
  const resultTone = draw ? "muted" : state.result === "won" ? "gold" : "alert";
  return (
    <div
      className={styles.overlay}
      data-testid="mission-result"
      data-result={state.result}
      data-outcome={outcome}
      data-multiplayer={state.multiplayer ? "true" : "false"}
      style={{
        "--result-art": `url("${RASTER_ART[state.result === "won" ? "victory" : "defeat"]}")`,
        "--scene-art": `url("${biomeArt(state.biome)}")`,
      } as CSSProperties}
    >
      <MetalPanel
        ref={dialogRef}
        tabIndex={-1}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-result-title"
      >
        <header className={styles.header} data-outcome={outcome}>
          <div className={styles.headerCopy}>
            <div className={styles.headerMeta}>
              <ConsoleLabel className={styles.headerLabel}>{state.multiplayer ? "Skirmish after-action report" : "Campaign after-action report"}</ConsoleLabel>
              <StatusBadge className={styles.headerBadge} tone={resultTone}>
                {draw ? "Draw" : state.result === "won" ? "Victory" : "Defeat"}
              </StatusBadge>
            </div>
            <h2 id="mission-result-title" className={styles.title}>{resultTitle}</h2>
            <p className={styles.mission}>{state.multiplayer ? state.missionName : `Mission ${state.missionIndex + 1} // ${state.missionName}`}</p>
            <p className={styles.heroOutcome}>{debrief.outcome}</p>
          </div>
          <aside className={styles.headerContext} aria-label="Battle context">
            <span className={styles.headerSignal} aria-hidden="true">{draw ? "=" : state.result === "won" ? "✓" : "!"}</span>
            <dl className={styles.contextGrid}>
              <div>
                <dt>Campaign</dt>
                <dd>{biomeLabel(state.biome)}</dd>
              </div>
              {winnerFaction ? (
                <div data-testid="result-winner">
                  <dt>Victor</dt>
                  <dd>{winnerFaction.name}</dd>
                </div>
              ) : draw ? (
                <div data-testid="result-winner">
                  <dt>Match status</dt>
                  <dd>Mutual elimination</dd>
                </div>
              ) : null}
              <div>
                <dt>Seed</dt>
                <dd>{formatSeed(state.seed)}</dd>
              </div>
            </dl>
          </aside>
        </header>
        <div className={styles.resultGrid} role="region" aria-label="Mission results" tabIndex={0}>
          <MissionOutcome debrief={debrief} draw={draw} />
          <MissionBattleRecord debrief={debrief} multiplayer={state.multiplayer === true} />
          <MissionForceDisposition debrief={debrief} multiplayer={state.multiplayer === true} />
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
