import type { Campaign, CampaignProgress } from "@/lib/types";

export function campaignSummary(campaign: Campaign, progress: CampaignProgress) {
  const completed = progress.completedMissions.length;
  const totalMedals = campaign.missions.reduce(
    (sum, mission) => sum + (progress.medals[String(mission.index)] ?? 0),
    0,
  );
  const possibleMedals = campaign.missions.length * 3;
  return {
    completed,
    totalMedals,
    possibleMedals,
    isComplete: completed >= campaign.missions.length,
  };
}

export function missionMedalDisplay(medals: number) {
  return `${"★".repeat(medals)}${"☆".repeat(Math.max(0, 3 - medals))}`;
}

export function missionUnlocks(missionIndex: number, missionCount: number): string[] {
  const unlocks: string[] = [];
  if (missionIndex < missionCount - 1) unlocks.push(`Mission ${missionIndex + 2} access`);
  if (unlocks.length === 0) unlocks.push("Campaign victory record");
  return unlocks;
}
