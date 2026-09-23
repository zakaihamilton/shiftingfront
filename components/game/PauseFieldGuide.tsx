import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { FIELD_GUIDE_TOPICS, fieldGuideEntry, type FieldGuideTopic } from "@/lib/fieldGuide";
import styles from "./PauseFieldGuide.module.css";

export function PauseFieldGuide({ seenTopics, onMarkSeen, onBack }: {
  seenTopics: readonly FieldGuideTopic[];
  onMarkSeen: (topic: FieldGuideTopic) => void;
  onBack: () => void;
}) {
  return (
    <section className={styles.guide} aria-label="Field Guide" data-testid="pause-field-guide">
      <ConsoleLabel>Operations reference</ConsoleLabel>
      <h2 id="pause-title" className={styles.title}>Field Guide</h2>
      <p className={styles.copy}>Scenario procedures and biome rules discovered by this command profile.</p>
      <div className={styles.entries}>
        {FIELD_GUIDE_TOPICS.map((topic) => {
          const entry = fieldGuideEntry(topic);
          const seen = seenTopics.includes(topic);
          return (
            <article className={styles.entry} key={topic}>
              <div className={styles.entryHeading}>
                <div>
                  <span className={styles.category}>{entry.category}</span>
                  <h3>{entry.title}</h3>
                </div>
                {seen ? <span className={styles.read}>Reviewed</span> : <ConsoleButton muted onClick={() => onMarkSeen(topic)}>Mark read</ConsoleButton>}
              </div>
              <p>{entry.text}</p>
            </article>
          );
        })}
      </div>
      <ConsoleButton className={styles.back} muted onClick={onBack}>Back to pause menu</ConsoleButton>
    </section>
  );
}
