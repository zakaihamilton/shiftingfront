import { describe, expect, it } from "vitest";
import { CONVOY_COMPLETION_BUFFER_TICKS, CONVOY_STAGING_TICKS, createMission, issue, tick, inspect } from "../../lib/sim/api";
import { tickCombat } from "../../lib/sim/combat";
import { createTutorialMission, tutorialPrompt } from "../../lib/sim/tutorial";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { missionDifficulty } from "../../lib/sim/difficulty";
import { BUILDING_STATS, STARTING_CREDITS, TICKS_PER_SECOND, UNIT_STATS } from "../../lib/catalog";
import { createCampaign } from "../../lib/gen/campaign";
import { generateMap } from "../../lib/gen/map";
import { tooltipLines, tileTooltipLines } from "../../lib/render/renderer";
import { objectiveProgress } from "../../lib/sim/objectives";
import { distToEntity } from "../../lib/sim/world";
import { guardScenarioObjectives } from "../../lib/sim/ai/director";
import { deserializeState, serializeState } from "../../lib/persist/save";
import { inRescueFlank } from "../../lib/gen/map/generator/rescuePlacement";
import { fogIndex } from "../../lib/sim/fog";
import { RESCUE_CONTACT_RADIUS, type MissionKind } from "../../lib/types";

function missionOfKind(kind: MissionKind, missionIndex: number) {
  for (let seed = 0; seed < 200; seed++) {
    const state = createMission({ seed, missionIndex });
    if (state.missionKind === kind) return state;
  }
  throw new Error(`No ${kind} mission at index ${missionIndex} in seeds 0–199`);
}

describe("tactical expansion", () => {
  it("starts missions with more credits and half-cost units and buildings", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });

    expect(state.credits).toEqual([STARTING_CREDITS.player, STARTING_CREDITS.enemy]);
    expect(UNIT_STATS.harvester.cost).toBe(450);
    expect(UNIT_STATS.harvester.carryMax).toBe(500);
    expect(UNIT_STATS.infantry.cost).toBe(75);
    expect(UNIT_STATS.antiArmor.cost).toBe(160);
    expect(UNIT_STATS.tank.cost).toBe(425);
    expect(BUILDING_STATS.power.cost).toBe(300);
    expect(BUILDING_STATS.refinery.cost).toBe(750);
    expect(BUILDING_STATS.barracks.cost).toBe(375);
    expect(BUILDING_STATS.factory.cost).toBe(800);
    expect(BUILDING_STATS.turret.cost).toBe(275);
    expect(BUILDING_STATS.power.power).toBe(50);
    expect(UNIT_STATS.harvester.buildTicks).toBe(108);
    expect(UNIT_STATS.infantry.buildTicks).toBe(48);
    expect(UNIT_STATS.antiArmor.buildTicks).toBe(72);
    expect(UNIT_STATS.tank.buildTicks).toBe(120);
    expect(BUILDING_STATS.power.buildTicks).toBe(90);
    expect(BUILDING_STATS.refinery.buildTicks).toBe(120);
    expect(BUILDING_STATS.barracks.buildTicks).toBe(108);
    expect(BUILDING_STATS.factory.buildTicks).toBe(180);
    expect(BUILDING_STATS.turret.buildTicks).toBe(84);
  });

  it("ramps enemy pressure across the campaign instead of starting at endgame strength", () => {
    const opening = createMission({ seed: 421, missionIndex: 0 });
    const finale = createMission({ seed: 421, missionIndex: 5 });
    const openingEnemy = opening.entities.filter((entity) => entity.owner === 1 && entity.hp > 0);
    const finaleEnemy = finale.entities.filter((entity) => entity.owner === 1 && entity.hp > 0);

    expect(opening.entities.some((entity) => entity.owner === 0 && entity.kind === "barracks")).toBe(true);
    expect(openingEnemy.some((entity) => entity.kind === "tank" || entity.kind === "turret")).toBe(false);
    expect(finaleEnemy.some((entity) => entity.kind === "tank" || entity.kind === "turret")).toBe(true);
    expect(missionDifficulty(0).enemyProductionStart).toBeGreaterThan(missionDifficulty(5).enemyProductionStart);
    expect(missionDifficulty(0).enemyAssaultEvery).toBeGreaterThan(missionDifficulty(5).enemyAssaultEvery);
  });

  it("keeps offensive starting defenses in the mission difficulty data", () => {
    expect(Array.from({ length: 8 }, (_, index) => missionDifficulty(index).offensiveStartingTurrets)).toEqual([0, 0, 0, 0, 1, 0, 0, 0]);
  });

  it("gives the final mission a bounded late-pressure step", () => {
    expect(missionDifficulty(7)).toMatchObject({
      enemyProductionStart: 120,
      enemyProductionEvery: 108,
      enemyAssaultEvery: 600,
      startingGuards: 2,
    });
  });

  it("keeps tutorial orders playable until the matching stage", () => {
    const state = createTutorialMission();
    const unit = state.entities.find((entity) => entity.owner === 0 && entity.class === "unit")!;
    const result = tick(state, [{ type: "move", unitIds: [unit.id], x: unit.x + 2, y: unit.y }]);
    expect(result.events).not.toContainEqual({ type: "commandRejected", reason: expect.stringContaining("training step") });
    expect(tutorialPrompt(state)).toContain("select");
  });

  it.each(["escort", "rescue"] as const)("creates %s neutrals without allowing auto-targeting", (kind) => {
    const state = missionOfKind(kind, 1);
    const neutral = state.entities.find((entity) => entity.neutral);
    expect(neutral).toBeDefined();
    expect(neutral?.scenarioRole).toBe(kind === "escort" ? "convoy" : "stranded");
    if (kind === "escort") {
      const convoy = state.entities.filter((entity) => entity.scenarioRole === "convoy");
      expect(convoy.every((entity) => entity.kind === "convoyTruck")).toBe(true);
      expect(UNIT_STATS.convoyTruck).toMatchObject({
        hp: 320,
        speed: 0.065,
        sight: 7,
        armor: "heavy",
        damage: 0,
        range: 0,
        cooldown: 0,
      });
      const spread = Math.max(...convoy.map((entity) => Math.hypot(entity.x - convoy[0]!.x, entity.y - convoy[0]!.y)));
      expect(spread).toBeLessThan(4);
      const map = generateMap(state.seed, createCampaign(state.seed).missions[state.missionIndex]!);
      expect(convoy.every((entity) => Math.hypot(entity.x - map.playerStart.x, entity.y - map.playerStart.y) < 8)).toBe(true);
      expect(convoy.every((entity) => Math.hypot(entity.x - state.runtime!.zone!.x, entity.y - state.runtime!.zone!.y) > 8)).toBe(true);
      expect(neutral?.path).toEqual([]);
      expect(state.runtime?.convoyStartTick).toBe(CONVOY_STAGING_TICKS);
      expect(CONVOY_STAGING_TICKS).toBe(3 * 60 * TICKS_PER_SECOND);
      expect(state.runtime?.deadline).toBe(state.win.ticks! + CONVOY_STAGING_TICKS + CONVOY_COMPLETION_BUFFER_TICKS);
      const convoyIds = new Set(convoy.map((entity) => entity.id));
      let enemyEngaged = false;
      for (let i = 0; i < CONVOY_STAGING_TICKS - 1; i++) {
        tick(state, undefined, { evaluateObjectives: false });
        const attackers = state.entities.filter((entity) => entity.owner === 1 && entity.attackTarget !== undefined);
        expect(attackers.every((entity) => !convoyIds.has(entity.attackTarget!))).toBe(true);
        enemyEngaged ||= attackers.some((attacker) => state.entities.some(
          (target) => target.id === attacker.attackTarget && target.owner === 0 && target.hp > 0,
        ));
      }
      expect(enemyEngaged).toBe(true);
      tick(state, undefined, { evaluateObjectives: false });
      const routeEnd = neutral?.path.at(-1);
      expect(routeEnd).toBeDefined();
      expect(Math.hypot(routeEnd!.x - state.runtime!.zone!.x, routeEnd!.y - state.runtime!.zone!.y)).toBeLessThanOrEqual(6);
      const enemyBuildings = state.entities.filter((entity) => entity.owner === 1 && entity.class === "building" && entity.hp > 0);
      expect(enemyBuildings.every((building) => distToEntity(routeEnd!, building) >= 2.5)).toBe(true);
      expect(Math.hypot(routeEnd!.x - state.runtime!.zone!.x, routeEnd!.y - state.runtime!.zone!.y)).toBeGreaterThanOrEqual(4.5);
    } else {
      expect(neutral?.kind).toBe("infantry");
      expect(neutral?.path).toEqual([]);
    }
    const hostile = state.entities.find((entity) => entity.owner === 1 && entity.class === "unit");
    expect(hostile?.attackTarget).not.toBe(neutral?.id);
  });

  it("ends escort convoys at a route-side extraction point instead of the enemy base", () => {
    let sample: { state: ReturnType<typeof createMission>; map: ReturnType<typeof generateMap> } | undefined;
    for (let seed = 0; seed < 200 && !sample; seed++) {
      const campaign = createCampaign(seed);
      const mission = campaign.missions.find((item) => item.win.kind === "escort");
      if (!mission) continue;
      sample = { state: createMission({ seed, missionIndex: mission.index }), map: generateMap(seed, mission) };
    }

    expect(sample).toBeDefined();
    const { state, map } = sample!;
    const zone = state.runtime?.zone;
    expect(zone).toBeDefined();
    expect(Math.hypot(zone!.x - map.enemyStart.x, zone!.y - map.enemyStart.y)).toBeGreaterThan(8);

    const convoy = state.entities.filter((entity) => entity.scenarioRole === "convoy");
    expect(convoy.every((entity) => Math.hypot(entity.x - map.playerStart.x, entity.y - map.playerStart.y) < 8)).toBe(true);
    for (let i = 0; i < CONVOY_STAGING_TICKS; i++) tick(state, undefined, { evaluateObjectives: false });
    const destinations = state.entities
      .filter((entity) => entity.scenarioRole === "convoy")
      .map((entity) => entity.orderDestination)
      .filter((destination): destination is { x: number; y: number } => !!destination);
    expect(destinations.length).toBeGreaterThan(0);
    expect(destinations.every((destination) => Math.hypot(destination.x - map.enemyStart.x, destination.y - map.enemyStart.y) > 6)).toBe(true);
  });

  it("stages rescue targets on the enemy base's mirrored flank", () => {
    let sample: { state: ReturnType<typeof createMission>; map: ReturnType<typeof generateMap> } | undefined;
    for (let seed = 0; seed < 200 && !sample; seed++) {
      const campaign = createCampaign(seed);
      const mission = campaign.missions.find((item) => item.win.kind === "rescue");
      if (!mission) continue;
      sample = { state: createMission({ seed, missionIndex: mission.index }), map: generateMap(seed, mission) };
    }

    expect(sample).toBeDefined();
    const { state, map } = sample!;
    for (const id of state.runtime?.targetIds ?? []) {
      const target = state.entities.find((entity) => entity.id === id)!;
      expect(inRescueFlank(map, target.x, target.y)).toBe(true);
    }
  });

  it("keeps seed 3207 rescue targets away from the enemy base approach", () => {
    const campaign = createCampaign(3207);
    const mission = campaign.missions[0]!;
    const map = generateMap(3207, mission);
    const state = createMission({ seed: 3207, missionIndex: mission.index });
    const targets = state.runtime!.targetIds.map((id) => state.entities.find((entity) => entity.id === id)!);

    expect(mission.win.kind).toBe("rescue");
    expect(targets.every((target) => inRescueFlank(map, target.x, target.y))).toBe(true);
    expect(targets.every((target) => Math.hypot(target.x - map.enemyStart.x, target.y - map.enemyStart.y) > 12)).toBe(true);
  });

  it("spreads stranded rescue targets across the rescue flank", () => {
    let checked = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const mission = createCampaign(seed).missions.find((candidate) => candidate.win.kind === "rescue");
      if (!mission) continue;
      const state = createMission({ seed, missionIndex: mission.index });
      const targets = (state.runtime?.targetIds ?? [])
        .map((id) => state.entities.find((entity) => entity.id === id))
        .filter((target): target is NonNullable<typeof target> => target !== undefined);
      const pairDistances = targets.flatMap((target, index) => targets
        .slice(index + 1)
        .map((other) => Math.hypot(target.x - other.x, target.y - other.y)));

      expect(Math.min(...pairDistances)).toBeGreaterThanOrEqual(6);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("holds deterministic defensive patrols near rescue and extraction targets", () => {
    for (const kind of ["rescue", "extraction"] as const) {
      const mission = createCampaign(0).missions.find((candidate) => candidate.win.kind === kind);
      expect(mission).toBeDefined();
      const state = createMission({ seed: 0, missionIndex: mission!.index });
      const targetIds = state.runtime?.targetIds ?? [];
      expect(targetIds.length).toBeGreaterThan(0);
      expect(targetIds.some((id) => state.entities.some((entity) => entity.scenarioGuardTargetId === id && entity.owner === 1))).toBe(true);
      expect(state.entities.filter((entity) => entity.scenarioGuardTargetId !== undefined).every((entity) => entity.stance === "defensive")).toBe(true);
    }
  });

  it("adds a second guard to contested rescue and extraction stops", () => {
    for (const kind of ["rescue", "extraction"] as const) {
      let sample: { seed: number; missionIndex: number } | undefined;
      for (let seed = 0; seed < 200 && !sample; seed++) {
        const mission = createCampaign(seed).missions.find((candidate) =>
          candidate.win.kind === kind && candidate.profile?.variant === "contestedRoute" &&
            candidate.index >= 4,
        );
        if (mission) sample = { seed, missionIndex: mission.index };
      }

      expect(sample).toBeDefined();
      const state = createMission(sample!);
      for (const targetId of state.runtime?.targetIds ?? []) {
        expect(state.entities.filter((entity) =>
          entity.owner === 1 && entity.scenarioGuardTargetId === targetId,
        )).toHaveLength(kind === "extraction" && state.runtime!.targetIds.indexOf(targetId) > 0 ? 1 : 2);
      }
    }
  });

  it("lets the extra perimeter guard engage an approaching player unit", () => {
    for (const kind of ["rescue", "extraction"] as const) {
      let sample: { seed: number; missionIndex: number } | undefined;
      for (let seed = 0; seed < 200 && !sample; seed++) {
        const mission = createCampaign(seed).missions.find((candidate) =>
          candidate.win.kind === kind && candidate.profile?.variant === "contestedRoute" && candidate.index >= 4,
        );
        if (mission) sample = { seed, missionIndex: mission.index };
      }

      expect(sample).toBeDefined();
      const state = createMission(sample!);
      const targetId = state.runtime?.targetIds[0];
      const guards = state.entities.filter((entity) =>
        entity.owner === 1 && entity.scenarioGuardTargetId === targetId,
      );
      expect(guards).toHaveLength(2);
      const perimeterGuard = guards[1]!;
      const intruder = addUnit(state, 0, "infantry", perimeterGuard.x + 1, perimeterGuard.y);

      tickCombat(state);

      expect(perimeterGuard.attackTarget).toBe(intruder.id);

      if (kind === "extraction") {
        const laterTargetId = state.runtime?.targetIds[1];
        expect(state.entities.filter((entity) => entity.scenarioGuardTargetId === laterTargetId)).toHaveLength(1);
      }
    }
  });

  it("releases a scenario guard after its rescue target is contacted", () => {
    const state = makeFixture({ win: { kind: "rescue", targetCount: 1, ticks: 500 } });
    const stranded = addUnit(state, 0, "infantry", 8, 8);
    stranded.neutral = true;
    const guard = addUnit(state, 1, "infantry", 10, 8);
    guard.scenarioGuardTargetId = stranded.id;
    guard.orderMode = "move";
    guard.orderDestination = { x: stranded.x, y: stranded.y };
    guard.path = [{ x: stranded.x, y: stranded.y }];
    guard.idle = false;
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [stranded.id],
      rescued: 0,
      required: 1,
      secondary: [],
    };

    guardScenarioObjectives(state, [guard]);
    expect(guard.scenarioGuardTargetId).toBe(stranded.id);

    stranded.neutral = false;
    guardScenarioObjectives(state, [guard]);

    expect(guard.scenarioGuardTargetId).toBeUndefined();
    expect(guard.orderDestination).toBeUndefined();
    expect(guard.path).toEqual([]);
    expect(guard.idle).toBe(true);
  });

  it("repaths a convoy after a partial route is consumed", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "escort", targetCount: 1, ticks: 5000 } });
    addBuilding(state, 0, "constructionYard", 1, 1);
    const convoy = addUnit(state, 0, "convoyTruck", 4, 4);
    convoy.neutral = true;
    convoy.scenarioRole = "convoy";
    convoy.orderDestination = { x: 20, y: 20 };
    convoy.routePending = true;
    convoy.idle = false;
    state.runtime = {
      kind: "escort",
      phase: "active",
      targetIds: [convoy.id],
      zone: { x: 20, y: 20 },
      deadline: 5000,
      rescued: 0,
      required: 1,
      secondary: [],
    };

    tick(state);

    expect(convoy.path.length).toBeGreaterThan(0);
    expect(convoy.x).not.toBe(4);
  });

  it("frees rescue actors when a player unit reaches them", () => {
    const state = makeFixture({ width: 24, height: 16, win: { kind: "rescue", targetCount: 1, ticks: 100 } });
    addBuilding(state, 0, "constructionYard", 0, 0);
    const rescuer = addUnit(state, 0, "infantry", 2, 3);
    const stranded = addUnit(state, 0, "infantry", 12, 3);
    stranded.neutral = true;
    stranded.scenarioRole = "stranded";
    state.fog.fill(0);
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [stranded.id],
      zone: { x: 0, y: 0 },
      deadline: 100,
      rescued: 0,
      required: 1,
      secondary: [],
    };

    tick(state);
    expect(stranded.neutral).toBe(true);
    issue(state, { type: "move", unitIds: [rescuer.id], x: stranded.x, y: stranded.y });
    for (let i = 0; i < 100; i++) tick(state);

    expect(stranded.neutral).toBe(false);
    expect(state.runtime.rescued).toBe(1);
  });

  it("does not chain rescue contacts within one tick", () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "rescue", targetCount: 2, ticks: 100 } });
    const rescuer = addUnit(state, 0, "infantry", 2, 2);
    const first = addUnit(state, 0, "infantry", 4, 2);
    const second = addUnit(state, 0, "infantry", 10, 2);
    first.neutral = true;
    first.scenarioRole = "stranded";
    second.neutral = true;
    second.scenarioRole = "stranded";
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [first.id, second.id],
      rescued: 0,
      required: 2,
      secondary: [],
    };
    state.fog.fill(0);

    tick(state);

    expect(rescuer.neutral).not.toBe(true);
    expect(first.neutral).toBe(false);
    expect(second.neutral).toBe(true);
    expect(state.runtime.rescued).toBe(1);
  });

  it("keeps tracked rescue incomplete until contacted units return to HQ", () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "rescue", targetCount: 1, ticks: 500 } });
    const yard = addBuilding(state, 0, "constructionYard", 0, 0);
    const rescuer = addUnit(state, 0, "infantry", 8, 3);
    const stranded = addUnit(state, 0, "infantry", 8, 3);
    stranded.idle = true;
    stranded.neutral = true;
    stranded.scenarioRole = "stranded";
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [stranded.id],
      zone: { x: yard.x, y: yard.y },
      deadline: 500,
      rescued: 0,
      required: 1,
      contactedIds: [],
      rescuedIds: [],
      secondary: [],
    };

    const contactResult = tick(state);

    expect(stranded.neutral).toBe(false);
    expect(state.runtime.contactedIds).toEqual([stranded.id]);
    expect(state.runtime.rescuedIds).toEqual([]);
    expect(state.runtime.rescued).toBe(0);
    expect(state.result).toBe("playing");
    expect(state.runtime.phase).toBe("extraction");
    expect(stranded.orderMode).toBe("move");
    expect(stranded.orderDestination).toBeDefined();
    expect(stranded.idle).toBe(false);
    expect(contactResult.events).toContainEqual(expect.objectContaining({ type: "objectiveMilestone", milestone: "firstContact" }));
    expect(tick(state).events).not.toContainEqual(expect.objectContaining({ type: "objectiveMilestone", milestone: "firstContact" }));

    let returnEvents: ReturnType<typeof tick>["events"] = [];
    for (let i = 0; i < 500 && state.result === "playing"; i++) returnEvents = tick(state).events;

    expect(state.runtime.rescuedIds).toEqual([stranded.id]);
    expect(state.runtime.rescued).toBe(1);
    expect(state.result).toBe("won");
    expect(returnEvents).toContainEqual(expect.objectContaining({ type: "objectiveMilestone", milestone: "firstReturned" }));
    expect(returnEvents).toContainEqual(expect.objectContaining({ type: "objectiveMilestone", milestone: "complete" }));
    expect(objectiveProgress(state).label).toBe("Contacted 1 · Returned 1 / 1");
    void rescuer;
  });

  it("fails when a contacted rescue unit is destroyed before returning", () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "rescue", targetCount: 1, ticks: 500 } });
    addBuilding(state, 0, "constructionYard", 0, 0);
    const rescuer = addUnit(state, 0, "infantry", 8, 3);
    const stranded = addUnit(state, 0, "infantry", 8, 3);
    stranded.idle = true;
    stranded.neutral = true;
    stranded.scenarioRole = "stranded";
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [stranded.id],
      rescued: 0,
      required: 1,
      contactedIds: [],
      rescuedIds: [],
      secondary: [],
    };

    tick(state);
    expect(state.runtime.contactedIds).toEqual([stranded.id]);
    stranded.hp = 0;
    const result = tick(state);

    expect(state.result).toBe("lost");
    expect(state.lossReason).toBe("objectiveTargetLost");
    expect(result.events).toContainEqual({ type: "lost" });
    void rescuer;
  });

  it("advances multiple rescue targets independently through contact and return", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "rescue", targetCount: 2, ticks: 500 } });
    const yard = addBuilding(state, 0, "constructionYard", 0, 0);
    const rescuer = addUnit(state, 0, "infantry", 8, 3);
    const first = addUnit(state, 0, "infantry", 8, 3);
    const second = addUnit(state, 0, "infantry", 16, 3);
    for (const target of [first, second]) {
      target.neutral = true;
      target.scenarioRole = "stranded";
      target.idle = true;
    }
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [first.id, second.id],
      rescued: 0,
      required: 2,
      contactedIds: [],
      rescuedIds: [],
      secondary: [],
    };
    state.fog.fill(0);

    tick(state);
    expect(state.runtime.contactedIds).toEqual([first.id]);
    expect(state.runtime.rescuedIds).toEqual([]);
    first.x = yard.x;
    first.y = yard.y;
    tick(state);
    expect(state.runtime.rescuedIds).toEqual([first.id]);
    expect(state.result).toBe("playing");

    rescuer.x = second.x;
    rescuer.y = second.y;
    tick(state);
    expect(state.runtime.contactedIds).toEqual([first.id, second.id]);
    expect(state.runtime.rescuedIds).toEqual([first.id]);
    second.x = yard.x;
    second.y = yard.y;
    tick(state);
    expect(state.runtime.rescuedIds).toEqual([first.id, second.id]);
    expect(state.result).toBe("won");
  });

  it("starts returning a stranded unit when it is discovered outside contact range", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "rescue", targetCount: 1, ticks: 500 } });
    const yard = addBuilding(state, 0, "constructionYard", 0, 0);
    const rescuer = addUnit(state, 0, "infantry", 2, 3);
    const stranded = addUnit(state, 0, "infantry", 10, 3);
    stranded.neutral = true;
    stranded.scenarioRole = "stranded";
    state.fog.fill(0);
    state.fog[fogIndex(state, stranded.x, stranded.y)!] = 2;
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [stranded.id],
      zone: { x: yard.x, y: yard.y },
      rescued: 0,
      required: 1,
      contactedIds: [],
      rescuedIds: [],
      secondary: [],
    };

    tick(state);

    expect(Math.hypot(rescuer.x - stranded.x, rescuer.y - stranded.y)).toBeGreaterThan(RESCUE_CONTACT_RADIUS);
    expect(stranded.neutral).toBe(false);
    expect(state.runtime.contactedIds).toEqual([stranded.id]);
    expect(stranded.orderMode).toBe("move");
    expect(stranded.orderDestination).toBeDefined();
    expect(stranded.orderDestination).toEqual(expect.not.objectContaining({ x: stranded.x, y: stranded.y }));
  });

  it("preserves tracked rescue contact and return state across save/load", () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "rescue", targetCount: 1, ticks: 500 } });
    addBuilding(state, 0, "constructionYard", 0, 0);
    const rescuer = addUnit(state, 0, "infantry", 8, 3);
    const stranded = addUnit(state, 0, "infantry", 8, 3);
    stranded.idle = true;
    stranded.neutral = true;
    stranded.scenarioRole = "stranded";
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [stranded.id],
      rescued: 0,
      required: 1,
      contactedIds: [],
      rescuedIds: [],
      secondary: [],
    };
    tick(state);

    const restored = deserializeState(serializeState(state));

    expect(restored.runtime?.contactedIds).toEqual([stranded.id]);
    expect(restored.runtime?.rescuedIds).toEqual([]);
    expect(restored.runtime?.phase).toBe("extraction");
    expect(restored.runtime?.rescued).toBe(0);
    void rescuer;
  });

  it("keeps extraction assets stationary until a player unit reaches them", () => {
    const state = makeFixture({ win: { kind: "extraction", targetCount: 1, ticks: 100 } });
    addBuilding(state, 0, "constructionYard", 0, 0);
    const escort = addUnit(state, 0, "infantry", 2, 3);
    const asset = addUnit(state, 0, "infantry", 6, 3);
    asset.neutral = true;
    state.runtime = {
      kind: "extraction",
      phase: "active",
      targetIds: [asset.id],
      zone: { x: 0, y: 0 },
      deadline: 100,
      rescued: 0,
      required: 1,
      secondary: [],
    };

    issue(state, { type: "move", unitIds: [asset.id], x: 9, y: 3 });
    for (let i = 0; i < 10; i++) tick(state);
    expect(asset.neutral).toBe(true);
    expect(asset.x).toBe(6);
    expect(asset.y).toBe(3);

    issue(state, { type: "move", unitIds: [escort.id], x: asset.x, y: asset.y });
    for (let i = 0; i < 100 && asset.neutral; i++) tick(state);
    expect(asset.neutral).toBe(false);

    issue(state, { type: "move", unitIds: [asset.id], x: 9, y: 3 });
    for (let i = 0; i < 100; i++) tick(state);
    expect(asset.x).toBeGreaterThan(6);
  });

  it("counts extraction assets only after they reach the home zone", () => {
    const state = makeFixture({ win: { kind: "extraction", targetCount: 2, ticks: 5000 } });
    addBuilding(state, 0, "constructionYard", 0, 0);
    const escort = addUnit(state, 0, "infantry", 2, 3);
    const first = addUnit(state, 0, "infantry", 8, 3);
    const second = addUnit(state, 0, "infantry", 8, 5);
    first.neutral = true;
    first.marked = true;
    second.neutral = true;
    second.marked = true;
    state.runtime = {
      kind: "extraction",
      phase: "active",
      targetIds: [first.id, second.id],
      zone: { x: 0, y: 0 },
      deadline: 100,
      rescued: 0,
      required: 2,
      secondary: [],
    };

    issue(state, { type: "move", unitIds: [escort.id], x: first.x, y: first.y });
    for (let i = 0; i < 100 && first.neutral; i++) tick(state);
    expect(first.neutral).toBe(false);
    tick(state);
    expect(state.runtime.rescued).toBe(0);
    expect(tooltipLines(state, first, {})).toContain("Return to extraction zone");
    expect(tileTooltipLines(state, 0, 0)).toContain("Extraction zone");

    state.runtime.zone = { x: 9, y: 9 };
    first.x = 1;
    first.y = 1;
    tick(state);
    expect(state.runtime.zone).toEqual({ x: 0, y: 0 });
    expect(state.runtime.rescued).toBe(1);
    expect(first.marked).toBe(false);
    expect(objectiveProgress(state).label).toBe("Extracted 1 / 2");
    expect(tooltipLines(state, first, {})).not.toContain("Return to extraction zone");

    first.x = 8;
    first.y = 3;
    tick(state);
    expect(state.runtime.rescued).toBe(1);

    issue(state, { type: "move", unitIds: [escort.id], x: second.x, y: second.y });
    for (let i = 0; i < 100 && second.neutral; i++) tick(state);
    second.x = 0;
    second.y = 1;
    tick(state);
    expect(state.runtime.rescued).toBe(2);
    expect(objectiveProgress(state).label).toBe("Extracted 2 / 2");
    expect(inspect(state).result).toBe("won");
  });

  it("places extraction drop-off at the player construction yard", () => {
    const state = createMission({ seed: 41, missionIndex: 0 });
    expect(state.missionKind).toBe("extraction");
    const yard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard");
    expect(yard).toBeDefined();
    expect(state.runtime?.zone).toEqual({ x: yard!.x, y: yard!.y });
    expect(state.entities.some((entity) => entity.marked && entity.neutral)).toBe(true);
  });

  it("spreads extraction assets across the map and outside the enemy base", () => {
    let checked = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const mission = createCampaign(seed).missions.find((candidate) => candidate.win.kind === "extraction");
      if (!mission) continue;
      const state = createMission({ seed, missionIndex: mission.index });
      const targets = (state.runtime?.targetIds ?? [])
        .map((id) => state.entities.find((entity) => entity.id === id))
        .filter((target): target is NonNullable<typeof target> => target !== undefined);
      const enemyBuildings = state.entities.filter((entity) =>
        entity.owner === 1 && entity.class === "building" && entity.hp > 0,
      );
      const playerBuildings = state.entities.filter((entity) =>
        entity.owner === 0 && entity.class === "building" && entity.hp > 0,
      );
      const pairDistances = targets.flatMap((target, index) => targets
        .slice(index + 1)
        .map((other) => Math.hypot(target.x - other.x, target.y - other.y)));
      expect(Math.min(...pairDistances)).toBeGreaterThanOrEqual(6);
      expect(Math.max(...pairDistances)).toBeGreaterThanOrEqual(state.width * 0.25);
      expect(targets.every((target) => playerBuildings.every((building) => distToEntity(target, building) >= 8))).toBe(true);
      expect(targets.every((target) => enemyBuildings.every((building) => distToEntity(target, building) >= 14))).toBe(true);
      if (targets.length >= 3) {
        let maximumTriangleArea = 0;
        for (let i = 0; i < targets.length; i += 1) {
          for (let j = i + 1; j < targets.length; j += 1) {
            for (let k = j + 1; k < targets.length; k += 1) {
              const first = targets[i]!;
              const second = targets[j]!;
              const third = targets[k]!;
              maximumTriangleArea = Math.max(
                maximumTriangleArea,
                Math.abs(
                  (second.x - first.x) * (third.y - first.y)
                    - (second.y - first.y) * (third.x - first.x),
                ),
              );
            }
          }
        }
        expect(maximumTriangleArea).toBeGreaterThanOrEqual(9);
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("labels locked rescue and extraction targets as stranded", () => {
    for (const kind of ["rescue", "extraction"] as const) {
      const state = makeFixture({ win: { kind, targetCount: 1, ticks: 100 } });
      const stranded = addUnit(state, 0, "infantry", 6, 3);
      stranded.neutral = true;
      state.runtime = {
        kind,
        phase: "active",
        targetIds: [stranded.id],
        zone: { x: 0, y: 0 },
        deadline: 100,
        rescued: 0,
        required: 1,
        secondary: [],
      };

      expect(tooltipLines(state, stranded, {})).toContain("Stranded");
    }
  });

  it("fails a rescue quota when the operation deadline expires", () => {
    const state = makeFixture({ width: 24, height: 16, win: { kind: "rescue", targetCount: 3, ticks: 10 } });
    addBuilding(state, 0, "constructionYard", 0, 0);
    const stranded = [0, 1, 2].map((index) => {
      const unit = addUnit(state, 0, "infantry", 12, 3 + index);
      unit.neutral = true;
      unit.scenarioRole = "stranded";
      return unit;
    });
    state.fog.fill(0);
    state.tick = 10;
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: stranded.map((unit) => unit.id),
      deadline: 10,
      rescued: 0,
      required: 3,
      secondary: [{ id: "time", kind: "completeBefore", label: "Complete before deadline", target: 10 }],
    };

    const result = tick(state);

    expect(state.result).toBe("lost");
    expect(state.lossReason).toBe("deadline");
    expect(result.events).toContainEqual({ type: "objectiveExpired", kind: "rescue" });
  });

  it("makes convoy units vulnerable and announces contact", () => {
    const state = makeFixture({ width: 16, height: 12, win: { kind: "escort", targetCount: 1, ticks: 100 } });
    addBuilding(state, 0, "constructionYard", 0, 0);
    const convoy = addUnit(state, 0, "convoyTruck", 6, 4);
    convoy.neutral = true;
    convoy.scenarioRole = "convoy";
    const attacker = addUnit(state, 1, "antiArmor", 5, 4);
    const hp = convoy.hp;

    const events = tickCombat(state);

    expect(convoy.hp).toBeLessThan(hp);
    expect(attacker.attackTarget).toBe(convoy.id);
    expect(convoy.attackTarget).toBeUndefined();
    expect(events.some((event) => event.type === "combat" && event.owner === 0)).toBe(false);
    expect(events).toContainEqual({ type: "alert", kind: "contact", text: "Convoy under attack" });
  });

  it("fails escort when a convoy target is destroyed", () => {
    const state = makeFixture({ win: { kind: "escort", targetCount: 1, ticks: 100 } });
    addBuilding(state, 0, "constructionYard", 0, 0);
    const convoy = addUnit(state, 0, "convoyTruck", 6, 4);
    convoy.neutral = true;
    convoy.scenarioRole = "convoy";
    convoy.hp = 0;
    state.runtime = {
      kind: "escort",
      phase: "active",
      targetIds: [convoy.id],
      zone: { x: 10, y: 4 },
      deadline: 100,
      rescued: 0,
      required: 1,
      secondary: [],
    };

    const result = tick(state);

    expect(state.result).toBe("lost");
    expect(state.lossReason).toBe("objectiveTargetLost");
    expect(result.events).toContainEqual({ type: "lost" });
  });

  it("fails extraction when an unextracted cargo unit is destroyed", () => {
    const state = makeFixture({ win: { kind: "extraction", targetCount: 1, ticks: 100 } });
    addBuilding(state, 0, "constructionYard", 0, 0);
    const cargo = addUnit(state, 0, "infantry", 6, 4);
    cargo.neutral = false;
    cargo.scenarioRole = "cargo";
    cargo.hp = 0;
    state.runtime = {
      kind: "extraction",
      phase: "extraction",
      targetIds: [cargo.id],
      zone: { x: 0, y: 0 },
      deadline: 100,
      rescued: 0,
      required: 1,
      secondary: [],
    };

    const result = tick(state);

    expect(state.result).toBe("lost");
    expect(state.lossReason).toBe("objectiveTargetLost");
    expect(result.events).toContainEqual({ type: "lost" });
  });

  it("does not fail extraction when already-extracted cargo is destroyed", () => {
    const state = makeFixture({ win: { kind: "extraction", targetCount: 2, ticks: 5000 } });
    addBuilding(state, 0, "constructionYard", 0, 0);
    const extracted = addUnit(state, 0, "infantry", 1, 1);
    const remaining = addUnit(state, 0, "infantry", 6, 4);
    extracted.scenarioRole = "cargo";
    extracted.hp = 0;
    remaining.neutral = true;
    remaining.scenarioRole = "cargo";
    remaining.marked = true;
    state.runtime = {
      kind: "extraction",
      phase: "extraction",
      targetIds: [extracted.id, remaining.id],
      extractedIds: [extracted.id],
      zone: { x: 0, y: 0 },
      deadline: 5000,
      rescued: 1,
      required: 2,
      secondary: [],
    };

    const result = tick(state);

    expect(state.result).toBe("playing");
    expect(state.lossReason).toBeUndefined();
    expect(result.events).not.toContainEqual({ type: "lost" });
    expect(state.runtime.rescued).toBe(1);
  });

  it("fails rescue when an unrescued stranded unit is destroyed", () => {
    const state = makeFixture({ win: { kind: "rescue", targetCount: 1, ticks: 100 } });
    addBuilding(state, 0, "constructionYard", 0, 0);
    const stranded = addUnit(state, 0, "infantry", 6, 4);
    stranded.neutral = true;
    stranded.scenarioRole = "stranded";
    stranded.hp = 0;
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [stranded.id],
      zone: { x: 0, y: 0 },
      deadline: 100,
      rescued: 0,
      required: 1,
      secondary: [],
    };

    const result = tick(state);

    expect(state.result).toBe("lost");
    expect(state.lossReason).toBe("objectiveTargetLost");
    expect(result.events).toContainEqual({ type: "lost" });
  });

  it("does not fail rescue when an already-contacted unit is destroyed", () => {
    const state = makeFixture({ win: { kind: "rescue", targetCount: 2, ticks: 5000 } });
    addBuilding(state, 0, "constructionYard", 0, 0);
    const rescued = addUnit(state, 0, "infantry", 1, 1);
    const remaining = addUnit(state, 0, "infantry", 10, 8);
    rescued.scenarioRole = "stranded";
    rescued.neutral = false;
    rescued.hp = 0;
    remaining.neutral = true;
    remaining.scenarioRole = "stranded";
    state.fog.fill(0);
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [rescued.id, remaining.id],
      zone: { x: 0, y: 0 },
      deadline: 5000,
      rescued: 1,
      required: 2,
      secondary: [],
    };

    const result = tick(state);

    expect(state.result).toBe("playing");
    expect(state.lossReason).toBeUndefined();
    expect(result.events).not.toContainEqual({ type: "lost" });
    expect(state.runtime.rescued).toBe(1);
  });

  it("counts a convoy truck after it reaches the escort zone", () => {
    const state = makeFixture({ width: 16, height: 12, win: { kind: "escort", targetCount: 1, ticks: 100 } });
    addBuilding(state, 0, "constructionYard", 0, 0);
    const convoy = addUnit(state, 0, "convoyTruck", 10, 4);
    convoy.neutral = true;
    convoy.scenarioRole = "convoy";
    state.runtime = {
      kind: "escort",
      phase: "active",
      targetIds: [convoy.id],
      zone: { x: convoy.x, y: convoy.y },
      deadline: 100,
      rescued: 0,
      required: 1,
      secondary: [],
    };

    const result = tick(state);

    expect(state.runtime.rescued).toBe(1);
    expect(result.events).toContainEqual({ type: "won" });
  });

  it("recovers suppression on non-combat units and seeds classic secondary objectives", () => {
    const state = createMission({ seed: 0, missionIndex: 2 });
    const harvester = state.entities.find((entity) => entity.owner === 0 && entity.kind === "harvester")!;
    harvester.suppression = 10;
    tick(state);
    expect(harvester.suppression).toBe(9);
    expect(state.runtime?.secondary).toHaveLength(2);
    expect(state.runtime?.secondary[1]?.target).toBeDefined();
  });

  it("shows suppression on the unit hover tooltip", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 4, 4);
    expect(tooltipLines(state, unit, {}).some((line) => line.startsWith("Suppressed"))).toBe(false);
    unit.suppression = 42.2;
    expect(tooltipLines(state, unit, {})).toContain("Suppressed 43%");
  });
});
