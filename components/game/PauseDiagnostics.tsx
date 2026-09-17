import { useState } from "react";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./PauseMenu.module.css";

export function PauseDiagnostics({
  telemetryRecordCount,
  onExportTelemetry,
  onClearTelemetry,
  onBack,
}: {
  telemetryRecordCount?: number;
  onExportTelemetry?: () => boolean;
  onClearTelemetry?: () => boolean;
  onBack: () => void;
}) {
  const [telemetryNotice, setTelemetryNotice] = useState("");

  const exportTelemetry = () => {
    const exported = onExportTelemetry?.() ?? false;
    setTelemetryNotice(exported ? "Telemetry exported." : "Telemetry export unavailable.");
  };

  const clearMissionTelemetry = () => {
    if (typeof window !== "undefined" && !window.confirm("Clear all locally stored mission telemetry? This does not affect saves or campaign progress.")) {
      return;
    }
    const cleared = onClearTelemetry?.() ?? false;
    setTelemetryNotice(cleared ? "Telemetry cleared." : "Telemetry could not be cleared.");
  };

  return (
    <>
      <ConsoleLabel>Diagnostics</ConsoleLabel>
      <h2 id="pause-title" className={styles.title}>Diagnostics</h2>
      <div className={styles.actions}>
        <div className={styles.group}>
          <p className={styles.slotCopy}>Stored mission telemetry: {telemetryRecordCount ?? 0} records</p>
          <ConsoleButton className={styles.action} tooltip="Download the bounded local telemetry envelope as JSON" onClick={exportTelemetry}>
            Export Telemetry
          </ConsoleButton>
          <ConsoleButton className={styles.action} tooltip="Clear only locally stored mission telemetry" onClick={clearMissionTelemetry}>
            Clear Telemetry
          </ConsoleButton>
          {telemetryNotice ? <p className={styles.notice} role="status">{telemetryNotice}</p> : null}
        </div>
        <ConsoleButton muted className={styles.action} tooltip="Return to game options" shortcut={SHORTCUT.back} onClick={onBack}>Back</ConsoleButton>
      </div>
    </>
  );
}
