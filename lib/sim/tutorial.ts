import { createCampaign } from "../gen/campaign";
import { generateMap } from "../gen/map";
import type { ReadonlyMissionDef, SimState } from "../types";
import { createMissionFromData } from "./api";

export const TUTORIAL_SEED = 0;
export { tutorialPrompt, tutorialMoveTile, enterTutorialStage } from "./tutorialStage";

export function createTutorialMission(): SimState {
  const campaign = createCampaign(TUTORIAL_SEED);
  const campaignMission = campaign.missions[0]!;
  const mission: ReadonlyMissionDef = {
    ...campaignMission,
    name: "Shifting Front Training Range",
    kind: "holdTheLine",
    win: { kind: "holdTheLine" },
    profile: undefined,
  };
  const state = createMissionFromData({
    seed: TUTORIAL_SEED,
    missionIndex: 0,
    campaign,
    mission,
    map: generateMap(TUTORIAL_SEED, mission),
  });
  state.tutorialStage = "select";
  if (state.runtime) delete state.runtime.director;
  return state;
}
