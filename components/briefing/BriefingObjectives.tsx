import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import type { MissionObjective } from "@/lib/gen/story";
import styles from "./BriefingObjectives.module.css";

export function BriefingObjectives({ objectives, proficiencyNote }: { objectives: MissionObjective[]; proficiencyNote?: string }) {
  return (
    <section className={styles.section} data-testid="mission-objectives">
      <ConsoleLabel>Mission objectives</ConsoleLabel>
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
