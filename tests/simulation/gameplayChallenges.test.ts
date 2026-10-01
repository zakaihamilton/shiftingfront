import { describe, expect, it } from "vitest";
import { createCampaign } from "../../lib/gen/campaign";
import { createMission, inspect } from "../../lib/sim/api";
import { CHALLENGE_HOLD_TICKS, tickChallenges } from "../../lib/sim/challenges";
import { makeFixture, addUnit, addBuilding } from "../../lib/sim/fixtures";
import { missionMedals, missionScore } from "../../lib/sim/debrief";
import { decodeSavedState, encodeSavedState } from "../../lib/persist/save/serialize";
import { memoryStorage } from "../../lib/persist/save";
import { evaluateElimination } from "../../lib/sim/scenarios/evaluators";
import { tickRescueExtraction } from "../../lib/sim/scenarios/rescueExtraction";
import { normalizeCampaignProgress, freshCampaignProgress, recordWonCampaignProgress, readCampaignProgress } from "../../lib/persist/campaign";
import { secondaryProgress } from "../../lib/sim/objectives";
import { reachableScenarioCells } from "../../lib/sim/scenarios/reachability";
import { invalidateNavigation, invalidateEntityCaches } from "../../lib/sim/world";
import { tickMovement } from "../../lib/sim/movement";

function zoneFixture() {
  const state = makeFixture({ width: 24, height: 24, win: { kind: "holdTheLine", ticks: 9999 } });
  state.gameplayRulesVersion = 2;
  state.runtime = { kind: "holdTheLine", phase: "active", targetIds: [], rescued: 0, required: 1,
    secondary: [{ id: "bonus-ore", label: "Hold forward ore", kind: "secureZone", priority: "optional", zone: { x: 12, y: 12 }, radius: 3, target: CHALLENGE_HOLD_TICKS, progressTicks: 0 }] };
  return state;
}

describe("versioned gameplay and optional challenges", () => {
  it("lets a cargo return back out of a partial-route pocket", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    state.gameplayRulesVersion = 2;
    const cargo = addUnit(state, 0, "convoyTruck", 5.99, 5);
    cargo.scenarioRole = "cargo";
    cargo.orderMode = "move";
    cargo.orderDestination = { x: 3, y: 5 };
    cargo.path = [{ x: 6, y: 5 }];
    cargo.routePending = true;
    cargo.idle = false;
    tickMovement(state);
    expect(cargo.x).toBe(6);
    tickMovement(state);
    expect(cargo.x).toBeLessThan(6);
  });

  it("continues a distant cargo return when another actor occupies the shared destination", () => {
    const state = makeFixture({ width: 40, height: 40, win: { kind: "annihilate" } });
    state.gameplayRulesVersion = 2;
    const cargo = addUnit(state, 0, "convoyTruck", 5, 5);
    cargo.scenarioRole = "cargo";
    cargo.orderMode = "move";
    cargo.orderDestination = { x: 30, y: 30 };
    cargo.routePending = true;
    cargo.idle = false;
    const arrived = addUnit(state, 0, "convoyTruck", 30, 30);
    arrived.scenarioRole = "cargo";
    tickMovement(state);
    expect(cargo.path.length).toBeGreaterThan(0);
    expect(Math.hypot(cargo.x - 5, cargo.y - 5)).toBeGreaterThan(0);
    expect(arrived.x).toBe(30);
    expect(arrived.y).toBe(30);
  });

  it("does not award an optional medal when a constrained map has no bonus", () => {
    const state = zoneFixture();
    state.runtime!.secondary = [{ id: "yard", kind: "preserveYard", priority: "primary", label: "Keep HQ" }];
    state.result = "won";
    state.losses.units[0] = 1;
    expect(missionMedals(state)).toBe(1);
  });

  it("keeps routes open around optional outposts on constrained maps", () => {
    for (const [seed, missionIndex] of [[3, 2], [10, 0], [13, 1], [75, 1]]) {
      const state = createMission({ seed, missionIndex, gameplayRulesVersion: 2 });
      const withOutpost = reachableScenarioCells(state)!;
      for (const entity of state.entities) if (entity.optionalChallenge) entity.hp = 0;
      invalidateEntityCaches(state);
      invalidateNavigation(state);
      const withoutOutpost = reachableScenarioCells(state)!;
      // Only the outpost footprint can become newly reachable when it is removed.
      expect(withoutOutpost.reduce((n, cell, i) => n + (cell && !withOutpost[i] ? 1 : 0), 0)).toBeLessThanOrEqual(4);
    }
  });
  it("keeps legacy campaigns and caches separate from new campaigns", () => {
    const old = createCampaign(0);
    const current = createCampaign(0, 2);
    expect(old).toBe(createCampaign(0, 1));
    expect(current).toBe(createCampaign(0, 2));
    expect(current).not.toBe(old);
    expect(old.missions.map(m => m.kind)).toEqual(current.missions.map(m => m.kind));
    expect(normalizeCampaignProgress({ seed: 0 }, 0).gameplayRulesVersion).toBe(1);
    expect(freshCampaignProgress(0).gameplayRulesVersion).toBe(2);
    expect(createMission({ seed: 0, missionIndex: 0 }).gameplayRulesVersion).toBe(1);
  });

  it.each([1, 2] as const)("preserves rules %s for the next deployment after a save and win", rules => {
    const storage = memoryStorage();
    const state = decodeSavedState(encodeSavedState(createMission({ seed: 0, missionIndex: 0, gameplayRulesVersion: rules })));
    state.result = "won";
    expect(recordWonCampaignProgress(storage, state)).toBe(true);
    const progress = readCampaignProgress(storage, 0);
    expect(progress.gameplayRulesVersion).toBe(rules);
    expect(createMission({ seed: 0, missionIndex: progress.unlockedMission, gameplayRulesVersion: progress.gameplayRulesVersion }).gameplayRulesVersion).toBe(rules);
  });

  it("normalizes unversioned saves and rejects unsupported rules", () => {
    const saved = encodeSavedState(createMission({ seed: 0, missionIndex: 0 })) as Record<string, unknown>;
    delete saved.gameplayRulesVersion;
    expect(decodeSavedState(saved).gameplayRulesVersion).toBe(1);
    expect(() => decodeSavedState({ ...saved, gameplayRulesVersion: 3 })).toThrow();
  });

  it("places deterministic optional challenges without adding mandatory targets", () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) for (let missionIndex = 0; missionIndex < 6; missionIndex++) {
      const state = createMission({ seed, missionIndex, gameplayRulesVersion: 2 });
      const repeat = createMission({ seed, missionIndex, gameplayRulesVersion: 2 });
      expect(state.runtime?.secondary).toEqual(repeat.runtime?.secondary);
      expect(state.runtime?.secondary.filter(o => o.priority === "optional").length).toBeLessThanOrEqual(1);
      for (const e of state.entities.filter(e => e.optionalChallenge)) expect(state.runtime?.targetIds).not.toContain(e.id);
    }
  });

  it("requires a combat ground unit and resets when contested or abandoned", () => {
    const state = zoneFixture();
    const harvester = addUnit(state, 0, "harvester", 12, 12);
    tickChallenges(state);
    expect(state.runtime!.secondary[0].progressTicks).toBe(0);
    const friendly = addUnit(state, 0, "infantry", 12, 12);
    for (let i = 0; i < 100; i++) tickChallenges(state);
    expect(state.runtime!.secondary[0].progressTicks).toBe(100);
    const enemy = addUnit(state, 1, "infantry", 14, 12);
    tickChallenges(state);
    expect(state.runtime!.secondary[0].progressTicks).toBe(0);
    enemy.x = 20;
    tickChallenges(state);
    friendly.x = 20;
    tickChallenges(state);
    expect(state.runtime!.secondary[0].progressTicks).toBe(0);
    friendly.x = harvester.x;
    for (let i = 0; i < CHALLENGE_HOLD_TICKS; i++) tickChallenges(state);
    expect(state.runtime!.secondary[0].completed).toBe(true);
    friendly.x = 20;
    tickChallenges(state);
    expect(state.runtime!.secondary[0].completed).toBe(true);
    state.result = "won";
    const score = missionScore(state);
    tickChallenges(state);
    expect(missionScore(state)).toBe(score);
    state.runtime!.secondary[0].completed = false;
    expect(score - missionScore(state)).toBe(250);
  });

  it("excludes supply outposts and guards from elimination and progress", () => {
    const state = makeFixture({ win: { kind: "razeAll" } });
    addBuilding(state, 0, "constructionYard", 1, 1);
    const outpost = addBuilding(state, 1, "objective", 8, 8);
    outpost.optionalChallenge = true;
    expect(evaluateElimination(state, { filter: e => e.owner === 1 }).isComplete).toBe(true);
    expect(inspect(state).objective.current).toBe(1);
  });

  it("preserves active zone progress and rules through save reload", () => {
    const state = zoneFixture();
    addUnit(state, 0, "infantry", 12, 12);
    for (let i = 0; i < 99; i++) tickChallenges(state);
    const restored = decodeSavedState(encodeSavedState(state));
    expect(restored.gameplayRulesVersion).toBe(2);
    expect(restored.runtime!.secondary[0].progressTicks).toBe(99);
    tickChallenges(restored);
    expect(restored.runtime!.secondary[0].progressTicks).toBe(100);
    expect(secondaryProgress(restored)[0].priority).toBe("optional");
  });

  it("new rescue contacts require clearing defenders while legacy contacts do not", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "rescue", targetCount: 1 } });
    const target = addUnit(state, 0, "infantry", 12, 12);
    target.neutral = true;
    addUnit(state, 0, "tank", 12, 13);
    const guard = addUnit(state, 1, "infantry", 13, 12);
    state.runtime = { kind: "rescue", phase: "active", targetIds: [target.id], rescued: 0, required: 1, contactedIds: [], rescuedIds: [], secondary: [] };
    state.gameplayRulesVersion = 2;
    tickRescueExtraction(state);
    expect(target.neutral).toBe(true);
    state.gameplayRulesVersion = 1;
    tickRescueExtraction(state);
    expect(target.neutral).toBe(false);
    expect(guard.hp).toBeGreaterThan(0);
  });
});
