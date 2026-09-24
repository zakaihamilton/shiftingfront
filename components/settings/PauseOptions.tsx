import { useState } from "react";
import { DialogPortal } from "@/components/ui/DialogPortal";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { KeybindingsModal } from "./KeybindingsModal";
import type { AudioVolumeKey } from "@/lib/audio/mixer";
import type { GameSettings, KeyBindings } from "@/lib/persist/settings";
import { useFullscreen } from "@/lib/ui/fullscreen";
import { cachedLocalStorage, clearAllGameData } from "@/lib/persist/save";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { useModalFocus } from "@/components/ui/useModalFocus";
import { feedbackIssueUrl } from "@/lib/ui/issueReport";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import { AudioSettingsControls } from "./AudioSettingsControls";
import styles from "./SettingsPanel.module.css";

export function PauseOptions({ settings, onToggleSound, onToggleMusic, onToggleReducedMotion, onToggleHighContrast, onCycleColorblind, onCycleHudScale, onUpdateKeyBindings, onVolumeChange, onDiagnostics, onBack, onResetAllData, titleId = "pause-title", backTooltip = "Return to the pause menu" }: {
  settings: GameSettings;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onToggleReducedMotion?: () => void;
  onToggleHighContrast?: () => void;
  onCycleColorblind?: () => void;
  onCycleHudScale?: () => void;
  onUpdateKeyBindings?: (bindings: KeyBindings) => void;
  onVolumeChange: (key: AudioVolumeKey, value: number) => void;
  onDiagnostics?: () => void;
  onBack: () => void;
  onResetAllData?: () => void;
  titleId?: string;
  backTooltip?: string;
}) {
  const [keybindsOpen, setKeybindsOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [resetError, setResetError] = useState("");
  const resetDialogRef = useModalFocus(confirmResetOpen, "reset-data-dialog", "dialog");
  const fullscreen = useFullscreen();
  const handleResetAllData = () => {
    if (!clearAllGameData(cachedLocalStorage())) {
      setResetError("Some data could not be cleared. Check browser storage permissions and try again.");
      return;
    }
    setResetError("");
    setConfirmResetOpen(false);
    if (onResetAllData) onResetAllData();
    else if (typeof window !== "undefined") window.location.replace("/");
  };

  return (
    <>
      <ConsoleLabel>Options</ConsoleLabel>
      <h2 id={titleId} className={styles.title}>Game options</h2>
      <div className={styles.actions}>
        <div className={styles.toggleGrid}>
          <ConsoleButton className={styles.action} tooltip="Turn music on or off" shortcut={SHORTCUT.music} onClick={onToggleMusic}>Music: {settings.musicEnabled ? "On" : "Off"}</ConsoleButton>
          <ConsoleButton className={styles.action} tooltip="Turn sound effects on or off" shortcut={SHORTCUT.mute} onClick={onToggleSound}>Sound effects: {settings.sfxEnabled ? "On" : "Off"}</ConsoleButton>
          {onToggleReducedMotion ? <ConsoleButton className={styles.action} tooltip="Reduce interface animation and motion" onClick={onToggleReducedMotion}>Reduced motion: {settings.reducedMotion ? "On" : "Off"}</ConsoleButton> : null}
          {onToggleHighContrast ? <ConsoleButton className={styles.action} tooltip="Increase interface contrast and status differentiation" onClick={onToggleHighContrast}>High contrast: {settings.highContrast ? "On" : "Off"}</ConsoleButton> : null}
          {onCycleColorblind ? <ConsoleButton className={styles.action} tooltip="Cycle colorblind palette for lasers, health bars, and minimap" onClick={onCycleColorblind}>Colorblind: {settings.colorblindMode === "deuteranopia" ? "Deuteranopia (Red-Green)" : settings.colorblindMode === "protanopia" ? "Protanopia (Red-Weak)" : settings.colorblindMode === "tritanopia" ? "Tritanopia (Blue-Yellow)" : "Off"}</ConsoleButton> : null}
          {onCycleHudScale ? <ConsoleButton className={styles.action} tooltip="Adjust interface text and HUD scaling for readability" onClick={onCycleHudScale}>Text size: {settings.hudScale === "large" ? "Large (Readable)" : settings.hudScale === "compact" ? "Compact (Retro)" : "Normal"}</ConsoleButton> : null}
          {fullscreen.isSupported ? <ConsoleButton className={styles.action} tooltip={`Toggle browser fullscreen (${fullscreen.shortcut})`} onClick={fullscreen.toggle}>Fullscreen: {fullscreen.isFullscreen ? "On" : "Off"}</ConsoleButton> : null}
        </div>
        {onUpdateKeyBindings ? <ConsoleButton className={styles.action} tooltip="Customize keyboard shortcuts and camera controls" onClick={() => setKeybindsOpen(true)}>Configure Keybinds…</ConsoleButton> : null}
        {onDiagnostics ? <ConsoleButton className={styles.action} tooltip="View stored mission telemetry and diagnostic tools" onClick={onDiagnostics}>Diagnostics</ConsoleButton> : null}
        <div className={styles.group}>
          <ConsoleLabel className={styles.groupLabel}>Data &amp; Support</ConsoleLabel>
          <ConsoleButton muted className={styles.action} tooltip="Permanently clear all campaigns, saves, and settings" onClick={() => { setResetError(""); setConfirmResetOpen(true); }}>Reset All Game Data…</ConsoleButton>
          <a href={feedbackIssueUrl()} target="_blank" rel="noopener noreferrer" className={styles.action} style={{ textAlign: "center", textDecoration: "none" }}>Report an Issue / Feedback ↗</a>
        </div>
        <ConsoleButton muted className={styles.action} tooltip={backTooltip} shortcut={SHORTCUT.back} onClick={onBack}>Back</ConsoleButton>
      </div>
      <AudioSettingsControls settings={settings} onChange={onVolumeChange} />
      {keybindsOpen && onUpdateKeyBindings ? <KeybindingsModal bindings={settings.keyBindings} onSave={onUpdateKeyBindings} onClose={() => setKeybindsOpen(false)} /> : null}
      {confirmResetOpen ? (
        <DialogPortal>
          <div className={styles.confirmOverlay}>
            <MetalPanel ref={resetDialogRef} tabIndex={-1} className={styles.confirmDialog} role="dialog" aria-modal="true" aria-labelledby="reset-data-title">
              <ConsoleLabel as="h2" id="reset-data-title">Reset All Game Data?</ConsoleLabel>
              <p className={styles.slotCopy} style={{ marginTop: "0.5rem" }}>This will permanently erase all local campaign progress, named save slots, autosaves, and custom settings. This action cannot be undone.</p>
              {resetError ? <p className={styles.slotCopy} role="alert">{resetError}</p> : null}
              <div className={styles.slotConfirmActions}>
                <ConsoleButton muted onClick={() => { setResetError(""); setConfirmResetOpen(false); }}>Cancel</ConsoleButton>
                <ConsoleButton onClick={handleResetAllData}>Confirm Reset</ConsoleButton>
              </div>
            </MetalPanel>
          </div>
        </DialogPortal>
      ) : null}
    </>
  );
}
