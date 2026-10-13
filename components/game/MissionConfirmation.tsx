"use client";

import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { useModalFocus } from "@/components/ui/useModalFocus";
import type { MissionConfirmation as MissionConfirmationState } from "./hooks/missionConfirmation";
import styles from "./MissionConfirmation.module.css";

export function MissionConfirmation({
  confirmation,
  onConfirm,
  onCancel,
}: {
  confirmation: MissionConfirmationState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useModalFocus(true, confirmation.action);
  return (
    <div className={styles.overlay} data-testid="mission-confirmation">
      <MetalPanel
        ref={dialogRef}
        tabIndex={-1}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-confirmation-title"
      >
        <ConsoleLabel as="h2" id="mission-confirmation-title">{confirmation.title}</ConsoleLabel>
        <p className={styles.copy}>{confirmation.message}</p>
        <div className={styles.actions}>
          <ConsoleButton muted onClick={onCancel}>Cancel</ConsoleButton>
          <ConsoleButton onClick={onConfirm}>{confirmation.confirmLabel}</ConsoleButton>
        </div>
      </MetalPanel>
    </div>
  );
}
