"use client";

import type { CSSProperties } from "react";
import type { SimState } from "@/lib/types";
import { DocumentTitle } from "@/components/ui/DocumentTitle";
import { GameOverlays } from "./GameOverlays";
import { GamePlayField } from "./GamePlayField";
import { TutorialOverlay } from "./TutorialOverlay";
import { tutorialPrompt, tutorialTargets } from "@/lib/sim/tutorial";
import type { GameRuntimeSurfaces } from "./hooks/runtime/surfaces";
import styles from "./GameClient.module.css";

type TacticalScreenProps = GameRuntimeSurfaces & {
  title: string;
  palette: SimState["factions"][number]["palette"];
  multiplayerPingMs?: number | null;
  multiplayerHost?: boolean;
};

/** Pure screen composition for the tactical mission view. */
export function TacticalScreen({ title, palette, playField, overlays, multiplayerPingMs, multiplayerHost }: TacticalScreenProps) {
  const { audioSettings } = overlays;
  return (
    <div
      className={styles.shell}
      data-tutorial={overlays.tutorial ? "true" : undefined}
      data-high-contrast={audioSettings.highContrast ? "true" : "false"}
      data-reduced-motion={audioSettings.reducedMotion ? "true" : "false"}
      data-colorblind={audioSettings.colorblindMode}
      data-hud-scale={audioSettings.hudScale ?? "normal"}
      style={
        {
          "--p": palette.primary,
          "--a": palette.accent,
        } as CSSProperties
      }
      onContextMenu={(e) => e.preventDefault()}
    >
      <DocumentTitle title={title} />
      <div className={styles.gameplayArea}>
        <GamePlayField {...playField} multiplayerPingMs={multiplayerPingMs} multiplayerHost={multiplayerHost} />
        <GameOverlays {...overlays} />
        {playField.tutorial && !playField.paused ? (
          <TutorialOverlay
            prompt={tutorialPrompt(playField.state)}
            stage={playField.state.tutorialStage}
            targets={tutorialTargets(playField.state)}
            onExit={playField.resultActions.onExitTutorial}
            onBack={playField.resultActions.onBackTutorial}
          />
        ) : null}
      </div>
    </div>
  );
}
