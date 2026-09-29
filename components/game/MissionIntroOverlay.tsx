"use client";

import { useEffect, type CSSProperties } from "react";
import type { BiomeName } from "@/lib/types";
import type { MissionIntroPhase } from "@/lib/render/missionIntro";
import { MISSION_INTRO_BIOMES } from "@/lib/render/missionIntroBiome";
import styles from "./MissionIntroOverlay.module.css";

export function MissionIntroOverlay({ waiting, reducedMotion, confirmationOpen, onSkip, biome, phase }: { waiting: boolean; reducedMotion: boolean; confirmationOpen: boolean; onSkip: () => void; biome: BiomeName; phase: MissionIntroPhase }) {
  const channelStatus = waiting ? "SYNCING FIELD UNITS" : phase;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (waiting || confirmationOpen || event.repeat || !(event.key === "Escape" || event.key === "Enter" || event.key === " ")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onSkip();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [confirmationOpen, onSkip, waiting]);

  return (
    <section
      className={styles.overlay}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-biome={biome}
      data-online={phase === "COMMAND HQ ONLINE" ? "true" : "false"}
      style={{ "--intro-accent": MISSION_INTRO_BIOMES[biome].accent } as CSSProperties}
      role="dialog"
      aria-modal="true"
      aria-label="Mission arrival feed"
      aria-live="polite"
      aria-hidden={confirmationOpen}
      onPointerDown={(event) => { if (event.target === event.currentTarget) event.preventDefault(); }}
    >
      <div className={styles.frame}>
        <div className={styles.frameLine} aria-hidden="true" />
        <header className={styles.header} aria-hidden="true">
          <div className={styles.identity}>
            <span className={styles.signal} />
            <span className={styles.identityLabel}>FIELD COMMAND <i>／</i> ARRIVAL FEED</span>
            <strong>{MISSION_INTRO_BIOMES[biome].label}</strong>
          </div>
          <div className={styles.channel}>
            <span className={styles.channelLight} />
            <span className={styles.channelStatus} key={channelStatus}>{channelStatus}</span>
          </div>
        </header>
        <div className={styles.heroTitle} aria-hidden="true">
          <span>FIELD COMMAND <i>／</i> DEPLOYMENT COMPLETE</span>
          <strong>COMMAND HQ</strong>
          <b>ONLINE</b>
        </div>
        <button className={styles.skip} type="button" onClick={onSkip} disabled={waiting || confirmationOpen}>
          <span className={styles.skipLabel}>{waiting ? "WAITING FOR PLAYERS" : "SKIP INTRO"}</span>
          <span className={styles.skipKey}>ESC <i>／</i> ENTER</span>
        </button>
      </div>
    </section>
  );
}
