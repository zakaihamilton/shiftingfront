"use client";

import { useEffect, useMemo, useState } from "react";
import { DialogPortal } from "@/components/ui/DialogPortal";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { archiveEntryKey, SaveSlotList } from "@/components/save/SaveSlotList";
import { useModalFocus } from "@/components/ui/useModalFocus";
import type { ArchiveEntry } from "@/lib/persist/save";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./PauseMenu.module.css";

export function PauseLoadSlots({
  entries,
  onLoad,
  onDelete,
  onBack,
}: {
  entries: ArchiveEntry[];
  onLoad: (entry: ArchiveEntry) => void;
  onDelete?: (entry: ArchiveEntry) => void;
  onBack: () => void;
}) {
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(() => new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pending, setPending] = useState<ArchiveEntry | null>(null);
  const confirmRef = useModalFocus(Boolean(pending), pending ? archiveEntryKey(pending) : undefined, "dialog");

  const entryList = useMemo(
    () => entries.filter((entry) => !deletedKeys.has(archiveEntryKey(entry))),
    [entries, deletedKeys],
  );

  const selectedKey = useMemo(() => {
    if (activeKey && entryList.some((e) => archiveEntryKey(e) === activeKey)) {
      return activeKey;
    }
    return entryList[0] ? archiveEntryKey(entryList[0]) : null;
  }, [activeKey, entryList]);

  const selected = useMemo(
    () => entryList.find((entry) => archiveEntryKey(entry) === selectedKey) ?? null,
    [entryList, selectedKey],
  );

  useEffect(() => {
    if (pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !selected) return;
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
      event.preventDefault();
      setPending(selected);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, selected]);

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPending(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [pending]);

  const handleDelete = (entry: ArchiveEntry) => {
    onDelete?.(entry);
    setDeletedKeys((prev) => new Set(prev).add(archiveEntryKey(entry)));
  };

  return (
    <>
      <ConsoleLabel>Save slots</ConsoleLabel>
      <h2 id="pause-title" className={styles.title}>Load mission</h2>
      <p className={styles.slotCopy}>Choose a named save or this campaign&apos;s autosave.</p>
      <SaveSlotList
        entries={entryList}
        selectedKey={selectedKey}
        showActions
        onDelete={onDelete ? handleDelete : undefined}
        onSelect={(entry) => setActiveKey(archiveEntryKey(entry))}
        onResume={(entry) => setPending(entry)}
      />
      <div className={styles.actions}>
        <ConsoleButton
          className={styles.action}
          tooltip="Restore the selected save slot"
          onClick={() => {
            if (selected) setPending(selected);
          }}
        >
          Load
        </ConsoleButton>
        <ConsoleButton muted className={styles.action} tooltip="Return to the pause menu" shortcut={SHORTCUT.back} onClick={onBack}>
          Back
        </ConsoleButton>
      </div>
      {pending ? (
        <DialogPortal>
          <div className={styles.confirmOverlay}>
            <MetalPanel
              ref={confirmRef}
              tabIndex={-1}
              className={styles.confirmDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="load-slot-title"
            >
              <ConsoleLabel as="h2" id="load-slot-title">Load mission?</ConsoleLabel>
              <p className={styles.slotCopy}>
                Load {pending.kind === "slot" ? pending.name : "the autosave for this campaign"}? Unsaved progress will be lost.
              </p>
              <div className={styles.slotConfirmActions}>
                <ConsoleButton muted onClick={() => setPending(null)}>Cancel</ConsoleButton>
                <ConsoleButton
                  onClick={() => {
                    onLoad(pending);
                    setPending(null);
                  }}
                >
                  Load mission
                </ConsoleButton>
              </div>
            </MetalPanel>
          </div>
        </DialogPortal>
      ) : null}
    </>
  );
}
