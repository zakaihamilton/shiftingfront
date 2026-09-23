import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import type { FieldGuideEntry } from "@/lib/fieldGuide";
import styles from "./BriefingFieldGuideCard.module.css";

export function BriefingFieldGuideCard({ entries, onDismiss, compact = false }: { entries: readonly FieldGuideEntry[]; onDismiss: () => void; compact?: boolean }) {
  if (entries.length === 0) return null;
  return (
    <section className={`${styles.card}${compact ? ` ${styles.compact}` : ""}`} aria-label="First encounter field guide" data-testid="field-guide-first-encounter">
      <div className={styles.heading}>
        <div>
          <ConsoleLabel>Field guide · first encounter</ConsoleLabel>
          <h2 className={styles.title}>New operational intelligence</h2>
        </div>
        <ConsoleButton muted onClick={onDismiss}>Dismiss</ConsoleButton>
      </div>
      <div className={styles.entries}>
        {entries.map((entry) => (
          <article className={styles.entry} key={entry.id}>
            <span className={styles.category}>{entry.category}</span>
            <h3>{entry.title}</h3>
            <p>{entry.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
