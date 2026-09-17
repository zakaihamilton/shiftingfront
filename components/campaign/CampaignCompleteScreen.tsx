"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { DocumentTitle } from "@/components/ui/DocumentTitle";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { ActionRail, ArtBackedCard, DossierSection, MetricCluster, StatusBadge } from "./CampaignDossier";
import { createCampaign } from "@/lib/gen/campaign";
import { missionDurationMinutesFor, missionTimeLimitLabel, secondaryObjectivesForMissionSeed } from "@/lib/gen/objectives";
import { missionObjectives, objectiveHeadline } from "@/lib/gen/story";
import { biomeLabel } from "@/lib/gen/names";
import { biomeArt, RASTER_ART } from "@/lib/gen/visualAssets";
import { formatSeed } from "@/lib/seed/rng";
import { APP_NAME } from "@/lib/site";
import { objectivePriorityFor } from "@/lib/sim/objectives";
import { briefingPath } from "../game/hooks/missionRoutes";
import styles from "./CampaignCompleteScreen.module.css";
import { campaignSummary, missionMedalDisplay, missionUnlocks } from "./campaignSummary";
import { useCampaignProgress } from "./useCampaignProgress";
import { formatCampaignShareCard } from "@/lib/ui/shareCard";

export function CampaignCompleteScreen({ seed, mode = "record" }: { seed: number; mode?: "record" | "operations" }) {
  const router = useRouter();
  const campaign = useMemo(() => createCampaign(seed), [seed]);
  const progress = useCampaignProgress(seed);
  const summary = campaignSummary(campaign, progress);
  const operations = mode === "operations";
  const [selectedMissionIndex, setSelectedMissionIndex] = useState(() => Math.min(progress.unlockedMission, campaign.missions.length - 1));
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    try {
      const card = formatCampaignShareCard(campaign, progress);
      await navigator.clipboard?.writeText(card);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!operations) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      router.push("/");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [operations, router]);

  const launchMission = (missionIndex: number) => {
    router.push(briefingPath(seed, missionIndex, false, "campaign"));
  };
  const selectedMission = campaign.missions[selectedMissionIndex];
  const selectedMissionComplete = selectedMission
    ? progress.completedMissions.includes(selectedMission.index)
    : false;
  const selectedMissionAvailable = selectedMission
    ? selectedMission.index <= progress.unlockedMission
    : false;
  const selectedObjectives = selectedMission ? missionObjectives(selectedMission, campaign) : [];
  const selectedSecondaryObjectives = selectedMission ? secondaryObjectivesForMissionSeed(seed, selectedMission) : [];
  const selectedPrimaryObjectives = selectedSecondaryObjectives.filter((objective) => objectivePriorityFor(objective.id) === "primary");
  const selectedOptionalObjectives = selectedSecondaryObjectives.filter((objective) => objectivePriorityFor(objective.id) === "optional");
  const selectedUnlocks = selectedMission ? missionUnlocks(selectedMission.index, campaign.missions.length) : [];
  const selectedTimeLimit = selectedMission ? missionTimeLimitLabel(selectedMission.win) : undefined;
  const selectedLaunchLabel = selectedMissionComplete
    ? `Replay mission ${selectedMissionIndex + 1}`
    : `Deploy mission ${selectedMissionIndex + 1}`;

  const missionQueue = (
    <DossierSection
      className={styles.section}
      aria-labelledby="mission-record-title"
      label={operations ? "Operations" : "Mission record"}
      title={<h2 id="mission-record-title" className={styles.sectionTitle}>{operations ? "Select an operation" : "Six operations"}</h2>}
      aside={<span className={styles.sectionCount}>{summary.completed}/{campaign.missions.length} complete</span>}
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
          const card = (
            <>
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
            </>
          );

          return (
            <button
              key={mission.index}
              type="button"
              className={`${styles.mission} ${styles.missionButton} ${missionComplete ? styles.complete : available ? styles.available : styles.locked} ${selectedMissionIndex === mission.index ? styles.selected : ""}`}
              style={{ "--mission-art": `url("${biomeArt(mission.biome)}")` } as React.CSSProperties}
              aria-label={`${action} mission ${index + 1}: ${mission.name}`}
              aria-pressed={selectedMissionIndex === mission.index}
              data-testid={`mission-card-${mission.index}`}
              data-status={missionComplete ? "completed" : available ? "available" : "locked"}
              data-tooltip={`${action} mission ${index + 1}`}
              onClick={() => setSelectedMissionIndex(mission.index)}
            >
              {card}
            </button>
          );
        })}
      </div>
    </DossierSection>
  );

  const missionDetail = selectedMission ? (
    <ArtBackedCard
      as="section"
      className={styles.detail}
      art={biomeArt(selectedMission.biome)}
      aria-labelledby="mission-detail-title"
      data-testid="mission-detail"
    >
      <div className={styles.detailHeader}>
        <div>
          <ConsoleLabel>Mission detail</ConsoleLabel>
          <h2 id="mission-detail-title" className={styles.detailTitle}>Mission {selectedMission.index + 1}{" // "}{selectedMission.name}</h2>
        </div>
        <StatusBadge className={styles.detailStatus} tone={selectedMissionComplete ? "success" : selectedMissionAvailable ? "gold" : "muted"}>
          {selectedMissionComplete ? "Completed" : selectedMissionAvailable ? "Available" : "Locked"}
        </StatusBadge>
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.detailBlock}>
          <span>Primary objective</span>
          <strong>{selectedObjectives[0]?.text}</strong>
        </div>
        <div className={styles.detailBlock}>
          <span>Primary requirements</span>
          <ul>
            {selectedPrimaryObjectives.map((objective) => <li key={objective.id}>{objective.label}</li>)}
          </ul>
        </div>
        {selectedOptionalObjectives.length > 0 ? (
          <div className={styles.detailBlock}>
            <span>Bonus objectives</span>
            <ul>
              {selectedOptionalObjectives.map((objective) => <li key={objective.id}>{objective.label}</li>)}
            </ul>
          </div>
        ) : null}
        <div className={styles.detailBlock}>
          <span>{selectedTimeLimit ? "Time limit" : "Expected duration"}</span>
          <strong>{selectedTimeLimit ?? `~${Math.max(1, missionDurationMinutesFor(seed, selectedMission.index, selectedMission.win.kind))} min`}</strong>
        </div>
        <div className={styles.detailBlock}>
          <span>Campaign</span>
          <strong>{biomeLabel(selectedMission.biome)} · {selectedMission.mapSize}×{selectedMission.mapSize}</strong>
        </div>
        <div className={styles.detailBlock}>
          <span>Unlocks after completion</span>
          <ul>
            {selectedUnlocks.map((unlock) => <li key={unlock}>{unlock}</li>)}
          </ul>
        </div>
      </div>

      <div className={styles.detailActions}>
        {selectedMissionAvailable ? (
          <ConsoleButton onClick={() => launchMission(selectedMission.index)} data-testid="launch-selected-mission" tooltip={`${selectedLaunchLabel} from the mission detail panel`}>
            {selectedLaunchLabel}
          </ConsoleButton>
        ) : (
          <span className={styles.lockedMessage}>Complete mission {selectedMission.index} to unlock this operation.</span>
        )}
      </div>
    </ArtBackedCard>
  ) : null;

  return (
    <main
      className={`${styles.screen} ${operations ? styles.operationsScreen : ""}`}
      style={{ "--scene-art": `url("${RASTER_ART.victory}")` } as React.CSSProperties}
    >
      <DocumentTitle title={APP_NAME} />
      <div className={styles.vignette} />
      <div className={styles.content}>
        <MetalPanel
          className={`${styles.panel} ${operations ? styles.operationsPanel : ""}`}
          data-testid={operations ? "operations-panel" : "campaign-complete-panel"}
        >
          <header className={styles.header}>
            <div className={styles.headerIdentity}>
              <ConsoleLabel>{operations ? "Campaign status" : "Strategic command record"}</ConsoleLabel>
              <h1 className={styles.title}>{operations ? "Operations map" : summary.isComplete ? "Campaign complete" : "Campaign record"}</h1>
              <p className={styles.subtitle}>{operations ? "SELECT DEPLOYMENT" : summary.isComplete ? "CAMPAIGN SECURED" : "PROGRESS ARCHIVED"}</p>
            </div>
            <div className={styles.headerContext} aria-label="Campaign context">
              <span className={styles.contextSeed}>SEED {formatSeed(seed)}</span>
              <strong>{campaign.world.name}</strong>
              <span>{campaign.factions[0].name}</span>
            </div>
          </header>

          <MetricCluster
            className={styles.summary}
            aria-label="Campaign summary"
            items={[
              {
                label: "Missions",
                value: <strong>{summary.completed} <small>/ {campaign.missions.length}</small></strong>,
                progress: (summary.completed / campaign.missions.length) * 100,
                tone: "gold",
              },
              {
                label: "Medals",
                value: <strong>{summary.totalMedals} <small>/ {summary.possibleMedals}</small></strong>,
                progress: (summary.totalMedals / summary.possibleMedals) * 100,
                tone: "cyan",
              },
            ]}
          />

          {operations ? (
            <div className={styles.operationsBody} data-testid="operations-body">
              {missionQueue}
              {missionDetail}
            </div>
          ) : (
            <>
              {missionQueue}
              {missionDetail}
            </>
          )}

          <ActionRail className={styles.actions}>
            <ConsoleButton
              tooltip={copied ? "Campaign dossier copied to clipboard!" : "Copy campaign score to clipboard"}
              onClick={handleShare}
            >
              {copied ? "Copied!" : "Share dossier"}
            </ConsoleButton>
            <ConsoleButton muted onClick={() => router.push("/")} tooltip="Return to the main menu">Return to menu</ConsoleButton>
          </ActionRail>
        </MetalPanel>
      </div>
    </main>
  );
}
