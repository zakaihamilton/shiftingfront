import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { BIOME_RULE_TEXT } from "@/lib/fieldGuide";
import type { BiomeName } from "@/lib/types";
import styles from "./BriefingFieldConditions.module.css";

export function BriefingFieldConditions({ biome }: { biome: BiomeName }) {
  return (
    <section className={styles.panel} aria-label="Field conditions">
      <div>
        <ConsoleLabel>Field conditions · {biome}</ConsoleLabel>
        <p className={styles.rule}>{BIOME_RULE_TEXT[biome]}</p>
      </div>
      <p className={styles.note}>Active feature regions are outlined on the battlefield.</p>
    </section>
  );
}
