import { ConsoleButton } from "@/components/ui/ConsoleButton";
import styles from "./CampaignArchiveScreen.module.css";

export function CampaignArchiveRecovery({
  unreadableSaves,
  unreadableSlots,
  onResetSave,
  onResetSlot,
}: {
  unreadableSaves: string[];
  unreadableSlots: string[];
  onResetSave: (seed: string) => void;
  onResetSlot: (id: string) => void;
}) {
  if (!unreadableSaves.length && !unreadableSlots.length) return null;

  return (
    <div className={styles.recovery} role="alert">
      {unreadableSaves.length ? (
        <span>Damaged save{unreadableSaves.length === 1 ? "" : "s"}: {unreadableSaves.join(", ")}</span>
      ) : null}
      {unreadableSlots.length ? (
        <span>Damaged slot{unreadableSlots.length === 1 ? "" : "s"}: {unreadableSlots.join(", ")}</span>
      ) : null}
      {unreadableSaves.map((seed) => (
        <ConsoleButton key={seed} tooltip={`Remove damaged save ${seed}`} onClick={() => onResetSave(seed)}>
          Reset {seed}
        </ConsoleButton>
      ))}
      {unreadableSlots.map((id) => (
        <ConsoleButton key={id} tooltip={`Remove damaged save slot ${id}`} onClick={() => onResetSlot(id)}>
          Reset {id.slice(0, 8)}
        </ConsoleButton>
      ))}
    </div>
  );
}
