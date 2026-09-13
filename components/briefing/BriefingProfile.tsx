import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import type { MissionProfileContract } from "@/lib/gen/profile";
import styles from "./BriefingProfile.module.css";

export function BriefingProfile({ contract }: { contract: MissionProfileContract }) {
  return (
    <details className={styles.section} aria-label="Tactical profile" data-testid="briefing-profile">
      <summary className={styles.heading}>
        <span className={styles.summaryLabel}>
          <span className={styles.chevron} aria-hidden="true">▸</span>
          <ConsoleLabel>Tactical profile</ConsoleLabel>
        </span>
        <strong>{contract.label}</strong>
      </summary>
      <div className={styles.details}>
        <p className={styles.emphasis}>{contract.emphasis}</p>
        <dl className={styles.planGrid}>
          <div>
            <dt>Opening</dt>
            <dd>{contract.openingOrder}</dd>
          </div>
          <div>
            <dt>Fallback</dt>
            <dd>{contract.fallback}</dd>
          </div>
          <div>
            <dt>What changes</dt>
            <dd>{contract.routeHint}</dd>
          </div>
        </dl>
      </div>
    </details>
  );
}
