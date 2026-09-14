import { formatSeed } from "../seed/rng";
import type { Campaign, CampaignProgress, SimState } from "../types";
import { missionDebrief } from "../sim/debrief";
import { weeklyIndex, weeklySeed } from "@/components/menu/menuLaunch";

function shareUrl(seedStr: string): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/?seed=${seedStr}`;
  }
  return `/?seed=${seedStr}`;
}

export function formatMissionShareCard(state: SimState): string {
  const debrief = missionDebrief(state);
  const won = state.result === "won";
  const medalIcons = won ? "🎖️".repeat(debrief.battle.medals) || "🎖️" : "💀";
  const outcomeText = won ? "VICTORY" : "DEFEAT";
  const seedStr = formatSeed(state.seed);
  const missionNumber = state.missionIndex + 1;
  const friendlyLost = debrief.forces.friendly.unitsLost;
  const enemyLost = debrief.forces.enemy.unitsLost;
  const isWeekly = seedStr === weeklySeed();
  const header = isWeekly
    ? `SHIFTING FRONT Week ${weeklyIndex()} · Mission ${missionNumber}/6`
    : `SHIFTING FRONT · Mission ${missionNumber}/6`;

  return [
    header,
    `Seed ${seedStr} // ${state.missionName}`,
    `${outcomeText} ${medalIcons} (⏱️ ${debrief.battle.duration})`,
    `Score: ${debrief.battle.score.toLocaleString()} pts`,
    `Casualties: ${friendlyLost} lost · ${enemyLost} destroyed`,
    shareUrl(seedStr),
  ].join("\n");
}

export function formatCampaignShareCard(campaign: Campaign, progress: CampaignProgress): string {
  const totalPossible = campaign.missions.length * 3;
  const totalMedals = campaign.missions.reduce((sum, m) => sum + (progress.medals[String(m.index)] ?? 0), 0);
  const seedStr = formatSeed(campaign.seedNumber);

  // Six-operation emoji grid
  // 🟩 = 3 medals (Gold)
  // 🟨 = 2 medals (Silver)
  // 🟧 = 1 medal (Bronze)
  // ⬛ = Incomplete / 0 medals
  const grid = campaign.missions.map((m) => {
    const medals = progress.medals[String(m.index)] ?? 0;
    if (medals >= 3) return "🟩";
    if (medals === 2) return "🟨";
    if (medals === 1) return "🟧";
    return "⬛";
  }).join("");

  const isWeekly = seedStr === weeklySeed();
  const header = isWeekly
    ? `SHIFTING FRONT Week ${weeklyIndex()} // Theater Dossier`
    : `SHIFTING FRONT // Theater Dossier`;

  return [
    header,
    `Seed ${seedStr} · ${campaign.world.name}`,
    `${grid} (${totalMedals}/${totalPossible} Medals)`,
    `Operations: ${progress.completedMissions.length}/6 Complete`,
    shareUrl(seedStr),
  ].join("\n");
}
