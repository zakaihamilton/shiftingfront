import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { ArtBackedCard, StatusBadge } from "@/components/ui/Dossier";
import type { ReadonlyMissionDef, SecondaryObjective } from "@/lib/types";
import { biomeLabel } from "@/lib/gen/names";
import { biomeArt } from "@/lib/gen/visualAssets";
import styles from "./CampaignCompleteScreen.module.css";

export function CampaignMissionDetail({
  mission,
  missionComplete,
  missionAvailable,
  primaryObjective,
  primaryRequirements,
  optionalObjectives,
  timeLimit,
  expectedDuration,
  unlocks,
  launchLabel,
  finale,
  onLaunch,
}: {
  mission: ReadonlyMissionDef;
  missionComplete: boolean;
  missionAvailable: boolean;
  primaryObjective?: string;
  primaryRequirements: SecondaryObjective[];
  optionalObjectives: SecondaryObjective[];
  timeLimit?: string;
  expectedDuration: string;
  unlocks: string[];
  launchLabel: string;
  finale: boolean;
  onLaunch: () => void;
}) {
  return (
    <ArtBackedCard
      as="section"
      className={`${styles.detail} ${finale ? styles.finaleDetail : ""}`}
      art={biomeArt(mission.biome)}
      aria-labelledby="mission-detail-title"
      data-testid="mission-detail"
    >
      <div className={styles.detailHeader}>
        <div>
          <ConsoleLabel>Mission detail</ConsoleLabel>
          <h2 id="mission-detail-title" className={styles.detailTitle}>Mission {mission.index + 1}{" // "}{mission.name}</h2>
        </div>
        <StatusBadge className={styles.detailStatus} tone={missionComplete ? "success" : missionAvailable ? "gold" : "muted"}>
          {missionComplete ? "Completed" : missionAvailable ? "Available" : "Locked"}
        </StatusBadge>
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.detailBlock}>
          <span>Primary objective</span>
          <strong>{primaryObjective}</strong>
        </div>
        <div className={styles.detailBlock}>
          <span>Primary requirements</span>
          <ul>{primaryRequirements.map((objective) => <li key={objective.id}>{objective.label}</li>)}</ul>
        </div>
        {optionalObjectives.length > 0 ? (
          <div className={styles.detailBlock}>
            <span>Bonus objectives</span>
            <ul>{optionalObjectives.map((objective) => <li key={objective.id}>{objective.label}</li>)}</ul>
          </div>
        ) : null}
        <div className={styles.detailBlock}>
          <span>{timeLimit ? "Time limit" : "Expected duration"}</span>
          <strong>{timeLimit ?? expectedDuration}</strong>
        </div>
        <div className={styles.detailBlock}>
          <span>Campaign</span>
          <strong>{biomeLabel(mission.biome)} · {mission.mapSize}×{mission.mapSize}</strong>
        </div>
        <div className={styles.detailBlock}>
          <span>Unlocks after completion</span>
          <ul>{unlocks.map((unlock) => <li key={unlock}>{unlock}</li>)}</ul>
        </div>
      </div>

      <div className={styles.detailActions}>
        {missionAvailable ? (
          <ConsoleButton onClick={onLaunch} data-testid="launch-selected-mission" tooltip={`${launchLabel} from the mission detail panel`}>
            {launchLabel}
          </ConsoleButton>
        ) : (
          <span className={styles.lockedMessage}>Complete mission {mission.index} to unlock this operation.</span>
        )}
      </div>
    </ArtBackedCard>
  );
}
