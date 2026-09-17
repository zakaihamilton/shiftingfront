"use client";

import { useEffect, useMemo, useState } from "react";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { SaveSlotList } from "@/components/save/SaveSlotList";
import { useModalFocus } from "@/components/ui/useModalFocus";
import type { ArchiveEntry, SlotMeta } from "@/lib/persist/save";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./PauseMenu.module.css";

export function PauseSaveSlots({
  defaultName,
  slots,
  onCommit,
  onDelete,
  onBack,
}: {
  defaultName: string;
  slots: SlotMeta[];
  onCommit: (name: string, overwriteId: string | null) => boolean;
  onDelete?: (entry: ArchiveEntry) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<SlotMeta | null>(null);
  const overwriteDialogRef = useModalFocus(Boolean(pendingOverwrite), pendingOverwrite?.id, "dialog");

  const visibleSlots = useMemo(
    () => slots.filter((slot) => !deletedIds.has(slot.id)),
    [slots, deletedIds],
  );

  const entries: ArchiveEntry[] = useMemo(
    () => visibleSlots.map((slot) => ({ ...slot, kind: "slot" })),
    [visibleSlots],
  );

  useEffect(() => {
    if (!pendingOverwrite) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPendingOverwrite(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [pendingOverwrite]);

  const save = (overwriteId: string | null) => {
    if (!onCommit(name, overwriteId)) return;
    setPendingOverwrite(null);
  };

  const handleDelete = (entry: ArchiveEntry) => {
    onDelete?.(entry);
    if (entry.kind === "slot") {
      setDeletedIds((prev) => new Set(prev).add(entry.id));
      if (selectedId === entry.id) {
        setSelectedId(null);
        setName(defaultName);
      }
    }
  };

  const submitSave = () => {
    const selected = visibleSlots.find((slot) => slot.id === selectedId) ?? null;
    if (selected) setPendingOverwrite(selected);
    else save(null);
  };

  return (
    <>
      <ConsoleLabel>Save slots</ConsoleLabel>
      <h2 id="pause-title" className={styles.title}>Save mission</h2>
      <p className={styles.slotCopy}>Name this save, or pick a slot to overwrite.</p>
      <label className={styles.slotName}>
        <span>Save name</span>
        <input
          value={name}
          maxLength={40}
          autoComplete="off"
          aria-label="Save slot name"
          onChange={(event) => {
            setSelectedId(null);
            setName(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitSave();
            } else if (event.key === "Escape") {
              event.preventDefault();
              onBack();
            }
          }}
        />
      </label>
      <SaveSlotList
        entries={entries}
        emptyLabel="No named save slots yet."
        selectedKey={selectedId ? `slot:${selectedId}` : null}
        showActions
        onDelete={onDelete ? handleDelete : undefined}
        onSelect={(entry) => {
          if (entry.kind !== "slot") return;
          if (selectedId === entry.id) {
            setSelectedId(null);
            setName(defaultName);
          } else {
            setSelectedId(entry.id);
            setName(entry.name);
          }
        }}
      />
      <div className={styles.actions}>
        <ConsoleButton
          className={styles.action}
          tooltip={selectedId ? "Overwrite the selected save slot" : "Write a new named save slot"}
          onClick={submitSave}
        >
          Save
        </ConsoleButton>
        <ConsoleButton muted className={styles.action} tooltip="Return to the pause menu" shortcut={SHORTCUT.back} onClick={onBack}>
          Back
        </ConsoleButton>
      </div>
      {pendingOverwrite ? (
        <div className={styles.confirmOverlay}>
          <MetalPanel
            ref={overwriteDialogRef}
            tabIndex={-1}
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overwrite-slot-title"
          >
            <ConsoleLabel as="h2" id="overwrite-slot-title">Overwrite save slot?</ConsoleLabel>
            <p className={styles.slotCopy}>Replace {pendingOverwrite.name}? The previous snapshot cannot be recovered.</p>
            <div className={styles.slotConfirmActions}>
              <ConsoleButton muted onClick={() => setPendingOverwrite(null)}>Cancel</ConsoleButton>
              <ConsoleButton onClick={() => save(pendingOverwrite.id)}>Overwrite</ConsoleButton>
            </div>
          </MetalPanel>
        </div>
      ) : null}
    </>
  );
}
