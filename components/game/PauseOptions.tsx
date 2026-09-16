import { useState } from "react";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { AudioSettingsControls } from "@/components/audio/AudioSettingsControls";
import { KeybindingsModal } from "./KeybindingsModal";
import type { AudioVolumeKey } from "@/lib/audio/mixer";
import type { GameSettings, KeyBindings } from "@/lib/persist/settings";
import { useFullscreen } from "@/lib/ui/fullscreen";
import { cachedLocalStorage, clearAllGameData } from "@/lib/persist/save";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { useModalFocus } from "@/components/ui/useModalFocus";
import { APP_ISSUES_URL } from "@/lib/site";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./PauseMenu.module.css";

export function PauseOptions({
  settings,
  onToggleSound,
  onToggleMusic,
  onToggleReducedMotion,
  onToggleHighContrast,
  onCycleColorblind,
  onUpdateKeyBindings,
  onVolumeChange,
  onBack,
  telemetryRecordCount,
  onExportTelemetry,
  onClearTelemetry,
  onResetAllData,
  titleId = "pause-title",
  backTooltip = "Return to the pause menu",
}: {
  settings: GameSettings;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onToggleReducedMotion?: () => void;
  onToggleHighContrast?: () => void;
  onCycleColorblind?: () => void;
  onUpdateKeyBindings?: (bindings: KeyBindings) => void;
  onVolumeChange: (key: AudioVolumeKey, value: number) => void;
  onBack: () => void;
  telemetryRecordCount?: number;
  onExportTelemetry?: () => boolean;
  onClearTelemetry?: () => boolean;
  onResetAllData?: () => void;
  titleId?: string;
  backTooltip?: string;
}) {
  const [keybindsOpen, setKeybindsOpen] = useState(false);
  const [telemetryNotice, setTelemetryNotice] = useState("");
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const resetDialogRef = useModalFocus(confirmResetOpen, "reset-data-dialog", "dialog");
  const fullscreen = useFullscreen();
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

  const handleResetAllData = () => {
    clearAllGameData(cachedLocalStorage());
    setConfirmResetOpen(false);
    if (onResetAllData) {
      onResetAllData();
    } else if (typeof window !== "undefined") {
      window.location.replace("/");
    }
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
        {onCycleColorblind ? (
          <ConsoleButton className={styles.action} tooltip="Cycle colorblind palette for lasers, health bars, and minimap" onClick={onCycleColorblind}>
            Colorblind: {settings.colorblindMode === "deuteranopia" ? "Deuteranopia (Red-Green)" : settings.colorblindMode === "protanopia" ? "Protanopia (Red-Weak)" : settings.colorblindMode === "tritanopia" ? "Tritanopia (Blue-Yellow)" : "Off"}
          </ConsoleButton>
        ) : null}
        {fullscreen.isSupported ? (
          <ConsoleButton
            className={styles.action}
            tooltip={`Toggle browser fullscreen (${fullscreen.shortcut})`}
            onClick={fullscreen.toggle}
          >
            Fullscreen: {fullscreen.isFullscreen ? "On" : "Off"}
          </ConsoleButton>
        ) : null}
        {onUpdateKeyBindings ? (
          <ConsoleButton className={styles.action} tooltip="Customize keyboard shortcuts and camera controls" onClick={() => setKeybindsOpen(true)}>
            Configure Keybinds…
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
        <div className={styles.group}>
          <ConsoleLabel className={styles.groupLabel}>Data &amp; Support</ConsoleLabel>
          <ConsoleButton
            muted
            className={styles.action}
            tooltip="Permanently clear all campaigns, saves, and settings"
            onClick={() => setConfirmResetOpen(true)}
          >
            Reset All Game Data…
          </ConsoleButton>
          <a
            href={APP_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.action}
            style={{ textAlign: "center", textDecoration: "none" }}
          >
            Report an Issue / Feedback ↗
          </a>
        </div>
        <ConsoleButton muted className={styles.action} tooltip={backTooltip} shortcut={SHORTCUT.back} onClick={onBack}>Back</ConsoleButton>
      </div>
      <AudioSettingsControls settings={settings} onChange={onVolumeChange} />
      {keybindsOpen && onUpdateKeyBindings ? (
        <KeybindingsModal
          bindings={settings.keyBindings}
          onSave={onUpdateKeyBindings}
          onClose={() => setKeybindsOpen(false)}
        />
      ) : null}
      {confirmResetOpen ? (
        <div className={styles.confirmOverlay}>
          <MetalPanel
            ref={resetDialogRef}
            tabIndex={-1}
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-data-title"
          >
            <ConsoleLabel as="h2" id="reset-data-title">
              Reset All Game Data?
            </ConsoleLabel>
            <p className={styles.slotCopy} style={{ marginTop: "0.5rem" }}>
              This will permanently erase all local campaign progress, named save slots, autosaves, and custom settings. This action cannot be undone.
            </p>
            <div className={styles.slotConfirmActions}>
              <ConsoleButton muted onClick={() => setConfirmResetOpen(false)}>
                Cancel
              </ConsoleButton>
              <ConsoleButton onClick={handleResetAllData}>
                Confirm Reset
              </ConsoleButton>
            </div>
          </MetalPanel>
        </div>
      ) : null}
    </>
  );
}
