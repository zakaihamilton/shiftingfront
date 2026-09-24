import { describe, expect, it } from "vitest";
import { issue } from "../../lib/sim/api";
import { addBuilding, addUnit, makeFixture, setTile, TILE_RESOURCE } from "../../lib/sim/fixtures";
import { inspect } from "../../lib/sim/objectives";
import { canPlaceBuilding } from "../../lib/sim/world";
import { createScenarioRunner } from "../../lib/sim/scenarioRunner";
import type { SimState } from "../../lib/types";

const TICK_CAP = 400;

function playUntilWon(state: SimState): void {
  createScenarioRunner(state).run({ maxTicks: TICK_CAP });
  expect(inspect(state).result).toBe("won");
}

describe("scripted mission loops", () => {
  it("lets harvesters load 500 ore before returning", () => {
    const s = makeFixture({ win: { kind: "holdTheLine", ticks: 1000 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "refinery", 3, 2);
    const harvester = addUnit(s, 0, "harvester", 7, 4);
    setTile(s, 7, 4, TILE_RESOURCE, 1000);

    expect(issue(s, { type: "harvest", unitIds: [harvester.id], x: 7, y: 4 })).toEqual([]);
    const runner = createScenarioRunner(s);
    runner.run({ maxTicks: 125 });
    expect(harvester.carry).toBe(250);

    runner.run({ maxTicks: 125 });
    expect(harvester.carry).toBe(500);

    runner.run({ maxTicks: 400 });
    expect(harvester.carry).toBe(0);
    expect(s.credits[0]).toBeGreaterThan(5000);
  });

  it("wins a harvestQuota by issuing harvest and ticking", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "harvestQuota", target: 80 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "refinery", 3, 2);
    const harvester = addUnit(s, 0, "harvester", 7, 4);
    setTile(s, 7, 4, TILE_RESOURCE, 250);

    expect(issue(s, { type: "harvest", unitIds: [harvester.id], x: 7, y: 4 })).toEqual([]);
    playUntilWon(s);
  });

  it("wins a forceQuota by issuing produce and ticking", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "forceQuota", target: 1 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const barracks = addBuilding(s, 0, "barracks", 3, 0);

    expect(issue(s, { type: "produce", fromId: barracks.id, unit: "infantry" })).toEqual([]);
    playUntilWon(s);
  });

  it("wins a structureQuota by issuing a turret build and ticking", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "structureQuota", target: 1 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    expect(canPlaceBuilding(s, "turret", 3, 0)).toBe(true);

    expect(issue(s, { type: "build", building: "turret", x: 3, y: 0 })).toEqual([]);
    playUntilWon(s);
  });

  it("completes a marked-objective operation through build, production, and attack orders", () => {
    const s = makeFixture({ width: 24, height: 16, win: { kind: "destroyMarked", targetCount: 1 } });
    addBuilding(s, 0, "constructionYard", 1, 1);
    addBuilding(s, 0, "power", 4, 1);
    addBuilding(s, 0, "barracks", 4, 4);
    const factory = addBuilding(s, 0, "factory", 7, 4);
    const target = addBuilding(s, 1, "objective", 16, 6, 0, true);
    target.hp = 24;
    s.win.targetIds = [target.id];
    s.runtime = {
      kind: "destroyMarked",
      phase: "active",
      targetIds: [target.id],
      rescued: 0,
      required: 1,
      secondary: [],
    };

    expect(issue(s, { type: "build", building: "turret", x: 7, y: 1 })).toEqual([]);
    const turret = s.entities.find((entity) => entity.owner === 0 && entity.kind === "turret");
    expect(turret?.constructing).toBeGreaterThan(0);

    expect(issue(s, { type: "produce", fromId: factory.id, unit: "tank" })).toEqual([]);
    expect(factory.producing?.kind).toBe("tank");

    const runner = createScenarioRunner(s);
    runner.run({ maxTicks: 180 });

    expect(turret?.constructing).toBe(0);
    const tank = s.entities.find((entity) => entity.owner === 0 && entity.kind === "tank" && entity.hp > 0);
    expect(tank).toBeDefined();
    expect(s.unitsProduced[0]).toBeGreaterThan(0);

    expect(issue(s, { type: "attack", unitIds: [tank!.id], targetId: target.id })).toEqual([]);
    runner.run({ maxTicks: 500 });

    expect(s.result).toBe("won");
    expect(target.hp).toBe(0);
  });
});
