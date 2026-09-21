"use client";

import type { CSSProperties } from "react";
import type { SimState } from "@/lib/types";
import { DocumentTitle } from "@/components/ui/DocumentTitle";
import { GameOverlays } from "./GameOverlays";
import { GamePlayField } from "./GamePlayField";
import type { GameRuntimeSurfaces } from "./hooks/runtime/surfaces";
import styles from "./GameClient.module.css";

type TacticalScreenProps = GameRuntimeSurfaces & {
  title: string;
  palette: SimState["factions"][number]["palette"];
};

/** Pure screen composition for the tactical mission view. */
export function TacticalScreen({ title, palette, playField, overlays }: TacticalScreenProps) {
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
      <GamePlayField {...playField} />
      <GameOverlays {...overlays} />
    </div>
  );
}
