"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { ConsoleLabel } from "@/components/ui/ConsoleLabel";
import { DocumentTitle } from "@/components/ui/DocumentTitle";
import { MetalPanel } from "@/components/ui/MetalPanel";
import { ActionRail, MetricCluster } from "@/components/ui/Dossier";
import { createCampaign } from "@/lib/gen/campaign";
import { missionDurationMinutesFor, missionTimeLimitLabel, secondaryObjectivesForMissionSeed } from "@/lib/gen/objectives";
import { missionObjectives } from "@/lib/gen/story";
import { biomeArt, RASTER_ART } from "@/lib/gen/visualAssets";
import { formatSeed } from "@/lib/seed/rng";
import { APP_NAME } from "@/lib/site";
import { objectivePriorityFor } from "@/lib/sim/objectives";
import { createMission } from "@/lib/sim/api";
import { briefingPath } from "@/lib/navigation/routes";
import styles from "./CampaignCompleteScreen.module.css";
import { campaignSummary, missionUnlocks } from "./campaignSummary";
import { CampaignMissionQueue } from "./CampaignMissionQueue";
import { CampaignMissionDetail } from "./CampaignMissionDetail";
import { useCampaignProgress } from "@/components/shared/useCampaignProgress";
import { formatCampaignShareCard } from "@/lib/ui/shareCard";

export function CampaignCompleteScreen({ seed, mode = "record" }: { seed: number; mode?: "record" | "operations" }) {
  const router = useRouter();
  const progress = useCampaignProgress(seed);
  const campaign = useMemo(() => createCampaign(seed, progress.gameplayRulesVersion), [seed, progress.gameplayRulesVersion]);
  const summary = campaignSummary(campaign, progress);
  const operations = mode === "operations";
  const finale = !operations && summary.isComplete;
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      router.push("/");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

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
  const selectedSecondaryObjectives = useMemo(() => selectedMission
    ? campaign.gameplayRulesVersion === 2
      ? createMission({ seed, missionIndex: selectedMission.index, gameplayRulesVersion: 2 }).runtime?.secondary ?? []
      : secondaryObjectivesForMissionSeed(seed, selectedMission)
    : [], [seed, selectedMission, campaign.gameplayRulesVersion]);
  const selectedPrimaryObjectives = selectedSecondaryObjectives.filter((objective) => objectivePriorityFor(objective.id, objective.priority) === "primary");
  const selectedOptionalObjectives = selectedSecondaryObjectives.filter((objective) => objectivePriorityFor(objective.id, objective.priority) === "optional");
  const selectedUnlocks = selectedMission ? missionUnlocks(selectedMission.index, campaign.missions.length) : [];
  const selectedTimeLimit = selectedMission ? missionTimeLimitLabel(selectedMission.win) : undefined;
  const selectedExpectedDuration = selectedMission
    ? `~${Math.max(1, missionDurationMinutesFor(seed, selectedMission.index, selectedMission.win.kind))} min`
    : "";
  const selectedLaunchLabel = selectedMissionComplete
    ? `Replay mission ${selectedMissionIndex + 1}`
    : `Deploy mission ${selectedMissionIndex + 1}`;

  const missionQueue = (
    <CampaignMissionQueue
      campaign={campaign}
      progress={progress}
      completedCount={summary.completed}
      operations={operations}
      finale={finale}
      selectedMissionIndex={selectedMissionIndex}
      onSelectMission={setSelectedMissionIndex}
    />
  );

  const missionDetail = selectedMission ? (
    <CampaignMissionDetail
      mission={selectedMission}
      missionComplete={selectedMissionComplete}
      missionAvailable={selectedMissionAvailable}
      primaryObjective={selectedObjectives[0]?.text}
      primaryRequirements={selectedPrimaryObjectives}
      optionalObjectives={selectedOptionalObjectives}
      timeLimit={selectedTimeLimit}
      expectedDuration={selectedExpectedDuration}
      unlocks={selectedUnlocks}
      launchLabel={selectedLaunchLabel}
      finale={finale}
      onLaunch={() => launchMission(selectedMission.index)}
    />
  ) : null;

  return (
    <main
      className={`${styles.screen} ${operations ? styles.operationsScreen : ""} ${finale ? styles.finaleScreen : ""}`}
      style={{ "--scene-art": `url("${finale ? biomeArt(campaign.world.biome) : RASTER_ART.victory}")` } as React.CSSProperties}
    >
      <DocumentTitle title={APP_NAME} />
      <div className={styles.vignette} />
      <div className={styles.content}>
        <MetalPanel
          className={`${styles.panel} ${operations ? styles.operationsPanel : ""} ${finale ? styles.finalePanel : ""}`}
          data-testid={operations ? "operations-panel" : "campaign-complete-panel"}
          data-complete={finale ? "true" : "false"}
        >
          <header className={`${styles.header} ${finale ? styles.finaleHeader : ""}`}>
            <div className={styles.headerIdentity}>
              <ConsoleLabel>{operations ? "Campaign status" : finale ? "Final campaign debrief" : "Strategic command record"}</ConsoleLabel>
              <h1 className={styles.title}>{operations ? "Operations map" : summary.isComplete ? "Campaign complete" : "Campaign record"}</h1>
              <p className={styles.subtitle}>{operations ? "SELECT DEPLOYMENT" : finale ? `${summary.completed} OPERATIONS SECURED // COMMAND RECORD FINALIZED` : summary.isComplete ? "CAMPAIGN SECURED" : "PROGRESS ARCHIVED"}</p>
            </div>
            <div className={`${styles.headerContext} ${finale ? styles.finaleContext : ""}`} aria-label="Campaign context">
              <span className={styles.contextSeed}>SEED {formatSeed(seed)}</span>
              <strong>{campaign.world.name}</strong>
              <span>{campaign.factions[0].name}</span>
            </div>
          </header>

          <MetricCluster
            className={`${styles.summary} ${finale ? styles.finaleSummary : ""}`}
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

          <ActionRail className={`${styles.actions} ${finale ? styles.finaleActions : ""}`}>
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
