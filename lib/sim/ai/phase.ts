import type { MissionDirectorPhase, SimState } from "../../types";
import { aiDifficultyMission, missionDifficulty } from "../difficulty";

export function directorPhase(state: SimState): MissionDirectorPhase {
  if (state.tutorialStage !== undefined) return "opening";
  return state.runtime?.director?.phase
    ?? (state.tick >= missionDifficulty(aiDifficultyMission(state)).enemyAssaultEvery ? "pressure" : "opening");
}
