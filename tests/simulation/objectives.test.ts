import { describe, expect, it } from "vitest";
import { TICKS_PER_SECOND } from "../../lib/catalog";
import { CONVOY_COMPLETION_BUFFER_TICKS, CONVOY_STAGING_TICKS, createMission, tick } from "../../lib/sim/api";
import { addBuilding, addUnit, makeFixture, setTile, TILE_RESOURCE } from "../../lib/sim/fixtures";
import { formatHoldClock, inspect, objectiveProgress, evaluateObjectives, secondaryProgress } from "../../lib/sim/objectives";
import { createCampaign } from "../../lib/gen/campaign";
import { generateWinCategory, missionDurationMinutesFor, missionTimeLimitClock, missionTimeLimitLabel, missionTimeLimitTicks, secondaryObjectivesForMissionSeed } from "../../lib/gen/objectives";
import { formatMissionClock, formatMissionClockFromTicks, MAX_OPERATION_TICKS, minutesToTicks } from "../../lib/gen/pacing";
import { missionObjectives } from "../../lib/gen/story";
import { tickScenario } from "../../lib/sim/scenarios";

describe("win categories", () => {
  it("harvestQuota wins after a deposit", () => {
    const s = makeFixture({ win: { kind: "harvestQuota", target: 50 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "refinery", 3, 2);
    const h = addUnit(s, 0, "harvester", 2, 2);
    h.carry = 500;
    setTile(s, 5, 5, TILE_RESOURCE, 200);
    tick(s);
    expect(s.creditsEarned[0]).toBeGreaterThanOrEqual(50);
    expect(inspect(s).result).toBe("won");
  });

  it("forceQuota wins when a unit finishes production", () => {
    const s = makeFixture({ win: { kind: "forceQuota", target: 1 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const b = addBuilding(s, 0, "barracks", 2, 2);
    b.producing = { kind: "infantry", remaining: 1 };
    tick(s);
    expect(s.unitsProduced[0]).toBe(1);
    expect(inspect(s).result).toBe("won");
  });

  it("structureQuota wins when a building completes", () => {
    const s = makeFixture({ win: { kind: "structureQuota", target: 1 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "turret", 2, 2, 1);
    tick(s);
    expect(s.buildingsCompleted[0]).toBe(1);
    expect(inspect(s).result).toBe("won");
  });

  it("destroyMarked wins when tagged buildings die", () => {
    const s = makeFixture({ win: { kind: "destroyMarked", targetIds: [] } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const t = addBuilding(s, 1, "objective", 5, 4, 0, true);
    t.hp = 5;
    s.win.targetIds = [t.id];
    const tank = addUnit(s, 0, "tank", 4, 6);
    tank.attackTarget = t.id;
    tick(s);
    expect(inspect(s).result).toBe("won");
  });

  it("razeAll wins when no enemy buildings remain", () => {
    const s = makeFixture({ win: { kind: "razeAll" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const b = addBuilding(s, 1, "power", 5, 5);
    b.hp = 5;
    const tank = addUnit(s, 0, "tank", 4, 5);
    tank.attackTarget = b.id;
    tick(s);
    expect(inspect(s).result).toBe("won");
  });

  it("decapitate wins when the enemy yard falls", () => {
    const s = makeFixture({ win: { kind: "decapitate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const cy = addBuilding(s, 1, "constructionYard", 6, 6);
    cy.hp = 5;
    const tank = addUnit(s, 0, "tank", 5, 8);
    tank.attackTarget = cy.id;
    tick(s);
    expect(inspect(s).result).toBe("won");
  });

  it("annihilate wins when no enemies remain", () => {
    const s = makeFixture({ win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const u = addUnit(s, 1, "infantry", 4, 4);
    u.hp = 5;
    const tank = addUnit(s, 0, "tank", 4, 5);
    tank.attackTarget = u.id;
    tick(s);
    expect(inspect(s).result).toBe("won");
  });

  it("holdTheLine wins after the timer", () => {
    const s = makeFixture({ win: { kind: "holdTheLine", ticks: 2 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    tick(s);
    expect(inspect(s).result).toBe("playing");
    tick(s);
    expect(inspect(s).result).toBe("won");
  });

  it("formats mission clocks with explicit minutes and seconds", () => {
    expect(formatMissionClock(0)).toBe("00:00");
    expect(formatMissionClock(5)).toBe("00:05");
    expect(formatMissionClock(305)).toBe("05:05");
    expect(formatMissionClockFromTicks(5 * TICKS_PER_SECOND + 1)).toBe("00:06");

    expect(formatHoldClock(187)).toBe("03:07");
    expect(formatHoldClock(7)).toBe("00:07");
    expect(formatHoldClock(60)).toBe("01:00");

    const s = makeFixture({ win: { kind: "holdTheLine", ticks: 187 * TICKS_PER_SECOND } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    expect(objectiveProgress(s).label).toBe("Hold 03:07 remaining");
    s.tick = 187 * TICKS_PER_SECOND;
    expect(objectiveProgress(s).label).toBe("Held");

    const untimed = makeFixture({ win: { kind: "holdTheLine" } });
    addBuilding(untimed, 0, "constructionYard", 0, 0);
    expect(objectiveProgress(untimed).label).toBe("Training range — no time limit");
    expect(objectiveProgress(untimed).timeRemainingTicks).toBeUndefined();
  });

  it("uses the full escort limit for the speed secondary objective", () => {
    const activeWindow = minutesToTicks(8);
    expect(missionTimeLimitTicks({ kind: "sabotage", ticks: activeWindow })).toBe(activeWindow);
    expect(missionTimeLimitTicks({ kind: "escort", ticks: activeWindow })).toBe(activeWindow + CONVOY_STAGING_TICKS + CONVOY_COMPLETION_BUFFER_TICKS);
    expect(missionTimeLimitClock({ kind: "escort", ticks: activeWindow })).toBe("14:00");
    expect(missionTimeLimitLabel({ kind: "escort", ticks: activeWindow })).toBe("14 min");

    const secondary = secondaryObjectivesForMissionSeed(421, { index: 2, win: { kind: "escort", ticks: activeWindow } });
    expect(secondary[1]).toMatchObject({
      label: "Speed bonus: complete the operation within 14 min total",
      target: activeWindow + CONVOY_STAGING_TICKS + CONVOY_COMPLETION_BUFFER_TICKS,
    });
  });

  it("keeps the escort speed objective available through convoy staging", () => {
    const state = createMission({ seed: 10, missionIndex: 1 });
    const timed = state.runtime?.secondary.find((objective) => objective.id === "time");
    expect(timed?.target).toBe(state.runtime?.deadline);
    state.tick = CONVOY_STAGING_TICKS - 1;
    tick(state);
    expect(timed?.completed).toBe(true);
  });

  it("keeps a timed secondary active until the primary objective wins", () => {
    const state = makeFixture({ win: { kind: "rescue", targetCount: 1, ticks: 100 } });
    state.tick = 20;
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [],
      deadline: 100,
      rescued: 0,
      required: 1,
      secondary: [{ id: "time", kind: "completeBefore", label: "Complete the operation within 8 min", target: 100, completed: true }],
    };

    expect(secondaryProgress(state)[0]).toMatchObject({ completed: false, failed: false });
    state.result = "won";
    expect(secondaryProgress(state)[0]).toMatchObject({ completed: true, failed: false });
  });

  it("counts only living combat units for the survivor secondary", () => {
    const state = makeFixture({ win: { kind: "holdTheLine", ticks: 100 } });
    addUnit(state, 0, "harvester", 2, 2);
    addUnit(state, 0, "medic", 3, 2);
    state.runtime = {
      kind: "holdTheLine",
      phase: "active",
      targetIds: [],
      rescued: 0,
      required: 1,
      secondary: [{ id: "survivors", kind: "keepUnits", label: "Keep at least one combat unit alive", target: 1 }],
    };

    tickScenario(state);
    expect(state.runtime.secondary[0]?.completed).toBe(false);

    addUnit(state, 0, "infantry", 4, 2);
    tickScenario(state);
    expect(state.runtime.secondary[0]?.completed).toBe(true);
  });

  it("losing the construction yard fails the mission", () => {
    const s = makeFixture({ win: { kind: "holdTheLine", ticks: 100 } });
    const cy = addBuilding(s, 0, "constructionYard", 1, 1);
    cy.hp = 0;
    tick(s);
    expect(inspect(s).result).toBe("lost");
  });

  it("can advance a localized preview without resolving campaign objectives", () => {
    const s = makeFixture({ win: { kind: "holdTheLine", ticks: 100 } });
    const before = s.tick;
    tick(s, undefined, { evaluateObjectives: false });
    expect(s.tick).toBe(before + 1);
    expect(s.result).toBe("playing");
  });
});

describe("deadline warnings", () => {
  function rescueAt(tick: number, deadline = 2000) {
    const s = makeFixture({ win: { kind: "rescue", targetCount: 1, ticks: deadline } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const stranded = addUnit(s, 0, "infantry", 4, 4);
    stranded.neutral = true;
    stranded.scenarioRole = "stranded";
    s.tick = tick;
    s.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [stranded.id],
      deadline,
      rescued: 0,
      required: 1,
      secondary: [],
    };
    return s;
  }

  it("pings at 60, 30, and 10 seconds remaining on a loss timer", () => {
    const minute = 60 * TICKS_PER_SECOND;
    expect(evaluateObjectives(rescueAt(2000 - minute))).toContainEqual({
      type: "deadlineWarning",
      remainingTicks: minute,
    });
    expect(evaluateObjectives(rescueAt(2000 - 30 * TICKS_PER_SECOND))).toContainEqual({
      type: "deadlineWarning",
      remainingTicks: 30 * TICKS_PER_SECOND,
    });
    expect(evaluateObjectives(rescueAt(2000 - 10 * TICKS_PER_SECOND))).toContainEqual({
      type: "deadlineWarning",
      remainingTicks: 10 * TICKS_PER_SECOND,
    });
    expect(evaluateObjectives(rescueAt(2000 - 59 * TICKS_PER_SECOND)).some((event) => event.type === "deadlineWarning")).toBe(false);
  });

  it("does not ping the hold-the-line win clock", () => {
    const s = makeFixture({ win: { kind: "holdTheLine", ticks: 2000 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    s.tick = 2000 - 60 * TICKS_PER_SECOND;
    s.runtime = {
      kind: "holdTheLine",
      phase: "active",
      targetIds: [],
      rescued: 0,
      required: 0,
      secondary: [],
    };
    expect(evaluateObjectives(s).some((event) => event.type === "deadlineWarning")).toBe(false);
  });
});

describe("generated harvest quotas", () => {
  it("uses round credit targets", () => {
    for (let seed = 0; seed < 40; seed++) {
      for (let index = 0; index < 8; index++) {
        const win = generateWinCategory(seed, index, "harvestQuota");
        expect(win.target).toBeGreaterThanOrEqual(4000);
        expect(win.target! % 500).toBe(0);
      }
    }
  });
});

describe("generated mission pacing", () => {
  it("uses whole-minute durations and deadlines", () => {
    for (let seed = 0; seed < 40; seed++) {
      const campaign = createCampaign(seed);
      for (const mission of campaign.missions) {
        const duration = missionDurationMinutesFor(seed, mission.index, mission.win.kind);
        expect(Number.isInteger(duration)).toBe(true);
        if (mission.win.ticks === undefined) continue;

        const minute = minutesToTicks(1);
        expect(mission.win.ticks % minute).toBe(0);
        expect((missionTimeLimitTicks(mission.win) ?? 0) % minute).toBe(0);
        expect(missionTimeLimitTicks(mission.win) ?? 0).toBeLessThanOrEqual(MAX_OPERATION_TICKS);
        expect(duration).toBe((missionTimeLimitTicks(mission.win) ?? 0) / minute);
      }
    }
  });

  it("gives sabotage missions a twelve-to-thirty-minute operation window", () => {
    const minute = minutesToTicks(1);
    for (let seed = 0; seed < 40; seed++) {
      for (let missionIndex = 0; missionIndex < 8; missionIndex++) {
        const win = generateWinCategory(seed, missionIndex, "sabotage");
        expect(win.ticks! / minute).toBeGreaterThanOrEqual(12);
        expect(win.ticks! / minute).toBeLessThanOrEqual(30);
      }
    }

    expect(generateWinCategory(421, 0, "sabotage").ticks).toBe(minutesToTicks(12));
  });

  it("gives escort, rescue, and extraction a ten-to-thirty-minute active window", () => {
    const minute = minutesToTicks(1);
    for (let seed = 0; seed < 40; seed++) {
      for (let missionIndex = 0; missionIndex < 8; missionIndex++) {
        for (const kind of ["escort", "rescue", "extraction"] as const) {
          const minutes = generateWinCategory(seed, missionIndex, kind).ticks! / minute;
          expect(minutes).toBeGreaterThanOrEqual(10);
          expect(minutes).toBeLessThanOrEqual(30);
        }
      }
    }
  });

  it("gives extraction missions a full rounded operation window", () => {
    const campaign = createCampaign(0);
    const extraction = campaign.missions.find((m) => m.win.kind === "extraction")!;
    expect(extraction.win.kind).toBe("extraction");
    expect(extraction.win.ticks).toBe(minutesToTicks(12));
    expect(missionDurationMinutesFor(0, extraction.index, "extraction")).toBe(12);
  });
});

describe("generated structure quotas", () => {
  it("never asks for multiple copies of a single-instance producer", () => {
    for (let seed = 0; seed < 40; seed++) {
      for (let index = 0; index < 6; index++) {
        const win = generateWinCategory(seed, index, "structureQuota");
        expect(["barracks", "factory"]).not.toContain(win.building);
      }
    }
  });

  it("adds a deterministic two-building cushion to generic quotas", () => {
    for (let seed = 0; seed < 40; seed++) {
      for (let index = 0; index < 8; index++) {
        const win = generateWinCategory(seed, index, "structureQuota");
        if (win.building) continue;
        const previousMinimum = 5 + Math.floor(index / 2);
        expect(win.target).toBeGreaterThanOrEqual(previousMinimum + 2);
        expect(win.target).toBeLessThanOrEqual(previousMinimum + 4);
      }
    }
  });
});

describe("mission briefing objectives", () => {
  it("derives real objectives from the campaign win condition and standing orders", () => {
    const campaign = createCampaign(421);
    for (const mission of campaign.missions) {
      const objectives = missionObjectives(mission, campaign);
      expect(objectives.length).toBeGreaterThanOrEqual(2);
      expect(objectives.some((item) => /command hq/i.test(item.text))).toBe(true);
      expect(objectives[0]!.text.toLowerCase()).not.toContain("lorem");
      if (mission.win.kind === "harvestQuota") {
        expect(objectives[0]!.text).toContain(String(mission.win.target));
      }
      if (mission.win.kind === "forceQuota" && mission.win.role) {
        expect(objectives[0]!.text.toLowerCase()).toContain(mission.win.role === "antiArmor" ? "anti-armor" : mission.win.role);
      }
    }
  });

  it("keeps the operations preview aligned with runtime goals and deadlines", () => {
    const campaign = createCampaign(421);
    for (const mission of campaign.missions) {
      const state = createMission({ seed: 421, missionIndex: mission.index });
      expect(secondaryObjectivesForMissionSeed(421, mission).map(({ id, kind, label, target }) => ({ id, kind, label, target })))
        .toEqual(state.runtime?.secondary.map(({ id, kind, label, target }) => ({ id, kind, label, target })));
      if (mission.win.ticks !== undefined) {
        const staging = mission.win.kind === "escort" ? CONVOY_STAGING_TICKS + CONVOY_COMPLETION_BUFFER_TICKS : 0;
        expect(mission.win.ticks + staging).toBe(minutesToTicks(missionDurationMinutesFor(421, mission.index, mission.win.kind)));
      }
    }
  });

  it("weights rescue and siege operations toward preserving the support screen", () => {
    const rescue = secondaryObjectivesForMissionSeed(421, {
      index: 2,
      win: { kind: "rescue", targetCount: 2, ticks: 3600 },
    });
    expect(rescue.map((objective) => objective.id)).toEqual(["yard", "survivors"]);

    const siege = secondaryObjectivesForMissionSeed(421, {
      index: 2,
      profile: { family: "assault", variant: "siege" },
      win: { kind: "decapitate" },
    });
    expect(siege[1]?.kind).toBe("keepUnits");
  });

  it("puts exact time limits in briefing objectives", () => {
    const campaign = createCampaign(421);
    const sabotage = campaign.missions.find((mission) => mission.win.kind === "sabotage");
    expect(sabotage).toBeDefined();
    expect(missionObjectives(sabotage!, campaign)[0]?.text).toContain("within 18 min");

    const hold = campaign.missions.find((mission) => mission.win.kind === "holdTheLine");
    expect(hold).toBeDefined();
    expect(missionObjectives(hold!, campaign)[0]?.text).toContain("for 15 min");

    const fallbackEscort = { index: 2, win: { kind: "escort" as const } };
    expect(missionObjectives(fallbackEscort, campaign)[0]?.text).toContain("within 11 min");
    expect(secondaryObjectivesForMissionSeed(421, fallbackEscort)[1]?.label)
      .toBe("Speed bonus: complete the operation within 5 min total");
  });
});

describe("mission briefing dialogue", () => {
  it("keeps every transmission between three and five lines with all speakers present", () => {
    const campaign = createCampaign(421);
    for (const mission of campaign.missions) {
      const speakers = mission.briefing.map((line) => line.speaker);
      expect(speakers.length).toBeGreaterThanOrEqual(3);
      expect(speakers.length).toBeLessThanOrEqual(5);
      expect(speakers).toContain("advisor");
      expect(speakers).toContain("commander");
      expect(speakers).toContain("enemyLeader");
      for (const line of mission.briefing) {
        expect(line.text.length).toBeGreaterThan(12);
        expect(line.text.length).toBeLessThanOrEqual(500);
        expect(line.text).not.toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+:/);
      }
      const joined = mission.briefing.map((line) => line.text).join(" ");
      expect(joined.length).toBeLessThanOrEqual(1600);
      expect(new Set(mission.briefing.map((line) => line.text)).size).toBe(mission.briefing.length);
      expect(joined).not.toContain(mission.name);
      expect(joined.toLowerCase()).toContain("command hq");
    }
  });

  it("keeps line count and dialogue text deterministic while varying count across seeds", () => {
    const lineCounts = new Set<number>();
    for (let seed = 0; seed < 128; seed++) {
      const first = createCampaign(seed);
      const second = createCampaign(seed);
      expect(second.missions.map((mission) => mission.briefing)).toEqual(first.missions.map((mission) => mission.briefing));
      for (const mission of first.missions) lineCounts.add(mission.briefing.length);
    }
    expect(lineCounts).toEqual(new Set([3, 4, 5]));
  });

  it("keeps objective facts and profile hooks in the generated transmission", () => {
    for (let seed = 0; seed < 40; seed++) {
      const campaign = createCampaign(seed);
      for (const mission of campaign.missions) {
        const text = mission.briefing.map((line) => line.text).join(" ");
        switch (mission.win.kind) {
          case "harvestQuota":
          case "forceQuota":
          case "structureQuota":
            expect(text).toContain(String(mission.win.target));
            break;
          case "destroyMarked":
            expect(text).toContain(String(mission.win.targetCount ?? 1));
            break;
          case "holdTheLine":
            expect(text).toContain(`${Math.ceil((mission.win.ticks ?? 0) / TICKS_PER_SECOND / 60)} min`);
            break;
          case "escort":
          case "sabotage":
          case "rescue":
          case "extraction":
            expect(text).toContain(String(mission.win.targetCount ?? 1));
            expect(text).toMatch(/within \d+ min/);
            break;
          default:
            break;
        }
        const variant = mission.profile!.variant;
        const hook = variant === "resourceRace" ? /ore|harvest/i
          : variant === "forwardIndustry" ? /industry|refinery|power/i
            : variant === "surgicalStrike" ? /breach|precision/i
              : variant === "siege" ? /siege|layered|approach/i
                : variant === "concentratedWaves" ? /one line|concentrating/i
                  : variant === "crossfire" ? /two approach|split|flank/i
                    : variant === "directRoute" ? /shortest route|direct route/i
                      : /exposed|flanks|screen/i;
        expect(text).toMatch(hook);
      }
    }
  });

  it("gives every speaker a distinct voice across many seeds", () => {
    for (let seed = 0; seed < 40; seed++) {
      const campaign = createCampaign(seed);
      const { advisor, commander, enemyLeader } = campaign.characters;
      const labels = [
        `${advisor.title} ${advisor.name}`,
        `${commander.title} ${commander.name}`,
        `${enemyLeader.title} ${enemyLeader.name}`,
      ];
      for (const mission of campaign.missions) {
        const joined = mission.briefing.map((line) => line.text).join(" ");
        for (const label of labels) expect(joined).toContain(label);
        expect(joined.toLowerCase()).toContain("command hq");
        expect(joined).not.toMatch(/under strength|levy|form up|right of it/i);
        for (const line of mission.briefing) {
          expect(line.text).toMatch(/[.!?]$/);
        }
      }
      for (const speaker of ["advisor", "commander", "enemyLeader"] as const) {
        const texts = campaign.missions.map((m) => m.briefing.find((l) => l.speaker === speaker)!.text);
        expect(new Set(texts).size).toBeGreaterThan(1);
      }
    }
  });
});
