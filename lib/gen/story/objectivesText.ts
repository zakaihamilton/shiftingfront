import { labelFor } from "../../catalog";
import type {
  BuildingKind,
  Campaign,
  ReadonlyMissionDef,
  ReadonlyWinCategory,
  UnitKind,
} from "../../types";
import { missionTimeLimitLabel } from "../objectives";
import { formatMissionMinutesFromTicks } from "../pacing";

export function countedLabel(kind: UnitKind | BuildingKind, count: number): string {
  const label = labelFor(kind).toLowerCase();
  if (count === 1) return label;
  if (kind === "barracks") return "barracks";
  if (kind === "infantry") return "infantry";
  if (kind === "antiArmor") return "anti-armor units";
  return `${label}s`;
}

export function holdDurationLabel(ticks: number): string {
  return formatMissionMinutesFromTicks(ticks);
}

export function scenarioTimeLimitLabel(win: ReadonlyWinCategory): string {
  return missionTimeLimitLabel({ kind: win.kind, ticks: win.ticks ?? 3600 })!;
}

export function objectivePhrase(win: ReadonlyWinCategory): string {
  switch (win.kind) {
    case "harvestQuota":
      return `extract ${win.target} credits from the field`;
    case "forceQuota":
      return win.role
        ? `train ${win.target} ${countedLabel(win.role, win.target ?? 0)}`
        : `train ${win.target} combat units`;
    case "structureQuota":
      return win.building
        ? `build ${win.target} ${countedLabel(win.building, win.target ?? 0)}`
        : `raise ${win.target} structures`;
    case "destroyMarked":
      return `destroy the ${win.targetCount ?? 1} marked enemy structures`;
    case "razeAll":
      return "level every enemy building";
    case "decapitate":
      return `destroy the enemy ${labelFor("constructionYard")}`;
    case "annihilate":
      return "wipe out every enemy unit and building";
    case "holdTheLine":
      return `hold this ground for ${holdDurationLabel(win.ticks ?? 0)}`;
    case "escort":
      return `escort ${win.targetCount ?? 1} convoy units to extraction within ${scenarioTimeLimitLabel(win)}`;
    case "sabotage":
      return `sabotage ${win.targetCount ?? 1} enemy systems within ${scenarioTimeLimitLabel(win)}`;
    case "rescue":
      return `rescue ${win.targetCount ?? 1} stranded units within ${scenarioTimeLimitLabel(win)}`;
    case "extraction":
      return `extract ${win.targetCount ?? 1} assets within ${scenarioTimeLimitLabel(win)}`;
    default:
      return "complete the assigned objective";
  }
}

export function objectiveHeadline(win: ReadonlyWinCategory): string {
  const phrase = objectivePhrase(win);
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export type MissionObjective = {
  id: string;
  text: string;
};

export function missionObjectives(
  mission: Pick<ReadonlyMissionDef, "win" | "index">,
  campaign: Pick<Campaign, "world" | "factions">,
): MissionObjective[] {
  const win = mission.win;
  const [us, them] = campaign.factions;
  const place = campaign.world.name;
  const winText = (() => {
    switch (win.kind) {
      case "harvestQuota":
        return `Extract ${win.target} credits from ${place}`;
      case "forceQuota":
        return win.role
          ? `Train ${win.target} ${countedLabel(win.role, win.target ?? 0)} for the ${us.name}`
          : `Train ${win.target} combat units for the ${us.name}`;
      case "structureQuota":
        return win.building
          ? `Build ${win.target} ${countedLabel(win.building, win.target ?? 0)}`
          : `Raise ${win.target} structures on ${place}`;
      case "destroyMarked":
        return `Destroy the ${win.targetCount ?? 1} marked enemy structures`;
      case "razeAll":
        return `Level every ${them.name} building`;
      case "decapitate":
        return `Destroy the ${them.name} ${labelFor("constructionYard")}`;
      case "annihilate":
        return `Wipe out all ${them.name} forces`;
      case "holdTheLine":
        return `Hold ${place} for ${holdDurationLabel(win.ticks ?? 0)}`;
      case "escort":
        return `Escort the convoy through ${place} within ${scenarioTimeLimitLabel(win)}`;
      case "sabotage":
        return `Sabotage ${win.targetCount ?? 1} enemy systems within ${scenarioTimeLimitLabel(win)}`;
      case "rescue":
        return `Contact and return ${win.targetCount ?? 1} stranded units within ${scenarioTimeLimitLabel(win)}`;
      case "extraction":
        return `Extract ${win.targetCount ?? 1} assets from ${place} within ${scenarioTimeLimitLabel(win)}`;
      default:
        return "Complete the assigned objective";
    }
  })();
  return [
    { id: "win", text: winText },
    { id: "yard", text: `Protect our ${labelFor("constructionYard")}` },
    {
      id: "campaign",
      text: `Hold ${place} against the ${them.name}`,
    },
  ];
}
