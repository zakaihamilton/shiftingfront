"use client";

import type { CSSProperties } from "react";
import { DocumentTitle } from "@/components/ui/DocumentTitle";
import { RASTER_ART } from "@/lib/gen/visualAssets";
import { MenuHero } from "./MenuHero";
import { MenuMainPanel } from "./MenuMainPanel";
import { MenuOverlay } from "./MenuOverlay";
import { MenuSignalOverlay } from "./MenuSignalOverlay";
import { useMenuController } from "./useMenuController";
import styles from "./MenuScreen.module.css";

export function MenuScreen() {
  const controller = useMenuController();

  return (
    <div
      className={styles.screen}
      data-high-contrast={controller.settings.highContrast ? "true" : "false"}
      data-reduced-motion={controller.settings.reducedMotion ? "true" : "false"}
      style={{ "--scene-art": `url("${RASTER_ART.menu}")` } as CSSProperties}
    >
      <DocumentTitle title="Shifting Front" />
      <div className={styles.scene} />
      <div className={styles.vignette} />

      <div className={styles.uiLayer}>
        <header className={styles.topbar} aria-label="Shifting Front status">
          <div className={styles.topbarBrand}>
            <span className={styles.brandMark}>SF</span>
            <span className={styles.topbarMuted}>COMMAND DESK</span>
          </div>
          <div className={styles.topbarStatus}>
            <span className={styles.statusDot} aria-hidden="true" />
            <span>LOCAL CAMPAIGN LINK</span>
            <span className={styles.topbarCode}>SF-01</span>
          </div>
        </header>

        <main className={styles.content}>
          <div className={styles.commandColumn}>
            <MenuHero />
            <MenuMainPanel
              onNewGame={controller.openNewGame}
              onTutorial={controller.openTutorial}
              onLoadMission={controller.openLoadMission}
              onOptions={controller.openOptions}
            />
          </div>
        </main>
      </div>

      <MenuSignalOverlay paused={controller.view !== "main"} />

      <MenuOverlay
        view={controller.view}
        code={controller.code}
        error={controller.error}
        previewLine={controller.previewLine}
        preview={controller.preview}
        copied={controller.copied}
        inputRef={controller.inputRef}
        settings={controller.settings}
        onChange={controller.setCode}
        onRandomize={controller.randomize}
        onThisWeek={controller.restoreWeekly}
        onCopyLink={controller.copyLink}
        onLaunch={controller.launch}
        onToggleSound={controller.toggleSound}
        onToggleMusic={controller.toggleMusic}
        onToggleReducedMotion={controller.toggleReducedMotion}
        onToggleHighContrast={controller.toggleHighContrast}
        onVolumeChange={controller.updateVolume}
        onBack={controller.goBack}
      />
    </div>
  );
}
