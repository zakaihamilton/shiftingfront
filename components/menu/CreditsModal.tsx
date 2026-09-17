"use client";

import { useEffect } from "react";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { useModalFocus } from "@/components/ui/useModalFocus";
import { APP_NAME, APP_REPO_URL, APP_VERSION } from "@/lib/site";
import { feedbackIssueUrl } from "@/lib/ui/issueReport";
import styles from "./CreditsModal.module.css";

export function CreditsModal({ onBack }: { onBack: () => void }) {
  const panelRef = useModalFocus(true, undefined, "dialog");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  return (
    <MetalPanel
      ref={panelRef}
      className={styles.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="credits-title"
    >
      <ConsoleLabel>Command Desk // Operational Archive</ConsoleLabel>
      <h2 id="credits-title" className={styles.title}>
        Credits &amp; Attributions
      </h2>

      <div className={styles.sectionList}>
        <section className={styles.section}>
          <div className={styles.sectionHeading}>Design &amp; Engineering</div>
          <p className={styles.sectionBody}>Zakai Hamilton</p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>Procedural Audio</div>
          <p className={styles.sectionBody}>
            Real-time Web Audio API procedural synthesis, adaptive dynamic scoring, and spatial stereo panning.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>Technology Stack</div>
          <p className={styles.sectionBody}>
            Next.js 16, React 19, TypeScript, Canvas 2D isometric renderer, deterministic fixed-step simulation, Vitest.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>Typography</div>
          <p className={styles.sectionBody}>
            Barlow, Barlow Condensed, and IBM Plex Mono (licensed under the SIL Open Font License 1.1).
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>Open Source &amp; Community</div>
          <p className={styles.sectionBody}>
            {APP_NAME} is free software licensed under the MIT License.
          </p>
          <div className={styles.links}>
            <a href={APP_REPO_URL} target="_blank" rel="noopener noreferrer" className={styles.link}>
              GitHub Repository
            </a>
            <span aria-hidden="true">·</span>
            <a href={feedbackIssueUrl()} target="_blank" rel="noopener noreferrer" className={styles.link}>
              Report an Issue / Feedback
            </a>
          </div>
          <div className={styles.versionBadge}>Version {APP_VERSION}</div>
        </section>
      </div>

      <div className={styles.actions}>
        <ConsoleButton onClick={onBack} tooltip="Return to the previous screen">
          Return to Menu
        </ConsoleButton>
      </div>
    </MetalPanel>
  );
}
