"use client";

import { useEffect, useState } from "react";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { defaultKeyBindings, type KeyBindings } from "@/lib/persist/settings";
import { displayKey } from "@/lib/ui/shortcuts";
import styles from "./KeybindingsModal.module.css";

const ACTION_LABELS: { key: keyof KeyBindings; label: string }[] = [
  { key: "panUp", label: "Pan Camera Up" }, { key: "panDown", label: "Pan Camera Down" }, { key: "panLeft", label: "Pan Camera Left" }, { key: "panRight", label: "Pan Camera Right" },
  { key: "home", label: "Jump to Command HQ" }, { key: "center", label: "Center on Selection" }, { key: "repair", label: "Repair Mode" }, { key: "sell", label: "Sell / Scrap Mode" }, { key: "stop", label: "Stop Selected Units" },
  { key: "construction", label: "Construction Tab" }, { key: "production", label: "Production Tab" }, { key: "selected", label: "Selected Tab" },
];

export function KeybindingsModal({ bindings, onSave, onClose }: { bindings: KeyBindings; onSave: (bindings: KeyBindings) => void; onClose: () => void }) {
  const [currentBindings, setCurrentBindings] = useState<KeyBindings>(bindings);
  const [activeRebind, setActiveRebind] = useState<keyof KeyBindings | null>(null);

  useEffect(() => {
    if (!activeRebind) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape" || event.key === "Tab") { setActiveRebind(null); return; }
      const rawKey = event.key === " " ? " " : event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const next = { ...currentBindings, [activeRebind]: rawKey };
      setCurrentBindings(next);
      onSave(next);
      setActiveRebind(null);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeRebind, currentBindings, onSave]);

  const handleResetDefaults = () => {
    const defaults = defaultKeyBindings();
    setCurrentBindings(defaults);
    onSave(defaults);
    setActiveRebind(null);
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <MetalPanel className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="keybinds-title" onClick={(event) => event.stopPropagation()}>
        <ConsoleLabel>Field Configuration</ConsoleLabel>
        <h2 id="keybinds-title" className={styles.title}>Keybindings</h2>
        <p className={styles.subtitle}>Click a command, then press any key to reassign it. Press Escape to cancel.</p>
        <div className={styles.list}>
          {ACTION_LABELS.map(({ key, label }) => {
            const isListening = activeRebind === key;
            return <div className={styles.row} key={key}><span className={styles.label}>{label}</span><button type="button" className={`${styles.keyButton} ${isListening ? styles.listening : ""}`} onClick={() => setActiveRebind(isListening ? null : key)} title={`Rebind ${label}`}>{isListening ? "Press key…" : displayKey(currentBindings[key])}</button></div>;
          })}
        </div>
        <div className={styles.actions}><ConsoleButton muted tooltip="Reset all shortcuts to defaults" onClick={handleResetDefaults}>Reset Defaults</ConsoleButton><ConsoleButton className={styles.action} tooltip="Save and return to options" onClick={onClose}>Done</ConsoleButton></div>
      </MetalPanel>
    </div>
  );
}
