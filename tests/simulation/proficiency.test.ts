import { describe, expect, it } from "vitest";
import { createMission } from "../../lib/sim/api";
import { tickAi } from "../../lib/sim/ai";
import { tryBuildTurret } from "../../lib/sim/ai/building";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { missionDifficulty } from "../../lib/sim/difficulty";
import { decodeSavedState, encodeSavedState } from "../../lib/persist/save/serialize";
import { isStateShape } from "../../lib/persist/save/validation";
import { sharedProductionQueue } from "../../lib/sim/producerState";
import {
  adaptiveCombatWant,
  adaptiveDifficultyShift,
  briefingProficiencyNote,
  campaignProficiencyBand,
  livePressureFromForces,
  retreatEnterHealth,
  type CampaignProficiencyRecord,
} from "../../lib/sim/proficiency";
import type { SimState } from "../../lib/types";

function cleanWin(overrides: Partial<CampaignProficiencyRecord> = {}): CampaignProficiencyRecord {
  return {
    result: "won",
    deadlineOutcome: "completed",
    casualties: 1,
    hqHealthAtEnd: 0.92,
    secondaryObjectivesCompleted: 1,
    secondaryObjectivesTotal: 1,
    primaryCompletedTick: 3600,
    ...overrides,
  };
}

function failedBattle(overrides: Partial<CampaignProficiencyRecord> = {}): CampaignProficiencyRecord {
  return {
    result: "lost",
    deadlineOutcome: "timedOut",
    casualties: 14,
    hqHealthAtEnd: 0,
    secondaryObjectivesCompleted: 0,
    secondaryObjectivesTotal: 1,
    ...overrides,
  };
}

function economyFixture(missionIndex: number, band?: -1 | 1): SimState {
  const state = makeFixture({ width: 40, height: 40, win: { kind: "destroyMarked", targetCount: 1 } });
  state.missionIndex = missionIndex;
  if (band) state.proficiencyBand = band;
  addBuilding(state, 1, "constructionYard", 4, 4);
  addBuilding(state, 1, "power", 8, 4);
  addBuilding(state, 1, "refinery", 4, 9);
  addBuilding(state, 1, "barracks", 10, 8);
  addBuilding(state, 1, "factory", 14, 4);
  addUnit(state, 1, "harvester", 6, 14);
  addBuilding(state, 0, "constructionYard", 34, 34);
  state.credits[1] = 5000;
  state.runtime = {
    kind: "destroyMarked",
    phase: "active",
    targetIds: [],
    rescued: 0,
    required: 1,
    secondary: [],
    director: { phase: "opening", pressureStart: 10_000, finaleStart: 20_000, eventCount: 0 },
  };
  return state;
}

function isTraining(state: SimState): boolean {
  return Boolean(
    sharedProductionQueue(state, 1, "barracks").producing
    || sharedProductionQueue(state, 1, "factory").producing,
  );
}

describe("campaign proficiency", () => {
  it("stays neutral until two finished battles", () => {
    expect(campaignProficiencyBand([])).toBe(0);
    expect(campaignProficiencyBand([cleanWin()])).toBe(0);
    expect(campaignProficiencyBand([cleanWin(), { ...cleanWin(), result: "playing" }])).toBe(0);
  });

  it("raises the band after recent clean wins and lowers it after losses", () => {
    expect(campaignProficiencyBand([cleanWin(), cleanWin()])).toBe(1);
    expect(campaignProficiencyBand([failedBattle(), failedBattle()])).toBe(-1);
    expect(campaignProficiencyBand([cleanWin(), failedBattle()])).toBe(0);
    expect(campaignProficiencyBand([
      cleanWin({ hqHealthAtEnd: 0.2 }),
      cleanWin({ hqHealthAtEnd: 0.1 }),
    ])).toBe(-1);
  });

  it("ignores command friction when the battles themselves were clean", () => {
    const noisy = { ...cleanWin(), commandRejections: 40 };
    expect(campaignProficiencyBand([noisy, noisy])).toBe(1);
  });

  it("describes only a non-neutral band, and never a harder opening mission", () => {
    expect(briefingProficiencyNote(1, 2)).toBe("The opponent is pressing harder.");
    expect(briefingProficiencyNote(-1, 2)).toBe("The opponent is easing off.");
    expect(briefingProficiencyNote(0, 3)).toBeUndefined();
    expect(briefingProficiencyNote(1, 0)).toBeUndefined();
    expect(briefingProficiencyNote(-1, 0)).toBe("The opponent is easing off.");
  });
});

describe("adaptive shift", () => {
  it("stacks the campaign band with live pressure and caps the opening mission", () => {
    expect(adaptiveDifficultyShift({ missionIndex: 3, proficiencyBand: 1 }, 1)).toBe(2);
    expect(adaptiveDifficultyShift({ missionIndex: 3, proficiencyBand: -1 }, -1)).toBe(-2);
    expect(adaptiveDifficultyShift({ missionIndex: 0, proficiencyBand: 1 }, 1)).toBe(0);
    expect(adaptiveDifficultyShift({ missionIndex: 0, proficiencyBand: -1 }, 0)).toBe(-1);
    expect(adaptiveDifficultyShift({ missionIndex: 4, multiplayer: true, proficiencyBand: 1 }, 1)).toBe(0);
    expect(adaptiveDifficultyShift({ missionIndex: 4, tutorialStage: "attack", proficiencyBand: 1 }, 1)).toBe(0);
  });

  it("reads only visible force, bases, and the known command post", () => {
    expect(livePressureFromForces({
      phase: "pressure",
      playerCombat: 6,
      enemyCombat: 2,
      playerBases: 1,
      enemyBases: 1,
      openingYardThreat: false,
      playerHqHealthRatio: 1,
      enemyUnitLosses: 0,
    })).toBe(1);
    expect(livePressureFromForces({
      phase: "opening",
      playerCombat: 1,
      enemyCombat: 1,
      playerBases: 0,
      enemyBases: 1,
      openingYardThreat: true,
      enemyUnitLosses: 0,
    })).toBe(1);
    expect(livePressureFromForces({
      phase: "pressure",
      playerCombat: 1,
      enemyCombat: 5,
      playerBases: 1,
      enemyBases: 1,
      openingYardThreat: false,
      playerHqHealthRatio: 0.4,
      enemyUnitLosses: 0,
    })).toBe(-1);
    expect(livePressureFromForces({
      phase: "pressure",
      playerCombat: 0,
      enemyCombat: 6,
      playerBases: 0,
      enemyBases: 1,
      openingYardThreat: false,
      enemyUnitLosses: 0,
    })).toBe(0);
  });

  it("keeps the neutral counter mix and prefers a hard counter when the player is ahead", () => {
    const rolls: number[] = [];
    const roll = (chance: number) => {
      rolls.push(chance);
      return false;
    };
    expect(adaptiveCombatWant({ tanks: 0, infantry: 0, antiArmor: 0 }, 0, roll)).toBe("infantry");
    expect(rolls).toEqual([0.4]);
    expect(adaptiveCombatWant({ tanks: 3, infantry: 1, antiArmor: 0 }, 0, roll)).toBe("antiArmor");
    expect(adaptiveCombatWant({ tanks: 2, infantry: 2, antiArmor: 0 }, 1, roll)).toBe("antiArmor");
    expect(adaptiveCombatWant({ tanks: 4, infantry: 0, antiArmor: 0 }, -1, roll)).toBe("infantry");
    expect(rolls).toEqual([0.4, 0.4]);
  });
});

describe("director proficiency", () => {
  it("trains sooner when the player is ahead and later when the player is behind", () => {
    const difficulty = missionDifficulty(2);
    const aheadTick = difficulty.enemyProductionStart + Math.round(difficulty.enemyProductionEvery * 0.85);
    const behindTick = difficulty.enemyProductionStart + Math.round(difficulty.enemyProductionEvery * 1.15);
    const ahead = economyFixture(2, 1);
    ahead.tick = aheadTick;
    tickAi(ahead);
    expect(isTraining(ahead)).toBe(true);

    const neutral = economyFixture(2);
    neutral.tick = aheadTick;
    tickAi(neutral);
    expect(isTraining(neutral)).toBe(false);

    const behind = economyFixture(2, -1);
    behind.tick = behindTick;
    tickAi(behind);
    expect(isTraining(behind)).toBe(true);

    const stillNeutral = economyFixture(2);
    stillNeutral.tick = behindTick;
    tickAi(stillNeutral);
    expect(isTraining(stillNeutral)).toBe(false);
  });

  it("does not shorten the opening mission when the stored band is harder", () => {
    const difficulty = missionDifficulty(0);
    const unclamped = difficulty.enemyProductionStart + Math.round(difficulty.enemyProductionEvery * 0.85);
    const opening = economyFixture(0, 1);
    opening.tick = unclamped;
    tickAi(opening);
    expect(isTraining(opening)).toBe(false);
  });

  it("starts the assault earlier or later with the band", () => {
    const assault = (band: -1 | 1 | undefined, tick: number) => {
      const state = makeFixture({ width: 40, height: 40, win: { kind: "destroyMarked", targetCount: 1 } });
      state.missionIndex = 2;
      if (band) state.proficiencyBand = band;
      addBuilding(state, 1, "constructionYard", 4, 4);
      addBuilding(state, 0, "constructionYard", 34, 34);
      state.tick = tick;
      tickAi(state);
      return state.aiState;
    };
    const base = missionDifficulty(2).enemyAssaultEvery;
    const aheadWave = Math.round(base * 0.85) + 240;
    const behindWave = Math.round(base * 1.15) + 240;
    expect(assault(1, aheadWave)).toBe("assault");
    expect(assault(undefined, aheadWave)).not.toBe("assault");
    expect(assault(-1, behindWave)).toBe("assault");
    expect(assault(undefined, base + 240)).toBe("assault");
  });

  it("retreats later when ahead and earlier when behind", () => {
    expect(retreatEnterHealth(0)).toBe(0.35);
    expect(retreatEnterHealth(1)).toBeLessThan(0.35);
    expect(retreatEnterHealth(-1)).toBeGreaterThan(0.35);

    const wounded = (band?: -1 | 1) => {
      const state = makeFixture({ width: 40, height: 40, win: { kind: "destroyMarked", targetCount: 1 } });
      state.missionIndex = 2;
      if (band) state.proficiencyBand = band;
      addBuilding(state, 1, "constructionYard", 4, 4);
      addBuilding(state, 0, "constructionYard", 34, 34);
      const lead = addUnit(state, 1, "infantry", 6, 6);
      const second = addUnit(state, 1, "infantry", 7, 6);
      lead.hp = 21;
      second.hp = 21;
      state.tick = missionDifficulty(2).enemyAssaultEvery + 240;
      tickAi(state);
      return state.aiState;
    };
    expect(wounded()).toBe("retreat");
    expect(wounded(1)).toBe("assault");
  });

  it("skips hold-the-line reinforcements when the player is behind and does not add a second bonus wave", () => {
    const reinforce = (band?: -1 | 1) => {
      const state = makeFixture({ width: 30, height: 30, win: { kind: "holdTheLine", ticks: 20_000 } });
      state.missionIndex = 4;
      if (band) state.proficiencyBand = band;
      addBuilding(state, 1, "constructionYard", 4, 4);
      addBuilding(state, 0, "constructionYard", 24, 24);
      const before = state.entities.filter((entity) => entity.owner === 1 && entity.class === "unit").length;
      const every = band === 1
        ? Math.round(missionDifficulty(4).enemyAssaultEvery * 0.85)
        : missionDifficulty(4).enemyAssaultEvery;
      state.tick = every;
      tickAi(state);
      return state.entities.filter((entity) => entity.owner === 1 && entity.class === "unit").length - before;
    };
    expect(reinforce()).toBe(2);
    expect(reinforce(-1)).toBe(0);
    expect(reinforce(1)).toBe(2);
  });

  it("raises the turret cap by one when the player is ahead", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    state.missionIndex = 2;
    const yard = addBuilding(state, 1, "constructionYard", 4, 4);
    const threat = addUnit(state, 0, "tank", 12, 4);
    addBuilding(state, 1, "turret", 8, 4);
    addBuilding(state, 1, "turret", 8, 8);
    state.credits[1] = 5000;
    expect(tryBuildTurret(state, yard, threat, 1, 0)).toBe(false);
    expect(tryBuildTurret(state, yard, threat, 1, 1)).toBe(true);
  });

  it("keeps a neutral band off the save and round-trips a harder band", () => {
    const neutral = createMission({ seed: 421, missionIndex: 2 });
    expect(neutral.proficiencyBand).toBeUndefined();
    expect(isStateShape(decodeSavedState(encodeSavedState(neutral)))).toBe(true);

    const harder = createMission({ seed: 421, missionIndex: 2, proficiencyBand: 1 });
    expect(harder.proficiencyBand).toBe(1);
    const restored = decodeSavedState(encodeSavedState(harder));
    expect(restored.proficiencyBand).toBe(1);
    expect(isStateShape(restored)).toBe(true);

    const invalid = encodeSavedState(harder) as Record<string, unknown>;
    invalid.proficiencyBand = 2;
    expect(() => decodeSavedState(invalid)).toThrow(/Invalid save state/);
  });
});
