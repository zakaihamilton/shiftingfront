import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { SHORTCUT } from "@/lib/ui/shortcuts";
import { FORMATION_OPTIONS, STANCE_OPTIONS } from "@/lib/ui/orders";
import type { Formation, Stance } from "@/lib/types";
import { triggerHaptic } from "@/lib/ui/haptics";
import styles from "./SelectionPanel.module.css";

export function SelectionOrders({
  stance,
  formation,
  onStop,
  onStance,
  onFormation,
}: {
  stance: Stance;
  formation: Formation | undefined;
  onStop: () => void;
  onStance: (stance: Stance) => void;
  onFormation: (formation: Formation) => void;
}) {
  return (
    <div className={styles.orders} data-testid="unit-orders">
      <ConsoleButton
        className={styles.order}
        data-testid="selected-action-stop"
        tooltip="Stop selected units"
        shortcut={SHORTCUT.stop}
        aria-keyshortcuts="x"
        onClick={() => {
          triggerHaptic("tap");
          onStop();
        }}
      >
        Stop
      </ConsoleButton>
      <div className={styles.orderGroup} role="group" aria-label="Stance">
        {STANCE_OPTIONS.map((item) => (
          <ConsoleButton
            key={item.id}
            className={styles.order}
            data-testid={`selected-action-stance-${item.id}`}
            aria-pressed={stance === item.id}
            muted={stance !== item.id}
            onClick={() => {
              triggerHaptic("tap");
              onStance(item.id);
            }}
          >
            {item.label}
          </ConsoleButton>
        ))}
      </div>
      <div className={styles.orderGroup} role="group" aria-label="Formation">
        {FORMATION_OPTIONS.map((item) => (
          <ConsoleButton
            key={item.id}
            className={styles.order}
            data-testid={`selected-action-formation-${item.id}`}
            aria-pressed={formation === item.id}
            muted={formation !== item.id}
            onClick={() => {
              triggerHaptic("tap");
              onFormation(item.id);
            }}
          >
            {item.label}
          </ConsoleButton>
        ))}
      </div>
    </div>
  );
}
