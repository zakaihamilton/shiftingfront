"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { DocumentTitle } from "@/components/ui/DocumentTitle";
import { RASTER_ART } from "@/lib/gen/visualAssets";
import { APP_REPO_URL, APP_VERSION } from "@/lib/site";
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
      data-colorblind={controller.settings.colorblindMode}
      data-hud-scale={controller.settings.hudScale ?? "normal"}
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
            <footer className={styles.menuFooter}>
              <button
                type="button"
                className={styles.footerLink}
                onClick={controller.openCredits}
              >
                Credits
              </button>
              <span className={styles.footerDot}>·</span>
              <Link href="/privacy" className={styles.footerLink}>Privacy</Link>
              <span className={styles.footerDot}>·</span>
              <Link href="/terms" className={styles.footerLink}>Terms</Link>
              <span className={styles.footerDot}>·</span>
              <a href={APP_REPO_URL} target="_blank" rel="noopener noreferrer" className={styles.footerLink}>v{APP_VERSION}</a>
            </footer>
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
        onToggleVoice={controller.toggleVoice}
        onToggleReducedMotion={controller.toggleReducedMotion}
        onToggleHighContrast={controller.toggleHighContrast}
        onCycleColorblind={controller.cycleColorblind}
        onCycleHudScale={controller.cycleHudScale}
        onUpdateKeyBindings={controller.updateKeyBindings}
        onVolumeChange={controller.updateVolume}
        onBack={controller.goBack}
      />
    </div>
  );
}
