"use client";

import type { CSSProperties } from "react";
import type { SimState } from "@/lib/types";
import { DocumentTitle } from "@/components/ui/DocumentTitle";
import { GameOverlays } from "./GameOverlays";
import { GamePlayField } from "./GamePlayField";
import { MissionIntroOverlay } from "./MissionIntroOverlay";
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
      <GamePlayField {...playField} multiplayerPingMs={multiplayerPingMs} multiplayerHost={multiplayerHost} />
      <GameOverlays {...overlays} hideNonConfirmation={playField.missionIntroActive} />
      {playField.missionIntroActive ? (
        <MissionIntroOverlay
          waiting={playField.missionIntroWaiting}
          reducedMotion={audioSettings.reducedMotion}
          confirmationOpen={Boolean(overlays.confirmation)}
          onSkip={playField.onSkipMissionIntro}
        />
      ) : null}
    </div>
  );
}
