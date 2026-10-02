import type { CSSProperties } from "react";
import { DossierSection, StatusBadge } from "@/components/ui/Dossier";
import { biomeLabel } from "@/lib/gen/names";
import { objectiveHeadline } from "@/lib/gen/story";
import { biomeArt } from "@/lib/gen/visualAssets";
import type { CampaignProgress, ReadonlyCampaign } from "@/lib/types";
import { missionMedalDisplay } from "./campaignSummary";
import styles from "./CampaignCompleteScreen.module.css";

export function CampaignMissionQueue({
  campaign,
  progress,
  completedCount,
  operations,
  finale,
  selectedMissionIndex,
  onSelectMission,
}: {
  campaign: ReadonlyCampaign;
  progress: CampaignProgress;
  completedCount: number;
  operations: boolean;
  finale: boolean;
  selectedMissionIndex: number;
  onSelectMission: (missionIndex: number) => void;
}) {
  return (
    <DossierSection
      className={`${styles.section} ${finale ? styles.finaleMissionQueue : ""}`}
      aria-labelledby="mission-record-title"
      label={operations ? "Operations" : "Mission record"}
      title={<h2 id="mission-record-title" className={styles.sectionTitle}>{operations ? "Select an operation" : "Six operations"}</h2>}
      aside={<span className={styles.sectionCount}>{completedCount}/{campaign.missions.length} complete</span>}
    >
      <div className={styles.missions}>
        {campaign.missions.map((mission, index) => {
          const medals = progress.medals[String(mission.index)] ?? 0;
          const missionComplete = progress.completedMissions.includes(mission.index);
          const available = mission.index <= progress.unlockedMission;
          const status = missionComplete ? "Completed" : available ? "Available" : "Locked";
          const action = missionComplete ? "Replay" : available ? "Deploy" : "Locked";
          const record = missionComplete
            ? `Best score ${progress.bestScores[String(mission.index)] ?? 0}`
            : available
              ? "Ready for deployment"
              : `Complete mission ${index} first`;

          return (
            <button
              key={mission.index}
              type="button"
              className={`${styles.mission} ${styles.missionButton} ${missionComplete ? styles.complete : available ? styles.available : styles.locked} ${selectedMissionIndex === mission.index ? styles.selected : ""}`}
              style={{ "--mission-art": `url("${biomeArt(mission.biome)}")` } as CSSProperties}
              aria-label={`${action} mission ${index + 1}: ${mission.name}`}
              aria-pressed={selectedMissionIndex === mission.index}
              data-testid={`mission-card-${mission.index}`}
              data-status={missionComplete ? "completed" : available ? "available" : "locked"}
              data-tooltip={`${action} mission ${index + 1}`}
              onClick={() => onSelectMission(mission.index)}
            >
              <span className={styles.missionTopline}>
                <span>
                  <b className={styles.missionNumber}>{String(index + 1).padStart(2, "0")}</b>
                  <StatusBadge
                    className={styles.missionStatus}
                    tone={missionComplete ? "success" : available ? "gold" : "muted"}
                  >
                    {status}
                  </StatusBadge>
                </span>
                <span className={styles.medals} aria-label={`${medals} of 3 medals`}>{missionMedalDisplay(medals)}</span>
              </span>
              <span className={styles.missionTitle}>{mission.name}</span>
              <span className={styles.missionMeta}>{biomeLabel(mission.biome)} · {mission.mapSize}×{mission.mapSize}</span>
              {!operations ? <span className={styles.missionObjective}>{objectiveHeadline(mission.win)}</span> : null}
              {!operations ? <span className={styles.missionRecord}>{record}</span> : null}
              <span className={styles.missionAction}>{action}</span>
            </button>
          );
        })}
      </div>
    </DossierSection>
  );
}
