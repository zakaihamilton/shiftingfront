import { MISSION_MAX, MISSION_MIN, SEED_MAX, SEED_MIN } from "../../../seed/rng";
import type { CampaignProgress } from "../../../types";
import { isRecord } from "../../utils";
import { isIntegerInRange } from "./primitives";

export function isCampaignProgressShape(value: unknown): value is CampaignProgress {
  if (
    isRecord(value) &&
    value.gameplayRulesVersion !== undefined &&
    value.gameplayRulesVersion !== 1 &&
    value.gameplayRulesVersion !== 2
  ) {
    return false;
  }
  if (!isRecord(value)) return false;
  if (
    value.version !== 1 ||
    !isIntegerInRange(value.seed, SEED_MIN, SEED_MAX) ||
    typeof value.tutorialComplete !== "boolean"
  ) {
    return false;
  }
  if (!Number.isInteger(value.unlockedMission)) return false;
  const unlockedMission = value.unlockedMission as number;
  if (unlockedMission < MISSION_MIN || unlockedMission > MISSION_MAX) return false;
  if (!Array.isArray(value.completedMissions)) return false;
  if (
    value.completedMissions.some(
      (mission) => !Number.isInteger(mission) || mission < MISSION_MIN || mission > MISSION_MAX,
    )
  ) {
    return false;
  }
  if (new Set(value.completedMissions).size !== value.completedMissions.length) return false;
  if (value.completedMissions.some((mission) => mission > unlockedMission)) return false;
  if (!isRecord(value.medals) || !isRecord(value.bestScores)) return false;
  const validStats = (stats: Record<string, unknown>) =>
    Object.entries(stats).every(
      ([key, score]) =>
        /^[0-5]$/.test(key) && typeof score === "number" && Number.isFinite(score) && score >= 0,
    );
  if (
    value.deploymentEdge !== undefined &&
    value.deploymentEdge !== "veteranSquad" &&
    value.deploymentEdge !== "forwardTurret" &&
    value.deploymentEdge !== "airSortie" &&
    value.deploymentEdge !== "powerReserve"
  ) {
    return false;
  }
  return validStats(value.medals) && validStats(value.bestScores);
}
