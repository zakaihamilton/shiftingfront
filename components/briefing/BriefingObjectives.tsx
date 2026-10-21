import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import type { MissionObjective } from "@/lib/gen/story";
import styles from "./BriefingObjectives.module.css";

export function BriefingObjectives({
  objectives,
  proficiencyNote,
  groundNote,
  doctrineNote,
}: {
  objectives: MissionObjective[];
  proficiencyNote?: string;
  groundNote?: string;
  doctrineNote?: string;
}) {
  return (
    <section className={styles.section} data-testid="mission-objectives">
      <ConsoleLabel>Mission objectives</ConsoleLabel>
      {doctrineNote ? <p className={styles.note} data-testid="doctrine-note">{doctrineNote}</p> : null}
      {groundNote ? <p className={styles.note} data-testid="ground-note">{groundNote}</p> : null}
      {proficiencyNote ? <p className={styles.note} data-testid="proficiency-note">{proficiencyNote}</p> : null}
      <ol className={styles.list}>
        {objectives.map((obj, i) => (
          <li key={obj.id} className={styles.item}>
            <span className={styles.index}>{String(i + 1).padStart(2, "0")}</span>
            <span>{obj.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
