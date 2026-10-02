import type { ChangeEventHandler, RefObject } from "react";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { StatusBadge } from "@/components/ui/Dossier";
import styles from "./CampaignArchiveScreen.module.css";

export function CampaignArchiveControls({
  entriesCount,
  importInputRef,
  onImportFile,
}: {
  entriesCount: number;
  importInputRef: RefObject<HTMLInputElement | null>;
  onImportFile: ChangeEventHandler<HTMLInputElement>;
}) {
  return (
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
          onChange={onImportFile}
        />
        <StatusBadge className={styles.archiveStatus} tone={entriesCount ? "success" : "muted"}>
          {entriesCount ? "Ready to resume" : "Archive empty"}
        </StatusBadge>
      </div>
    </div>
  );
}
