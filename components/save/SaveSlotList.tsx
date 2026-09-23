"use client";

import { useEffect, useState } from "react";
import { DialogPortal } from "@/components/ui/DialogPortal";
import { StatusBadge } from "@/components/ui/Dossier";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { useModalFocus } from "@/components/ui/useModalFocus";
import type { ArchiveEntry } from "@/lib/persist/save";
import { formatMissionDuration } from "@/lib/sim/debrief";
import { cx } from "@/lib/ui/cx";
import styles from "./SaveSlotList.module.css";

export function archiveEntryKey(entry: ArchiveEntry): string {
  return entry.kind === "slot" ? `slot:${entry.id}` : `autosave:${entry.seed}`;
}

export function archiveEntryLabel(entry: ArchiveEntry): string {
  const detail = `${entry.campaignName} · Mission ${entry.missionIndex + 1} · Duration ${formatMissionDuration(entry.tick)}`;
  return entry.kind === "slot" ? `${entry.name} · ${detail}` : `AUTOSAVE · ${detail}`;
}

export function SaveSlotList({
  entries,
  emptyLabel = "No save slots.",
  expanded = false,
  selectedKey = null,
  showActions = false,
  onSelect,
  onResume,
  onCampaignMap,
  onExport,
  onDelete,
}: {
  entries: ArchiveEntry[];
  emptyLabel?: string;
  expanded?: boolean;
  selectedKey?: string | null;
  showActions?: boolean;
  onSelect?: (entry: ArchiveEntry) => void;
  onResume?: (entry: ArchiveEntry) => void;
  onCampaignMap?: (seed: string) => void;
  onExport?: (entry: ArchiveEntry) => void;
  onDelete?: (entry: ArchiveEntry) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<ArchiveEntry | null>(null);
  const deleteDialogRef = useModalFocus(Boolean(pendingDelete), pendingDelete ? archiveEntryKey(pendingDelete) : undefined, "dialog");

  useEffect(() => {
    if (!pendingDelete) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPendingDelete(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [pendingDelete]);

  return (
    <>
      <div className={styles.block}>
        <div className={`${styles.listWrap} ${expanded ? styles.expanded : ""}`}>
          {entries.length === 0 ? (
            <p className={styles.empty}>{emptyLabel}</p>
          ) : (
            <ul className={styles.list}>
              {entries.map((entry) => {
                const key = archiveEntryKey(entry);
                const selected = selectedKey === key;
                return (
                  <li className={cx(styles.row, !showActions && styles.rowSingle)} key={key}>
                    <ConsoleButton
                      muted={!selected}
                      className={cx(styles.item, selected && styles.selected)}
                      data-kind={entry.kind}
                      data-result={entry.result}
                      aria-pressed={onSelect ? selected : undefined}
                      aria-label={onResume ? (entry.kind === "slot" ? `Resume ${entry.name}` : `Resume ${entry.campaignName} autosave`) : (entry.kind === "slot" ? `Select ${entry.name}` : `Select ${entry.campaignName} autosave`)}
                      tooltip={onResume ? (entry.kind === "slot" ? `Resume ${entry.name}` : `Resume ${entry.campaignName} autosave`) : (entry.kind === "slot" ? `Select ${entry.name}` : `Select ${entry.campaignName} autosave`)}
                      onClick={() => {
                        onSelect?.(entry);
                        onResume?.(entry);
                      }}
                    >
                      <StatusBadge className={styles.itemMarker} tone={entry.kind === "slot" ? "gold" : "cyan"} aria-hidden="true">
                        {entry.kind === "slot" ? "S" : "A"}
                      </StatusBadge>
                      <span className={styles.itemCopy}>
                        <strong className={styles.itemTitle}>{entry.kind === "slot" ? entry.name : "Autosave"}</strong>
                        <span className={styles.itemCampaign}>{entry.campaignName}</span>
                      </span>
                      <span className={styles.itemMeta} aria-hidden="true">
                        <span>MISSION {String(entry.missionIndex + 1).padStart(2, "0")}</span>
                        <span>{formatMissionDuration(entry.tick)}</span>
                      </span>
                    </ConsoleButton>
                    {showActions && onCampaignMap ? <ConsoleButton muted className={styles.operations} aria-label={`Open operations for ${entry.campaignName} campaign`} tooltip={`Open operations for ${entry.campaignName} campaign`} onClick={() => onCampaignMap(entry.seed)}>OPS</ConsoleButton> : null}
                    {showActions && onExport && entry.kind === "slot" ? <ConsoleButton muted className={styles.export} aria-label={`Export save slot ${entry.name}`} tooltip={`Export save slot ${entry.name}`} onClick={() => onExport(entry)}>EXPORT</ConsoleButton> : null}
                    {showActions && onDelete ? (
                      <ConsoleButton muted className={styles.delete} aria-label={entry.kind === "slot" ? `Delete save slot ${entry.name}` : `Delete autosave for ${entry.campaignName}`} tooltip={entry.kind === "slot" ? `Delete save slot ${entry.name}` : `Delete autosave for ${entry.campaignName}`} onClick={() => setPendingDelete(entry)}>
                        <svg className={styles.deleteIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg>
                      </ConsoleButton>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {pendingDelete ? (
        <DialogPortal>
          <div className={styles.confirmOverlay}>
            <MetalPanel ref={deleteDialogRef} tabIndex={-1} className={styles.confirmDialog} role="dialog" aria-modal="true" aria-labelledby="delete-save-title">
              <ConsoleLabel as="h2" id="delete-save-title">{pendingDelete.kind === "slot" ? "Delete save slot?" : "Delete autosave?"}</ConsoleLabel>
              <p className={styles.confirmCopy}>{pendingDelete.kind === "slot" ? `Delete ${pendingDelete.name}? This save slot cannot be recovered.` : `Delete the autosave for ${pendingDelete.campaignName}? This saved campaign cannot be recovered.`}</p>
              <div className={styles.confirmActions}>
                <ConsoleButton muted onClick={() => setPendingDelete(null)}>Cancel</ConsoleButton>
                <ConsoleButton className={styles.confirmDelete} onClick={() => { onDelete?.(pendingDelete); setPendingDelete(null); }}>{pendingDelete.kind === "slot" ? "Delete save slot" : "Delete autosave"}</ConsoleButton>
              </div>
            </MetalPanel>
          </div>
        </DialogPortal>
      ) : null}
    </>
  );
}
