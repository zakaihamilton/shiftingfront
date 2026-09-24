import {
  generateBriefing,
  missionObjectives,
  objectivePhrase,
} from "./story/index";

export * from "./story/index";

export function generateStory() {
  return { generateBriefing, objectivePhrase, missionObjectives };
}
