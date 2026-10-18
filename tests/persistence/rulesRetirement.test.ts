import { describe, expect, it } from "vitest";
import { freshCampaignProgress } from "../../lib/persist/campaign";
import { planSeedRetirement, progressAfterRetiredBattlefield } from "../../lib/persist/rulesRetirement";
import { makeFixture } from "../../lib/sim/fixtures";

function legacyState(missionIndex = 0) {
  const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
  state.gameplayRulesVersion = 1;
  state.missionIndex = missionIndex;
  return state;
}

describe("rules 1 retirement", () => {
  it("leaves a rules 2 campaign untouched", () => {
    const current = legacyState();
    current.gameplayRulesVersion = 2;
    expect(planSeedRetirement({
      seed: 421,
      progress: freshCampaignProgress(421),
      autosave: current,
      slots: [],
      journal: null,
    })).toBeNull();
  });

  it("upgrades rules 1 progress without a notice when no battlefield remains", () => {
    const plan = planSeedRetirement({
      seed: 421,
      progress: { ...freshCampaignProgress(421), gameplayRulesVersion: 1, unlockedMission: 1, completedMissions: [0], medals: { "0": 2 }, bestScores: { "0": 30 } },
      autosave: null,
      slots: [],
      journal: null,
    });
    expect(plan?.rebuilt).toBe(false);
    expect(plan?.dropAutosave).toBe(false);
    expect(plan?.progress).toMatchObject({ gameplayRulesVersion: 2, unlockedMission: 1, completedMissions: [0], medals: { "0": 2 } });
  });

  it("keeps the further campaign record and the mission that was in progress", () => {
    const plan = planSeedRetirement({
      seed: 421,
      progress: { ...freshCampaignProgress(421), gameplayRulesVersion: 1, unlockedMission: 1, completedMissions: [0], medals: { "0": 1 }, bestScores: { "0": 10 } },
      autosave: legacyState(2),
      slots: [{
        id: "abcdef12",
        state: legacyState(1),
        campaign: { ...freshCampaignProgress(421), gameplayRulesVersion: 1, unlockedMission: 1, completedMissions: [0], medals: { "0": 3 }, bestScores: { "0": 90 } },
      }],
      journal: null,
    });
    expect(plan?.rebuilt).toBe(true);
    expect(plan?.dropAutosave).toBe(true);
    expect(plan?.dropSlotIds).toEqual(["abcdef12"]);
    expect(plan?.progress).toMatchObject({
      gameplayRulesVersion: 2,
      unlockedMission: 2,
      completedMissions: [0],
      medals: { "0": 3 },
      bestScores: { "0": 90 },
    });
  });

  it("merges an imported rules 1 record ahead of the stored campaign", () => {
    const stored = { ...freshCampaignProgress(421), unlockedMission: 1, completedMissions: [0], medals: { "0": 1 }, bestScores: { "0": 5 } };
    const incoming = { ...freshCampaignProgress(421), gameplayRulesVersion: 1 as const, unlockedMission: 2, completedMissions: [0, 1], medals: { "1": 2 }, bestScores: { "1": 40 } };
    expect(progressAfterRetiredBattlefield(stored, incoming, 2)).toMatchObject({
      gameplayRulesVersion: 2,
      unlockedMission: 2,
      completedMissions: [0, 1],
      medals: { "0": 1, "1": 2 },
      bestScores: { "0": 5, "1": 40 },
    });
  });
});
