import { describe, expect, it } from "vitest";
import { createRng } from "../../lib/seed/rng";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { createMission, issue } from "../../lib/sim/api";
import { tickAircraft } from "../../lib/sim/aircraft";
import { strike } from "../../lib/sim/combat/damage";
import { statsFor } from "../../lib/sim/combat/grid";
import { tickChallenges } from "../../lib/sim/challenges";
import { battleLesson } from "../../lib/sim/debrief";
import { applyDeploymentEdge } from "../../lib/sim/deployment";
import { tickMissionDirector } from "../../lib/sim/director";
import {
  CACHE_CREDITS,
  CACHE_FINALE_PULL_TICKS,
  canyonGullyVehicleCost,
  deploymentEdgeForMission,
  enemyDoctrine,
  fieldNotes,
  volcanicClosureCost,
  VOLCANIC_CLOSURE_COST,
  CANYON_GULLY_VEHICLE_COST,
  VETERAN_DAMAGE,
} from "../../lib/sim/fieldIdentity";
import { noteDamageDealt, tickBombards } from "../../lib/sim/verbs";
import { powerBreakdown } from "../../lib/sim/world";
import type { SimEvent } from "../../lib/types";

describe("field identity", () => {
  it("gives named factions a doctrine and leaves fixture names alone", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    expect(enemyDoctrine(state)).toBeUndefined();
    state.factions[1]!.name = "Iron Legion";
    expect(enemyDoctrine(state)).toMatchObject({ assaultScale: 0.82, thinTurrets: true, raidHarvesters: false });
    state.tutorialStage = "move";
    expect(enemyDoctrine(state)).toBeUndefined();
    expect(fieldNotes("TestB", "ash plains").doctrine).toBeUndefined();
    expect(fieldNotes("Ash Legion", "volcanic shelf").doctrine).toContain("attacks sooner");
    expect(fieldNotes("Ash Legion", "volcanic shelf").ground).toContain("Lava scars");
  });

  it("slows lava scars on a cycle and vehicles in an active gully", () => {
    expect(volcanicClosureCost(10, "lavaScar", true)).toBe(VOLCANIC_CLOSURE_COST);
    expect(volcanicClosureCost(120, "lavaScar", true)).toBeUndefined();
    expect(volcanicClosureCost(10, "lavaScar", false)).toBeUndefined();
    expect(canyonGullyVehicleCost("strataGully", true)).toBe(CANYON_GULLY_VEHICLE_COST);
    expect(canyonGullyVehicleCost("strataGully", false)).toBeUndefined();
  });

  it("adds crystal power outside the tutorial", () => {
    const crystal = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    crystal.biome = "crystal flats";
    addBuilding(crystal, 0, "power", 2, 2);
    const ash = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    addBuilding(ash, 0, "power", 2, 2);
    expect(powerBreakdown(crystal, 0).produced - powerBreakdown(ash, 0).produced).toBe(20);

    const training = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    training.biome = "crystal flats";
    training.tutorialStage = "build";
    addBuilding(training, 0, "power", 2, 2);
    expect(powerBreakdown(training, 0).produced).toBe(powerBreakdown(ash, 0).produced);
  });
});

describe("campaign memory", () => {
  it("ranks a player unit after enough damage and keeps the rank on the strike", () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const veteran = addUnit(state, 0, "infantry", 4, 4);
    const fresh = addUnit(state, 0, "infantry", 6, 4);
    const target = addUnit(state, 1, "infantry", 8, 4);
    target.hp = 500;
    noteDamageDealt(state, veteran, VETERAN_DAMAGE);
    expect(veteran.veteranRank).toBe(1);

    const before = target.hp;
    strike(state, veteran, target, statsFor(veteran), createRng(3), []);
    const veteranDamage = before - target.hp;
    target.hp = before;
    strike(state, fresh, target, statsFor(fresh), createRng(3), []);
    expect(veteranDamage / (before - target.hp)).toBeCloseTo(1.12, 5);
  });

  it("applies a deployment edge once on the next unlocked mission", () => {
    expect(deploymentEdgeForMission({ unlockedMission: 1, deploymentEdge: "powerReserve" }, 1)).toBe("powerReserve");
    expect(deploymentEdgeForMission({ unlockedMission: 2, deploymentEdge: "powerReserve" }, 1)).toBeUndefined();
    expect(deploymentEdgeForMission({ unlockedMission: 0, deploymentEdge: "veteranSquad" }, 0)).toBeUndefined();

    const state = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    addBuilding(state, 0, "constructionYard", 2, 2);
    const plain = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    addBuilding(plain, 0, "constructionYard", 2, 2);
    applyDeploymentEdge(state, "powerReserve");
    expect(state.powerReserve).toBe(40);
    expect(powerBreakdown(state, 0).produced - powerBreakdown(plain, 0).produced).toBe(40);
    expect(powerBreakdown(state, 0).surplus - powerBreakdown(plain, 0).surplus).toBe(40);

    applyDeploymentEdge(state, "veteranSquad");
    const veterans = state.entities.filter((entity) => entity.kind === "infantry" && entity.veteranRank === 1);
    expect(veterans.length).toBe(4);

    const launched = createMission({ seed: 4, missionIndex: 1, deploymentEdge: "powerReserve" });
    expect(launched.powerReserve).toBe(40);
  });
});

describe("field verbs", () => {
  it("entrenches holding infantry and lets a brace end on a move", () => {
    const dug = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const shooter = addUnit(dug, 0, "infantry", 3, 3);
    const held = addUnit(dug, 1, "infantry", 5, 3);
    held.stance = "hold";
    held.idle = true;
    held.path = [];
    held.hp = 400;
    const open = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const otherShooter = addUnit(open, 0, "infantry", 3, 3);
    const moving = addUnit(open, 1, "infantry", 5, 3);
    moving.hp = 400;
    strike(dug, shooter, held, statsFor(shooter), createRng(9), []);
    strike(open, otherShooter, moving, statsFor(otherShooter), createRng(9), []);
    expect((400 - held.hp) / (400 - moving.hp)).toBeCloseTo(0.7, 5);

    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const tank = addUnit(state, 0, "tank", 4, 4);
    expect(issue(state, { type: "brace", unitIds: [tank.id] })).toEqual([]);
    expect(tank.braced).toBe(true);
    expect(tank.idle).toBe(true);
    issue(state, { type: "move", unitIds: [tank.id], x: 10, y: 10 });
    expect(tank.braced).toBeUndefined();
  });

  it("resolves a planted behemoth shot after the charge", () => {
    const state = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    const behemoth = addUnit(state, 0, "behemoth", 2, 2);
    const enemy = addUnit(state, 1, "infantry", 10, 8);
    const before = enemy.hp;
    expect(issue(state, { type: "bombard", unitIds: [behemoth.id], x: enemy.x, y: enemy.y })).toEqual([]);
    expect(behemoth.bombard?.remaining).toBe(36);
    for (let tick = 0; tick < 35; tick += 1) tickBombards(state);
    expect(enemy.hp).toBe(before);
    tickBombards(state);
    expect(behemoth.bombard).toBeUndefined();
    expect(enemy.hp).toBeLessThan(before);
    expect(enemy.suppression).toBeGreaterThan(0);
  });

  it("says when a strike plane is returning to rearm", () => {
    const state = makeFixture({ width: 24, height: 16, win: { kind: "annihilate" } });
    const runway = addBuilding(state, 0, "runway", 2, 2);
    const plane = addUnit(state, 0, "strikePlane", 16, 8);
    plane.assignedRunwayId = runway.id;
    runway.assignedPlaneId = plane.id;
    plane.ammo = 0;
    plane.flightState = "airborne";
    const events: SimEvent[] = [];
    tickAircraft(state, events);
    tickAircraft(state, events);
    const alerts = events.filter((event) => event.type === "alert" && event.text.includes("out of bombs"));
    expect(alerts).toHaveLength(1);
  });
});

describe("mission drama", () => {
  it("pays a raided cache and recruits a stranded mechanic on contact", () => {
    const state = makeFixture({ width: 24, height: 16, win: { kind: "annihilate" } });
    const cache = addBuilding(state, 1, "objective", 12, 4);
    cache.optionalChallenge = true;
    const mechanic = addUnit(state, 1, "repairTruck", 6, 6);
    mechanic.neutral = true;
    mechanic.recruitable = true;
    mechanic.optionalChallenge = true;
    state.runtime = {
      kind: "annihilate",
      phase: "active",
      targetIds: [],
      rescued: 0,
      required: 0,
      director: { phase: "opening", pressureStart: 1000, finaleStart: 4000, eventCount: 0 },
      secondary: [
        { id: "bonus-cache", kind: "destroyTarget", priority: "optional", targetId: cache.id, label: "cache" },
        { id: "bonus-mechanic", kind: "secureZone", priority: "optional", zone: { x: 6, y: 6 }, target: 1, label: "mechanic" },
      ],
    };
    cache.hp = 0;
    const credits = state.credits[0];
    tickChallenges(state);
    expect(state.credits[0]).toBe(credits + CACHE_CREDITS);
    expect(state.runtime.director?.finaleStart).toBe(4000 - CACHE_FINALE_PULL_TICKS);
    expect(state.runtime.finalePullTicks).toBe(CACHE_FINALE_PULL_TICKS);
    expect(mechanic.owner).toBe(1);

    addUnit(state, 0, "infantry", mechanic.x, mechanic.y);
    tickChallenges(state);
    expect(mechanic.owner).toBe(0);
    expect(mechanic.recruitable).toBeUndefined();
    expect(state.runtime.secondary.find((objective) => objective.id === "bonus-mechanic")?.completed).toBe(true);
  });

  it("warns once before the finale and names the loss that decided the battle", () => {
    const state = createMission({ seed: 2, missionIndex: 0 });
    const director = state.runtime!.director!;
    state.tick = director.finaleStart - 1;
    if (state.runtime?.kind === "rescue" && state.tick % 6 === 0) state.tick -= 1;
    const warning = tickMissionDirector(state);
    expect(warning[0]).toMatchObject({
      type: "alert",
      kind: "warning",
      text: expect.stringContaining("ten seconds"),
    });
    expect(director.finaleWarned).toBe(true);
    expect(director.phase).not.toBe("finale");
    state.tick = director.finaleStart;
    const finale = tickMissionDirector(state);
    expect(director.phase).toBe("finale");
    expect(finale[0]).toMatchObject({ type: "alert" });
    expect(String(finale[0] && "text" in finale[0] ? finale[0].text : "")).not.toContain("ten seconds");

    const lost = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    lost.result = "lost";
    expect(battleLesson(lost)).toBe("Harvesters were gone before a second refinery came online.");
    addUnit(lost, 0, "harvester", 3, 3);
    lost.lossReason = "deadline";
    expect(battleLesson(lost)).toBe("The finale arrived with no anti-armor in the field.");
    lost.result = "won";
    expect(battleLesson(lost)).toBeUndefined();
  });
});
