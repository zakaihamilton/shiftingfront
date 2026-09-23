import { createCampaign } from "../gen/campaign";
import { generateMap } from "../gen/map";
import type { ReadonlyMissionDef, SimState } from "../types";
import { createMissionFromData } from "./api";
import { entitiesFor } from "./ecs/world";

export const TUTORIAL_SEED = 0;
export {
  advanceTutorialAfterTick,
  enterTutorialStage,
  tutorialBuildTile,
  tutorialCommandCompletesStage,
  tutorialFocusPoint,
  tutorialMoveTile,
  tutorialPrompt,
  tutorialSelectionCompletesStage,
  tutorialStageIndex,
  tutorialTargets,
  TUTORIAL_STAGES,
  type TutorialWorldTarget,
} from "./tutorialStage";

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
  for (const entity of entitiesFor(state)) {
    if (entity.owner !== 1 || entity.hp <= 0) continue;
    entity.stance = "hold";
    entity.idle = true;
    entity.attackTarget = undefined;
    entity.orderMode = undefined;
    entity.orderDestination = undefined;
    entity.path = [];
    entity.flowGoal = undefined;
    entity.routePending = false;
  }
  return state;
}
