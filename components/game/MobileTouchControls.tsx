import { ConsoleButton } from "@/components/ui/ConsoleButton";
import type { MobileCommand } from "./mobileCommandTypes";
import styles from "./CommandSidebar.module.css";

const COMMANDS: { id: MobileCommand; label: string }[] = [
  { id: "move", label: "Move" },
  { id: "attack", label: "Attack" },
  { id: "attackMove", label: "Attack-move" },
  { id: "harvest", label: "Harvest" },
];

export function mobileCommandLabel(command: MobileCommand | null) {
  return COMMANDS.find((item) => item.id === command)?.label ?? "Ready";
}

export function MobileTouchControls({
  selectedCount,
  hasUnitSelection,
  selectionMode,
  activeCommand,
  onCommand,
  onSelectionMode,
  onStop,
}: {
  selectedCount: number;
  hasUnitSelection: boolean;
  selectionMode: boolean;
  activeCommand: MobileCommand | null;
  onCommand: (command: MobileCommand) => void;
  onSelectionMode: (active: boolean) => void;
  onStop: () => void;
}) {
  const selectionStatus = selectionMode ? "Select units" : selectedCount > 0 ? `${selectedCount} selected` : "No selection";
  const commandStatus = selectionMode ? "Drag a box around friendly units" : activeCommand ? `${mobileCommandLabel(activeCommand)} ready` : "Touch controls";

  return (
    <section className={styles.touchControls} data-testid="mobile-touch-controls">
      <div className={styles.touchStatus} aria-live="polite">
        <strong data-tooltip={selectionStatus}>{selectionStatus}</strong>
        <span data-tooltip={commandStatus}>{commandStatus}</span>
      </div>
      <div className={styles.touchActions}>
        <ConsoleButton
          className={styles.touchButton}
          aria-pressed={selectionMode}
          data-testid="mobile-select-mode"
          tooltip={selectionMode ? "Cancel unit selection" : "Select units"}
          onClick={() => onSelectionMode(!selectionMode)}
        >
          {selectionMode ? "Cancel" : "Select"}
        </ConsoleButton>
        {hasUnitSelection ? (
          <>
            {COMMANDS.map(({ id, label }) => (
              <ConsoleButton
                key={id}
                className={styles.touchButton}
                aria-pressed={activeCommand === id}
                data-testid={`mobile-command-${id}`}
                tooltip={label}
                onClick={() => onCommand(id)}
              >
                {label}
              </ConsoleButton>
            ))}
            <ConsoleButton className={styles.touchButton} data-testid="mobile-command-stop" tooltip="Stop selected units" onClick={onStop}>
              Stop
            </ConsoleButton>
          </>
        ) : null}
      </div>
    </section>
  );
}
