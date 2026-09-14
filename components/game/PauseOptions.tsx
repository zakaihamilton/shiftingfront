import { useState } from "react";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { AudioSettingsControls } from "@/components/audio/AudioSettingsControls";
import type { AudioVolumeKey } from "@/lib/audio/mixer";
import type { GameSettings } from "@/lib/persist/settings";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./PauseMenu.module.css";

export function PauseOptions({
  settings,
  onToggleSound,
  onToggleMusic,
  onToggleReducedMotion,
  onToggleHighContrast,
  onVolumeChange,
  onBack,
  telemetryRecordCount,
  onExportTelemetry,
  onClearTelemetry,
  titleId = "pause-title",
  backTooltip = "Return to the pause menu",
}: {
  settings: GameSettings;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onToggleReducedMotion?: () => void;
  onToggleHighContrast?: () => void;
  onVolumeChange: (key: AudioVolumeKey, value: number) => void;
  onBack: () => void;
  telemetryRecordCount?: number;
  onExportTelemetry?: () => boolean;
  onClearTelemetry?: () => boolean;
  titleId?: string;
  backTooltip?: string;
}) {
  const [telemetryNotice, setTelemetryNotice] = useState("");
  const telemetryEnabled = onExportTelemetry !== undefined && onClearTelemetry !== undefined;

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
      <ConsoleLabel>Options</ConsoleLabel>
      <h2 id={titleId} className={styles.title}>Game options</h2>
      <div className={styles.actions}>
        <ConsoleButton className={styles.action} tooltip="Turn music on or off" shortcut={SHORTCUT.music} onClick={onToggleMusic}>
          Music: {settings.musicEnabled ? "On" : "Off"}
        </ConsoleButton>
        <ConsoleButton className={styles.action} tooltip="Turn sound effects on or off" shortcut={SHORTCUT.mute} onClick={onToggleSound}>
          Sound effects: {settings.sfxEnabled ? "On" : "Off"}
        </ConsoleButton>
        {onToggleReducedMotion ? (
          <ConsoleButton className={styles.action} tooltip="Reduce interface animation and motion" onClick={onToggleReducedMotion}>
            Reduced motion: {settings.reducedMotion ? "On" : "Off"}
          </ConsoleButton>
        ) : null}
        {onToggleHighContrast ? (
          <ConsoleButton className={styles.action} tooltip="Increase interface contrast and status differentiation" onClick={onToggleHighContrast}>
            High contrast: {settings.highContrast ? "On" : "Off"}
          </ConsoleButton>
        ) : null}
        {telemetryEnabled ? (
          <div className={styles.group}>
            <ConsoleLabel className={styles.groupLabel}>Diagnostics</ConsoleLabel>
            <p className={styles.slotCopy}>Stored mission telemetry: {telemetryRecordCount ?? 0} records</p>
            <ConsoleButton className={styles.action} tooltip="Download the bounded local telemetry envelope as JSON" onClick={exportTelemetry}>
              Export Telemetry
            </ConsoleButton>
            <ConsoleButton className={styles.action} tooltip="Clear only locally stored mission telemetry" onClick={clearMissionTelemetry}>
              Clear Telemetry
            </ConsoleButton>
            {telemetryNotice ? <p className={styles.notice} role="status">{telemetryNotice}</p> : null}
          </div>
        ) : null}
        <ConsoleButton muted className={styles.action} tooltip={backTooltip} shortcut={SHORTCUT.back} onClick={onBack}>Back</ConsoleButton>
      </div>
      <AudioSettingsControls settings={settings} onChange={onVolumeChange} />
    </>
  );
}
