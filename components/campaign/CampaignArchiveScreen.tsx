"use client";

import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { ActionRail } from "@/components/ui/Dossier";
import { RASTER_ART } from "@/lib/gen/visualAssets";
import { MenuBackdrop } from "@/components/shared/MenuBackdrop";
import { SaveSlotList } from "@/components/save/SaveSlotList";
import { CampaignArchiveControls } from "./CampaignArchiveControls";
import { CampaignArchiveRecovery } from "./CampaignArchiveRecovery";
import { useCampaignArchive } from "./useCampaignArchive";
import styles from "./CampaignArchiveScreen.module.css";

export function CampaignArchiveScreen() {
  const archive = useCampaignArchive();

  return (
    <main
      className={styles.screen}
      style={{ "--scene-art": `url("${RASTER_ART.menu}")` } as React.CSSProperties}
      data-testid="campaign-archive-screen"
    >
      <MenuBackdrop />
      <div className={styles.vignette} />
      <div className={styles.scanlines} />

      <div className={styles.uiLayer}>
        <header className={styles.topbar} aria-label="Shifting Front campaign archive status">
          <div className={styles.topbarBrand}>
            <span className={styles.brandMark}>SF</span>
            <span>SHIFTING FRONT</span>
            <span className={styles.topbarDivider}>/</span>
            <span className={styles.topbarMuted}>SAVE SLOTS</span>
          </div>
          <div className={styles.topbarStatus}>
            <span className={styles.statusDot} aria-hidden="true" />
            <span>LOCAL SAVE INDEX</span>
          </div>
        </header>

        <div className={styles.content}>
          <MetalPanel as="section" className={styles.panel} data-testid="campaign-archive" aria-labelledby="load-mission-title">
            <header className={styles.header}>
              <ConsoleLabel>Shifting Front // Save slots</ConsoleLabel>
              <h1 id="load-mission-title" className={styles.title}>Load mission</h1>
              <p className={styles.subtitle}>SELECT A SAVE SLOT</p>
              <p className={styles.copy}>Resume a named save or an autosave, inspect its operations map, or remove a slot you no longer need.</p>
            </header>

            <CampaignArchiveControls
              entriesCount={archive.entries.length}
              importInputRef={archive.importInputRef}
              onImportFile={archive.importFile}
            />
            {archive.portabilityNotice ? (
              <p className={archive.portabilityNotice.tone === "success" ? styles.importNotice : styles.importError} role="status">
                {archive.portabilityNotice.text}
              </p>
            ) : null}
            <SaveSlotList
              entries={archive.entries}
              emptyLabel="No save slots."
              expanded
              showActions
              onResume={archive.resumeEntry}
              onCampaignMap={archive.openCampaignMap}
              onExport={archive.exportEntry}
              onDelete={archive.deleteEntry}
            />

            <CampaignArchiveRecovery
              unreadableSaves={archive.unreadableSaves}
              unreadableSlots={archive.unreadableSlots}
              onResetSave={archive.resetUnreadableSave}
              onResetSlot={archive.resetUnreadableSlot}
            />

            <ActionRail className={styles.actions}>
              <ConsoleButton muted onClick={archive.returnToMenu} tooltip="Return to the main menu" shortcut="Esc">
                Return to menu
              </ConsoleButton>
            </ActionRail>
          </MetalPanel>
        </div>

        <footer className={styles.footer}>
          <span>LOCAL SAVE SLOTS</span>
          <span className={styles.footerRule} aria-hidden="true" />
          <span>RESUME / OPERATIONS / DELETE</span>
          <span className={styles.footerVersion}>ESC TO RETURN</span>
        </footer>
      </div>
    </main>
  );
}
