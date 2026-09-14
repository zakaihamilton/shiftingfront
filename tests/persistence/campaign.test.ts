import { describe, expect, it } from "vitest";
import { campaignKey, completeMission, freshCampaignProgress, readCampaignProgress, recordWonCampaignProgress, writeCampaignProgress } from "../../lib/persist/campaign";
import { memoryStorage } from "../../lib/persist/save";
import { makeFixture } from "../../lib/sim/fixtures";

describe("campaign progress", () => {
  it("persists per-seed progress and unlocks only the next mission", () => {
    const storage = memoryStorage();
    const progress = freshCampaignProgress(42);
    const first = completeMission(progress, 0, 3, 900);
    writeCampaignProgress(storage, first);
    const loaded = readCampaignProgress(storage, 42);
    expect(loaded.unlockedMission).toBe(1);
    expect(loaded.completedMissions).toEqual([0]);
    expect(readCampaignProgress(storage, 43).completedMissions).toEqual([]);
  });

  it("does not duplicate completions on replay and keeps the best medal and score", () => {
    const progress = completeMission(freshCampaignProgress(7), 0, 2, 500);
    const replay = completeMission(progress, 0, 3, 700);
    expect(replay.completedMissions).toEqual([0]);
    expect(replay.unlockedMission).toBe(1);
    expect(replay.medals["0"]).toBe(3);
    expect(replay.bestScores["0"]).toBe(700);
  });

  it("normalizes duplicate and invalid records from local storage", () => {
    const storage = memoryStorage();
    storage.setItem(campaignKey(42), JSON.stringify({
      version: 1,
      progress: {
        ...freshCampaignProgress(42),
        unlockedMission: 1,
        completedMissions: [0, 0, 2, 8, -1],
        medals: { "0": 2, "8": 3, invalid: 99, "1": -1 },
        bestScores: { "0": 500, "9": 900, invalid: 1000 },
      },
    }));

    expect(readCampaignProgress(storage, 42)).toEqual({
      ...freshCampaignProgress(42),
      unlockedMission: 1,
      completedMissions: [0],
      medals: { "0": 2 },
      bestScores: { "0": 500 },
    });
  });

  it("returns false when campaign progress cannot be written", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("quota exceeded");
    };

    expect(writeCampaignProgress(storage, freshCampaignProgress(42))).toBe(false);
  });

  it("records a won mission and ignores in-progress missions", () => {
    const storage = memoryStorage();
    const playing = makeFixture({ seed: 42, win: { kind: "annihilate" } });
    expect(recordWonCampaignProgress(storage, playing)).toBe(true);
    expect(readCampaignProgress(storage, 42).completedMissions).toEqual([]);

    const won = makeFixture({ seed: 42, win: { kind: "annihilate" } });
    won.result = "won";
    expect(recordWonCampaignProgress(storage, won)).toBe(true);
    expect(readCampaignProgress(storage, 42)).toMatchObject({
      unlockedMission: 1,
      completedMissions: [0],
    });
  });
});
