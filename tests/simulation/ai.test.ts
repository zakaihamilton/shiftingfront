import { describe, expect, it } from "vitest";
import { RETREAT_MAX_TICKS, RETREAT_RECOVER_HEALTH, tickAi } from "../../lib/sim/ai";
import { createMission, tick } from "../../lib/sim/api";
import { objectiveContractFor } from "../../lib/gen/profile";
import { tickMissionDirector } from "../../lib/sim/director";
import { addBuilding, addUnit, makeFixture, setTile, TILE_RESOURCE } from "../../lib/sim/fixtures";
import { missionDifficulty } from "../../lib/sim/difficulty";
import { powerFor } from "../../lib/sim/world";
import { queueUnit } from "../../lib/sim/ai/helpers";
import { assignAssault } from "../../lib/sim/ai/combat";

describe("enemy AI", () => {
  it("builds toward a contested resource lane before committing another wave", () => {
    const s = makeFixture({ width: 36, height: 36, win: { kind: "destroyMarked", targetCount: 1 } });
    addBuilding(s, 1, "constructionYard", 4, 4);
    addBuilding(s, 1, "power", 7, 4);
    addBuilding(s, 1, "refinery", 4, 8);
    addBuilding(s, 0, "constructionYard", 30, 30);
    setTile(s, 18, 4, TILE_RESOURCE, 1200);
    s.credits[1] = 5000;
    const difficulty = missionDifficulty(0);
    s.runtime = {
      kind: "destroyMarked",
      phase: "active",
      targetIds: [],
      rescued: 0,
      required: 1,
      secondary: [],
      director: { phase: "pressure", pressureStart: 100, finaleStart: 1000, eventCount: 1 },
    };

    s.tick = difficulty.enemyProductionStart;
    tickAi(s);
    expect(s.entities.some((e) => e.owner === 1 && e.kind === "power" && e.constructing > 0 && e.x > 8)).toBe(true);

    const productionEvery = Math.round(difficulty.enemyProductionEvery * objectiveContractFor("destroyMarked")!.productionScale);
    s.tick = difficulty.enemyProductionStart + productionEvery;
    tickAi(s);
    expect(s.entities.some((e) => e.owner === 1 && e.kind === "refinery" && e.constructing > 0 && e.x > 10)).toBe(true);
  });

  it("expands into an unserved resource lane on a generated campaign map", () => {
    const s = createMission({ seed: 0, missionIndex: 0 });
    const initialBuildingIds = new Set(s.entities.filter((entity) => entity.owner === 1 && entity.class === "building").map((entity) => entity.id));
    const yard = s.entities.find((entity) => entity.owner === 1 && entity.kind === "constructionYard")!;
    const director = s.runtime!.director!;
    const difficulty = missionDifficulty(s.missionIndex);
    const productionTick = difficulty.enemyProductionStart
      + Math.ceil((director.pressureStart - difficulty.enemyProductionStart) / difficulty.enemyProductionEvery) * difficulty.enemyProductionEvery;

    s.tick = director.pressureStart;
    tickMissionDirector(s);
    s.tick = productionTick;
    tickAi(s);

    expect(s.entities.some((entity) =>
      entity.owner === 1 &&
      entity.class === "building" &&
      (entity.kind === "power" || entity.kind === "refinery") &&
      entity.constructing > 0 &&
      !initialBuildingIds.has(entity.id) &&
      Math.hypot(entity.x - yard.x, entity.y - yard.y) >= 10,
    )).toBe(true);

    s.tick = productionTick + difficulty.enemyProductionEvery;
    tickAi(s);
    expect(s.entities.some((entity) =>
      entity.owner === 1 &&
      entity.class === "building" &&
      entity.kind === "refinery" &&
      entity.constructing > 0 &&
      !initialBuildingIds.has(entity.id) &&
      Math.hypot(entity.x - yard.x, entity.y - yard.y) >= 10,
    )).toBe(true);
  });

  it("posts a combat unit on the contested resource lane", () => {
    const s = makeFixture({ width: 36, height: 36, win: { kind: "annihilate" } });
    addBuilding(s, 1, "constructionYard", 4, 4);
    addBuilding(s, 1, "power", 7, 4);
    addBuilding(s, 1, "refinery", 4, 8);
    setTile(s, 18, 4, TILE_RESOURCE, 1200);
    const homeGuard = addUnit(s, 1, "infantry", 6, 4);
    const laneGuard = addUnit(s, 1, "tank", 12, 8);
    s.runtime = {
      kind: "annihilate",
      phase: "active",
      targetIds: [],
      rescued: 0,
      required: 1,
      secondary: [],
      director: { phase: "pressure", pressureStart: 100, finaleStart: 1000, eventCount: 1 },
    };

    tickAi(s);

    expect(homeGuard.orderDestination).toBeUndefined();
    expect(laneGuard.orderDestination).toEqual({ x: 18, y: 4 });
    expect(laneGuard.orderMode).toBe("move");
  });

  it("builds a power plant before a factory when the grid is in deficit", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    addBuilding(s, 1, "constructionYard", 12, 12);
    addBuilding(s, 1, "barracks", 8, 12);
    addBuilding(s, 1, "refinery", 12, 15);
    addBuilding(s, 1, "turret", 7, 12);
    s.credits[1] = 5000;
    s.tick = 96;
    expect(powerFor(s, 1)).toBeLessThan(0);

    tickAi(s);

    expect(s.entities.some((e) => e.owner === 1 && e.kind === "power" && e.constructing > 0)).toBe(true);
    expect(s.entities.some((e) => e.kind === "factory")).toBe(false);
  });

  it("does not spend on unrelated buildings while power recovery is pending", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "razeAll" } });
    addBuilding(s, 1, "constructionYard", 12, 12);
    addBuilding(s, 1, "power", 16, 12, 100);
    s.credits[1] = 5000;
    s.tick = missionDifficulty(0).enemyProductionStart;

    tickAi(s);

    expect(s.entities.filter((e) => e.owner === 1 && e.kind === "barracks")).toHaveLength(0);
  });

  it("assigns idle combat units to a player threat near the yard", () => {
    const s = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
    addBuilding(s, 1, "constructionYard", 8, 8);
    const guard = addUnit(s, 1, "infantry", 10, 8);
    const harvester = addUnit(s, 1, "harvester", 11, 9);
    const foe = addUnit(s, 0, "tank", 9, 10);

    tickAi(s);

    expect(guard.attackTarget).toBe(foe.id);
    expect(guard.path.length).toBeGreaterThan(0);
    expect(harvester.attackTarget).toBeUndefined();
  });

  it("sends assault raiders at a player harvester and leaves a home guard", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "destroyMarked", targetCount: 1 } });
    addBuilding(s, 1, "constructionYard", 2, 2);
    addBuilding(s, 0, "constructionYard", 18, 18);
    const guard = addUnit(s, 1, "infantry", 5, 2);
    const raider = addUnit(s, 1, "infantry", 8, 8);
    const extra = addUnit(s, 1, "tank", 9, 9);
    const harvester = addUnit(s, 0, "harvester", 12, 12);
    const playerYard = s.entities.find((e) => e.owner === 0 && e.kind === "constructionYard")!;
    s.tick = missionDifficulty(0).enemyAssaultEvery + objectiveContractFor("destroyMarked")!.assaultDelay;

    tickAi(s);

    expect(s.aiState).toBe("assault");
    expect(guard.attackTarget).toBeUndefined();
    expect(guard.path).toEqual([]);
    expect([raider.attackTarget, extra.attackTarget]).toEqual([harvester.id, playerYard.id]);
    expect(raider.path.length).toBeGreaterThan(0);
  });

  it("splits two assault raiders between a harvester and the player yard", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "destroyMarked", targetCount: 1 } });
    addBuilding(s, 1, "constructionYard", 2, 2);
    const playerYard = addBuilding(s, 0, "constructionYard", 18, 18);
    addUnit(s, 1, "infantry", 5, 2);
    const even = addUnit(s, 1, "infantry", 8, 8);
    const odd = addUnit(s, 1, "infantry", 9, 9);
    const harvester = addUnit(s, 0, "harvester", 12, 12);
    s.tick = missionDifficulty(0).enemyAssaultEvery + objectiveContractFor("destroyMarked")!.assaultDelay;

    tickAi(s);

    expect(s.aiState).toBe("assault");
    expect(even.attackTarget).toBe(harvester.id);
    expect(odd.attackTarget).toBe(playerYard.id);
  });

  it("checks the sorted raider cohort before skipping an assault refresh", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
    const enemyYard = addBuilding(state, 1, "constructionYard", 2, 2);
    const playerYard = addBuilding(state, 0, "constructionYard", 16, 16);
    const raider = addUnit(state, 1, "infantry", 10, 10);
    const guard = addUnit(state, 1, "infantry", 3, 2);
    guard.attackTarget = playerYard.id;

    // The input order deliberately differs from distance order. The guard is
    // already assigned, but the farther raider still needs an order.
    assignAssault(state, [raider, guard], enemyYard, playerYard, false);

    expect(guard.attackTarget).toBe(playerYard.id);
    expect(raider.attackTarget).toBe(playerYard.id);
  });

  it("prioritizes a live convoy over the default harassment targets", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "escort", targetCount: 1, ticks: 5000 } });
    addBuilding(s, 1, "constructionYard", 2, 2);
    addBuilding(s, 0, "constructionYard", 18, 18);
    addUnit(s, 1, "infantry", 5, 2);
    const raider = addUnit(s, 1, "tank", 8, 8);
    const convoy = addUnit(s, 0, "convoyTruck", 15, 15);
    convoy.neutral = true;
    convoy.scenarioRole = "convoy";
    addUnit(s, 0, "harvester", 16, 16);
    s.runtime = {
      kind: "escort",
      phase: "active",
      targetIds: [convoy.id],
      zone: { x: 20, y: 20 },
      deadline: 5000,
      rescued: 0,
      required: 1,
      secondary: [],
    };
    s.tick = missionDifficulty(0).enemyAssaultEvery;

    tickAi(s);

    expect(raider.attackTarget).toBe(convoy.id);
  });

  it("does not let the AI queue scenario-only convoy trucks", () => {
    const s = makeFixture({ win: { kind: "annihilate" } });
    const factory = addBuilding(s, 1, "factory", 4, 4);
    addBuilding(s, 1, "power", 7, 4);
    s.credits[1] = 5000;

    expect(queueUnit(s, factory, "convoyTruck")).toBe(false);
    expect(factory.producing).toBeUndefined();
  });

  it("stations a guard near marked sabotage targets", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "sabotage", targetCount: 1, ticks: 5000 } });
    addBuilding(s, 1, "constructionYard", 2, 2);
    const target = addBuilding(s, 1, "objective", 10, 10, 0, true);
    const guard = addUnit(s, 1, "infantry", 8, 8);
    s.runtime = {
      kind: "sabotage",
      phase: "active",
      targetIds: [target.id],
      rescued: 0,
      required: 1,
      secondary: [],
    };

    tickAi(s);

    expect(guard.orderMode).toBe("move");
    expect(guard.path.at(-1)).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it("keeps generated destroy-marked targets available to the AI guard logic", () => {
    const s = createMission({ seed: 421, missionIndex: 1 });
    expect(s.win.kind).toBe("destroyMarked");
    expect(s.runtime?.targetIds).toEqual(s.win.targetIds);

    const targetIds = s.runtime?.targetIds ?? [];
    expect(targetIds.length).toBeGreaterThan(0);

    tickAi(s);

    const guards = s.entities.filter(
      (entity) => entity.owner === 1 && entity.class === "unit" && entity.kind !== "harvester" && entity.orderMode === "move",
    );
    expect(guards.length).toBeGreaterThanOrEqual(targetIds.length);
    for (const targetId of targetIds) {
      const target = s.entities.find((entity) => entity.id === targetId)!;
      expect(guards.some((guard) => {
        const destination = guard.orderDestination;
        return destination !== undefined && Math.hypot(destination.x - target.x, destination.y - target.y) <= 4;
      })).toBe(true);
    }
  });

  it("places a turret when a threat is at the yard", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    addBuilding(s, 1, "constructionYard", 12, 12);
    addUnit(s, 0, "tank", 14, 12);
    s.credits[1] = 5000;

    tickAi(s);

    expect(s.aiState).toBe("defense");
    expect(s.entities.some((e) => e.owner === 1 && e.kind === "turret" && e.constructing > 0)).toBe(true);
  });

  it("retreats battered combat units to the enemy yard", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    const yard = addBuilding(s, 1, "constructionYard", 2, 2);
    addBuilding(s, 0, "constructionYard", 18, 18);
    const wounded = addUnit(s, 1, "infantry", 16, 16);
    const ally = addUnit(s, 1, "tank", 15, 16);
    wounded.hp = 10;
    ally.hp = 10;
    wounded.attackTarget = 99;
    ally.attackTarget = 99;

    tickAi(s);

    expect(s.aiState).toBe("retreat");
    expect(wounded.attackTarget).toBeUndefined();
    expect(ally.attackTarget).toBeUndefined();
    expect(wounded.path.at(-1)).toEqual(expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number),
    }));
    const end = wounded.path.at(-1)!;
    expect(Math.hypot(end.x - yard.x, end.y - yard.y)).toBeLessThan(4);
  });

  it("assigns an idle raider between assault waves", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "destroyMarked", targetCount: 1 } });
    s.biome = "crystal flats";
    addBuilding(s, 1, "constructionYard", 2, 2);
    addBuilding(s, 0, "constructionYard", 18, 18);
    const guard = addUnit(s, 1, "infantry", 5, 2);
    const raider = addUnit(s, 1, "infantry", 8, 8);
    const harvester = addUnit(s, 0, "harvester", 12, 12);
    s.tick = missionDifficulty(0).enemyAssaultEvery + objectiveContractFor("destroyMarked")!.assaultDelay + 1;

    tickAi(s);

    expect(s.aiState).toBe("assault");
    expect(guard.attackTarget).toBeUndefined();
    expect(raider.attackTarget).toBe(harvester.id);
    expect(raider.path.length).toBeGreaterThan(0);
  });

  it("leaves retreat after HP recovers and recommits raiders", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "destroyMarked", targetCount: 1 } });
    addBuilding(s, 1, "constructionYard", 2, 2);
    addBuilding(s, 0, "constructionYard", 18, 18);
    const guard = addUnit(s, 1, "infantry", 5, 2);
    const raider = addUnit(s, 1, "tank", 9, 9);
    const harvester = addUnit(s, 0, "harvester", 12, 12);
    s.tick = missionDifficulty(0).enemyAssaultEvery + objectiveContractFor("destroyMarked")!.assaultDelay;
    raider.hp = 10;
    guard.hp = 10;

    tickAi(s);
    expect(s.aiState).toBe("retreat");

    guard.hp = guard.maxHp;
    raider.hp = raider.maxHp;
    expect(raider.hp / raider.maxHp).toBeGreaterThanOrEqual(RETREAT_RECOVER_HEALTH);
    s.tick = missionDifficulty(0).enemyAssaultEvery + objectiveContractFor("destroyMarked")!.assaultDelay + 1;
    tickAi(s);

    expect(s.aiState).toBe("assault");
    expect(s.aiRetreatLocked).toBeUndefined();
    expect(guard.attackTarget).toBeUndefined();
    expect(raider.attackTarget).toBe(harvester.id);
  });

  it("times out a long retreat and hunts even while still wounded", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    addBuilding(s, 1, "constructionYard", 2, 2);
    addBuilding(s, 0, "constructionYard", 18, 18);
    const guard = addUnit(s, 1, "infantry", 5, 2);
    const raider = addUnit(s, 1, "tank", 9, 9);
    const harvester = addUnit(s, 0, "harvester", 12, 12);
    raider.hp = 10;
    guard.hp = 10;
    s.tick = missionDifficulty(0).enemyAssaultEvery;
    tickAi(s);
    expect(s.aiState).toBe("retreat");

    s.tick = missionDifficulty(0).enemyAssaultEvery + RETREAT_MAX_TICKS + 360;
    tickAi(s);

    expect(s.aiState).toBe("assault");
    expect(s.aiRetreatLocked).toBe(true);
    expect(raider.attackTarget).toBe(harvester.id);
  });

  it("produces and assigns an attack during a short headless mission", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    for (let i = 0; i < missionDifficulty(state.missionIndex).enemyAssaultEvery + 120 && state.result === "playing"; i++) {
      tick(state);
    }
    expect(state.unitsProduced[1]).toBeGreaterThan(0);
    const raider = state.entities.find(
      (entity) => entity.owner === 1 && entity.class === "unit" && entity.kind !== "harvester" && entity.hp > 0 && entity.attackTarget !== undefined,
    );
    expect(raider).toBeDefined();
  });

  it("queues anti-armor when the player fields more tanks than infantry", () => {
    const s = makeFixture({ width: 28, height: 28, win: { kind: "annihilate" } });
    addBuilding(s, 1, "constructionYard", 12, 12);
    addBuilding(s, 1, "power", 16, 12);
    addBuilding(s, 1, "barracks", 8, 12);
    addBuilding(s, 1, "refinery", 12, 16);
    addUnit(s, 1, "harvester", 18, 16);
    addUnit(s, 0, "tank", 8, 8);
    addUnit(s, 0, "tank", 9, 8);
    s.credits[1] = 5000;
    s.tick = missionDifficulty(0).enemyProductionStart;

    tickAi(s);

    const barracks = s.entities.find((e) => e.owner === 1 && e.kind === "barracks");
    expect(barracks?.producing?.kind).toBe("antiArmor");
  });

  it("does not place turrets past the mission cap", () => {
    const s = makeFixture({ width: 28, height: 28, win: { kind: "annihilate" } });
    s.missionIndex = 4;
    addBuilding(s, 1, "constructionYard", 12, 12);
    addBuilding(s, 1, "turret", 10, 12);
    addBuilding(s, 1, "turret", 14, 12);
    addBuilding(s, 1, "turret", 12, 10);
    addUnit(s, 0, "tank", 14, 14);
    s.credits[1] = 5000;

    tickAi(s);

    expect(s.aiState).toBe("defense");
    expect(s.entities.filter((e) => e.owner === 1 && e.kind === "turret")).toHaveLength(3);
    expect(s.entities.some((e) => e.kind === "turret" && e.constructing > 0)).toBe(false);
  });

  it("spawns a hold-the-line wave on the assault interval", () => {
    const s = makeFixture({ width: 28, height: 28, win: { kind: "holdTheLine", ticks: 10_000 } });
    addBuilding(s, 1, "constructionYard", 12, 12);
    const before = s.entities.filter((e) => e.owner === 1 && e.class === "unit").length;
    s.tick = missionDifficulty(0).enemyAssaultEvery;

    tickAi(s);

    const spawned = s.entities.filter((e) => e.owner === 1 && e.class === "unit" && (e.kind === "tank" || e.kind === "infantry"));
    expect(spawned.length).toBe(before + 1);
  });

  it("rebuilds a harvester when the last one is gone", () => {
    const s = makeFixture({ width: 28, height: 28, win: { kind: "annihilate" } });
    addBuilding(s, 1, "constructionYard", 12, 12);
    addBuilding(s, 1, "power", 16, 12);
    addBuilding(s, 1, "factory", 12, 8);
    addBuilding(s, 1, "refinery", 8, 16);
    s.credits[1] = 5000;
    s.tick = missionDifficulty(0).enemyProductionStart;

    tickAi(s);

    const factory = s.entities.find((e) => e.owner === 1 && e.kind === "factory");
    expect(factory?.producing?.kind).toBe("harvester");
  });

  it("rebuilds a refinery when none remain", () => {
    const s = makeFixture({ width: 28, height: 28, win: { kind: "annihilate" } });
    addBuilding(s, 1, "constructionYard", 12, 12);
    addBuilding(s, 1, "power", 16, 12);
    s.credits[1] = 5000;
    s.tick = missionDifficulty(0).enemyProductionStart;

    tickAi(s);

    expect(s.entities.some((e) => e.owner === 1 && e.kind === "refinery" && e.constructing > 0)).toBe(true);
  });
});
