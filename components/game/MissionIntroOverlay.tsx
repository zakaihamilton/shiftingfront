"use client";

import { useEffect } from "react";
import styles from "./MissionIntroOverlay.module.css";

export function MissionIntroOverlay({ waiting, reducedMotion, confirmationOpen, onSkip }: { waiting: boolean; reducedMotion: boolean; confirmationOpen: boolean; onSkip: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (confirmationOpen || event.repeat || !(event.key === "Escape" || event.key === "Enter" || event.key === " ")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onSkip();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [confirmationOpen, onSkip]);

  return (
    <section
      className={styles.overlay}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-label="Mission arrival feed"
      aria-live="polite"
      aria-hidden={confirmationOpen}
      onPointerDown={(event) => { if (event.target === event.currentTarget) event.preventDefault(); }}
    >
      <div className={styles.frame}>
        <span className={styles.classification}>RESTRICTED // COMMAND CHANNEL</span>
        <button className={styles.skip} type="button" onClick={onSkip} disabled={waiting || confirmationOpen}>
          {waiting ? "READY · WAITING FOR PLAYERS" : "SKIP ARRIVAL"}
          <span>ESC / ENTER</span>
        </button>
      </div>
    </section>
  );
}
