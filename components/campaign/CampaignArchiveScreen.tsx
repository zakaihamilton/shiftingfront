"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { ActionRail, StatusBadge } from "./CampaignDossier";
import { RASTER_ART } from "@/lib/gen/visualAssets";
import {
  cachedLocalStorage,
  exportSlot,
  importSlot,
  listArchiveEntries,
  listUnreadableSaves,
  listUnreadableSlots,
  removeSave,
  removeSlot,
  type ArchiveEntry,
} from "@/lib/persist/save";
import { MenuBackdrop } from "@/components/menu/MenuBackdrop";
import { SaveSlotList } from "@/components/menu/SaveSlotList";
import styles from "./CampaignArchiveScreen.module.css";

function safeExportName(value: string): string {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "slot";
}

export function CampaignArchiveScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [unreadableSaves, setUnreadableSaves] = useState<string[]>([]);
  const [unreadableSlots, setUnreadableSlots] = useState<string[]>([]);
  const [portabilityNotice, setPortabilityNotice] = useState<{ tone: "success" | "alert"; text: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const refreshSaves = useCallback(() => {
    const storage = cachedLocalStorage();
    setEntries(listArchiveEntries(storage));
    setUnreadableSaves(listUnreadableSaves(storage));
    setUnreadableSlots(listUnreadableSlots(storage));
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(refreshSaves);
    return () => cancelAnimationFrame(frame);
  }, [refreshSaves]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      router.push("/");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const deleteEntry = useCallback((entry: ArchiveEntry) => {
    const storage = cachedLocalStorage();
    if (entry.kind === "slot") removeSlot(storage, entry.id);
    else removeSave(storage, Number(entry.seed));
    refreshSaves();
  }, [refreshSaves]);

  const resetUnreadableSave = useCallback((seed: string) => {
    removeSave(cachedLocalStorage(), Number(seed));
    refreshSaves();
  }, [refreshSaves]);

  const resetUnreadableSlot = useCallback((id: string) => {
    removeSlot(cachedLocalStorage(), id);
    refreshSaves();
  }, [refreshSaves]);

  const exportEntry = useCallback((entry: ArchiveEntry) => {
    if (entry.kind !== "slot") return;
    const raw = exportSlot(cachedLocalStorage(), entry.id);
    if (!raw) {
      setPortabilityNotice({ tone: "alert", text: `Could not export ${entry.name}. The slot may be damaged.` });
      return;
    }
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `shiftingfront-${entry.seed}-${safeExportName(entry.name)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setPortabilityNotice({ tone: "success", text: `Exported ${entry.name}.` });
  }, []);

  const importFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const result = importSlot(cachedLocalStorage(), await file.text());
      if (!result.ok) {
        setPortabilityNotice({ tone: "alert", text: "Could not import that file. It is invalid or unsupported." });
        return;
      }
      setPortabilityNotice({ tone: "success", text: "Imported save as a new named slot." });
      refreshSaves();
    } catch {
      setPortabilityNotice({ tone: "alert", text: "Unable to read that save file." });
    }
  }, [refreshSaves]);

  const resumeEntry = useCallback((entry: ArchiveEntry) => {
    if (entry.kind === "slot") {
      router.push(`/play?seed=${entry.seed}&mission=${entry.missionIndex}&slot=${entry.id}`);
      return;
    }
    router.push(`/play?seed=${entry.seed}&resume=1&mission=${entry.missionIndex}`);
  }, [router]);

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

            <div className={styles.archiveHeader}>
              <ConsoleLabel as="h2">Save slots</ConsoleLabel>
              <div className={styles.archiveControls}>
                <ConsoleButton
                  muted
                  className={styles.importButton}
                  onClick={() => importInputRef.current?.click()}
                  tooltip="Import a named save slot from a JSON file"
                >
                  IMPORT JSON
                </ConsoleButton>
                <input
                  ref={importInputRef}
                  className={styles.hiddenInput}
                  type="file"
                  accept="application/json,.json"
                  aria-label="Import named save slot JSON"
                  onChange={importFile}
                />
                <StatusBadge className={styles.archiveStatus} tone={entries.length ? "success" : "muted"}>
                  {entries.length ? "Ready to resume" : "Archive empty"}
                </StatusBadge>
              </div>
            </div>
            {portabilityNotice ? (
              <p className={portabilityNotice.tone === "success" ? styles.importNotice : styles.importError} role="status">
                {portabilityNotice.text}
              </p>
            ) : null}
            <SaveSlotList
              entries={entries}
              emptyLabel="No save slots."
              expanded
              showActions
              onResume={resumeEntry}
              onCampaignMap={(seed) => router.push(`/campaign?seed=${seed}`)}
              onExport={exportEntry}
              onDelete={deleteEntry}
            />

            {unreadableSaves.length || unreadableSlots.length ? (
              <div className={styles.recovery} role="alert">
                {unreadableSaves.length ? (
                  <span>Damaged save{unreadableSaves.length === 1 ? "" : "s"}: {unreadableSaves.join(", ")}</span>
                ) : null}
                {unreadableSlots.length ? (
                  <span>Damaged slot{unreadableSlots.length === 1 ? "" : "s"}: {unreadableSlots.join(", ")}</span>
                ) : null}
                {unreadableSaves.map((seed) => (
                  <ConsoleButton key={seed} tooltip={`Remove damaged save ${seed}`} onClick={() => resetUnreadableSave(seed)}>
                    Reset {seed}
                  </ConsoleButton>
                ))}
                {unreadableSlots.map((id) => (
                  <ConsoleButton key={id} tooltip={`Remove damaged save slot ${id}`} onClick={() => resetUnreadableSlot(id)}>
                    Reset {id.slice(0, 8)}
                  </ConsoleButton>
                ))}
              </div>
            ) : null}

            <ActionRail className={styles.actions}>
              <ConsoleButton muted onClick={() => router.push("/")} tooltip="Return to the main menu" shortcut="Esc">
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
