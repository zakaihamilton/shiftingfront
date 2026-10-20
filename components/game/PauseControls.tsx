import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { useShortcutLabel } from "@/components/ui/useShortcutLabel";
import { defaultKeyBindings, type KeyBindings } from "@/lib/persist/settings";
import { displayKey, SHORTCUT } from "@/lib/ui/shortcuts";
import styles from "./PauseMenu.module.css";

function controlRows(bindings: KeyBindings): { label: string; keys: string }[] {
  const pan = `${displayKey(bindings.panUp)}${displayKey(bindings.panLeft)}${displayKey(bindings.panDown)}${displayKey(bindings.panRight)} / arrows`;
  return [
    { label: "Pause / resume", keys: SHORTCUT.pause },
    { label: "Controls", keys: SHORTCUT.controls },
    { label: "Pan camera", keys: pan },
    { label: "Jump to Command HQ", keys: displayKey(bindings.home) },
    { label: "Center selection", keys: displayKey(bindings.center) },
    { label: "Construction / production / selected", keys: `${displayKey(bindings.construction)} / ${displayKey(bindings.production)} / ${displayKey(bindings.selected)}` },
    { label: "Cameos", keys: "Alt+1–6" },
    { label: "Repair / sell / stop", keys: `${displayKey(bindings.repair)} / ${displayKey(bindings.sell)} / ${displayKey(bindings.stop)}` },
    { label: "Select", keys: "Left click / drag" },
    { label: "Select all of type", keys: "Double-click" },
    { label: "Move / attack / harvest", keys: "Right click" },
    { label: "Attack-move", keys: "Ctrl + right click" },
    { label: "Set production rally point", keys: "Select producer + right click ground" },
    { label: "Recall control group", keys: "1–9" },
    { label: "Assign control group", keys: "Ctrl/Cmd + 1–9" },
  ];
}

export function PauseControls({ onBack, keyBindings }: { onBack: () => void; keyBindings?: KeyBindings }) {
  const cameoShortcut = useShortcutLabel("Alt+1–6");
  const rows = controlRows(keyBindings ?? defaultKeyBindings());
  return (
    <>
      <ConsoleLabel>Field manual</ConsoleLabel>
      <h2 id="pause-title" className={styles.title}>Controls</h2>
      <dl className={styles.controlList} data-testid="pause-controls">
        {rows.map((row) => (
          <div className={styles.controlRow} key={row.label}>
            <dt>{row.label}</dt>
            <dd><kbd>{row.label === "Cameos" ? cameoShortcut : row.keys}</kbd></dd>
          </div>
        ))}
      </dl>
      <div className={styles.actions}>
        <ConsoleButton muted className={styles.action} tooltip="Return to the pause menu" shortcut={SHORTCUT.back} onClick={onBack}>
          Back
        </ConsoleButton>
      </div>
    </>
  );
}
