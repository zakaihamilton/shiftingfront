import { describe, expect, it } from "vitest";
import { BUILDING_STATS, UNIT_STATS } from "../../lib/catalog";
import { addBuilding, makeFixture } from "../../lib/sim/fixtures";
import { issue } from "../../lib/sim/orders";
import { tickProduction } from "../../lib/sim/production";
import { compactDestroyedEntities, powerFor, trySpawnUnit } from "../../lib/sim/world";
import { expectUniqueUnitCells } from "./helpers";

function readyBase(width = 24, height = 16) {
  const s = makeFixture({ width, height, win: { kind: "annihilate" } });
  s.credits[0] = 50_000;
  addBuilding(s, 0, "constructionYard", 0, 0);
  addBuilding(s, 0, "power", 3, 0);
  return s;
}

describe("producer speed", () => {
  it("finishes a unit twice as fast with a second barracks", () => {
    const one = readyBase();
    const barracks = addBuilding(one, 0, "barracks", 6, 4);
    issue(one, { type: "produce", fromId: barracks.id, unit: "infantry" });
    const two = readyBase();
    const first = addBuilding(two, 0, "barracks", 6, 4);
    addBuilding(two, 0, "barracks", 9, 4);
    issue(two, { type: "produce", fromId: first.id, unit: "infantry" });

    const half = UNIT_STATS.infantry.buildTicks / 2;
    for (let i = 0; i < half; i++) {
      tickProduction(one);
      tickProduction(two);
    }

    expect(barracks.producing?.remaining).toBe(half);
    expect(two.entities.some((e) => e.class === "unit" && e.kind === "infantry")).toBe(true);
    expect(first.producing).toBeUndefined();
  });

  it("speeds tanks and harvesters with extra war factories", () => {
    const s = readyBase();
    const factory = addBuilding(s, 0, "factory", 6, 4);
    addBuilding(s, 0, "factory", 10, 4);
    issue(s, { type: "produce", fromId: factory.id, unit: "tank" });
    tickProduction(s);
    expect(factory.producing?.remaining).toBe(UNIT_STATS.tank.buildTicks - 2);
  });

  it("splits extra capacity when several producers are busy", () => {
    const s = readyBase();
    const a = addBuilding(s, 0, "barracks", 6, 4);
    const b = addBuilding(s, 0, "barracks", 9, 4);
    issue(s, { type: "produce", fromId: a.id, unit: "infantry" });
    issue(s, { type: "produce", fromId: b.id, unit: "infantry" });
    tickProduction(s);
    expect(a.producing?.remaining).toBe(UNIT_STATS.infantry.buildTicks - 1);
    expect(b.producing?.remaining).toBe(UNIT_STATS.infantry.buildTicks - 1);
  });

  it("ignores unfinished barracks when counting speed", () => {
    const s = readyBase();
    const barracks = addBuilding(s, 0, "barracks", 6, 4);
    addBuilding(s, 0, "barracks", 9, 4, 40);
    issue(s, { type: "produce", fromId: barracks.id, unit: "infantry" });
    tickProduction(s);
    expect(barracks.producing?.remaining).toBe(UNIT_STATS.infantry.buildTicks - 1);
  });
});

describe("power shortage events", () => {
  it("emits once when player surplus crosses below zero", () => {
    const s = readyBase();
    addBuilding(s, 0, "factory", 6, 4);
    addBuilding(s, 0, "factory", 10, 4);
    addBuilding(s, 0, "barracks", 6, 8);
    addBuilding(s, 0, "refinery", 10, 8);
    addBuilding(s, 0, "turret", 0, 6);
    addBuilding(s, 0, "turret", 0, 8);
    addBuilding(s, 0, "turret", 0, 10);
    expect(powerFor(s, 0)).toBeLessThan(0);

    expect(tickProduction(s)).toContainEqual({ type: "powerShortage", owner: 0 });
    expect(tickProduction(s).filter((event) => event.type === "powerShortage")).toHaveLength(0);
  });
});

describe("refinery construction bonus", () => {
  it("charges and refunds the updated refinery price", () => {
    const s = makeFixture({ win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const creditsBefore = s.credits[0];

    expect(issue(s, { type: "build", building: "refinery", x: 4, y: 4 })).toEqual([]);
    expect(s.credits[0]).toBe(creditsBefore - BUILDING_STATS.refinery.cost);

    issue(s, { type: "cancelBuild", building: "refinery" });
    expect(s.credits[0]).toBe(creditsBefore);
  });

  it("spawns one free harvester when a refinery finishes", () => {
    const s = readyBase();
    const refinery = addBuilding(s, 0, "refinery", 10, 8, 2);
    const creditsBefore = s.credits[0];

    expect(s.entities.filter((e) => e.owner === 0 && e.kind === "harvester")).toHaveLength(0);
    expect(tickProduction(s).filter((event) => event.type === "produced")).toHaveLength(0);
    expect(refinery.constructing).toBe(1);
    expect(s.entities.filter((e) => e.owner === 0 && e.kind === "harvester")).toHaveLength(0);

    const events = tickProduction(s);
    expectUniqueUnitCells(s);

    expect(refinery.constructing).toBe(0);
    expect(s.credits[0]).toBe(creditsBefore);
    expect(s.entities.filter((e) => e.owner === 0 && e.kind === "harvester")).toHaveLength(1);
    expect(s.unitsProduced[0]).toBe(1);
    expect(s.unitsProducedByRole.harvester).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({
      type: "built",
      owner: 0,
      kind: "refinery",
      id: refinery.id,
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "produced",
      owner: 0,
      kind: "harvester",
      sourceId: refinery.id,
    }));

    expect(tickProduction(s).filter((event) => event.type === "produced")).toHaveLength(0);
    expect(s.entities.filter((e) => e.owner === 0 && e.kind === "harvester")).toHaveLength(1);
  });

  it("retries the free harvester until a deployment tile opens", () => {
    const s = makeFixture({ width: 5, height: 5, win: { kind: "annihilate" } });
    const refinery = addBuilding(s, 0, "refinery", 1, 1, 1);
    addBuilding(s, 0, "constructionYard", 0, 0);
    while (trySpawnUnit(s, 0, "infantry", refinery.x, refinery.y)) {
      // Fill every walkable tile so the completion-time harvester cannot deploy.
    }

    const creditsBefore = s.credits[0];
    const completionEvents = tickProduction(s);
    expect(refinery.constructing).toBe(0);
    expect(refinery.refineryHarvesterPending).toBe(true);
    expect(s.entities.filter((e) => e.owner === 0 && e.kind === "harvester")).toHaveLength(0);
    expect(s.credits[0]).toBe(creditsBefore);
    expect(completionEvents.filter((event) => event.type === "produced")).toHaveLength(0);

    const blocker = s.entities.find((e) => e.class === "unit")!;
    blocker.hp = 0;
    compactDestroyedEntities(s);
    const retryEvents = tickProduction(s);

    expect(refinery.refineryHarvesterPending).toBeUndefined();
    expect(s.entities.filter((e) => e.owner === 0 && e.kind === "harvester")).toHaveLength(1);
    expect(retryEvents).toContainEqual(expect.objectContaining({
      type: "produced",
      kind: "harvester",
      sourceId: refinery.id,
    }));
    expect(s.credits[0]).toBe(creditsBefore);
  });

  it("also grants the bonus to an enemy refinery", () => {
    const s = readyBase();
    const refinery = addBuilding(s, 1, "refinery", 10, 8, 1);

    const events = tickProduction(s);

    expect(s.entities.filter((e) => e.owner === 1 && e.kind === "harvester")).toHaveLength(1);
    expect(s.unitsProduced[1]).toBe(1);
    expect(s.unitsProducedByRole.harvester).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({
      type: "produced",
      owner: 1,
      kind: "harvester",
      sourceId: refinery.id,
    }));
  });
});

describe("production rally routing", () => {
  it("spawns at the exit and gives produced units a normal move order to the rally point", () => {
    const s = readyBase();
    const barracks = addBuilding(s, 0, "barracks", 6, 4);
    barracks.producing = { kind: "infantry", remaining: 1 };
    barracks.rallyPoint = { x: 14, y: 10 };

    const events = tickProduction(s);
    const produced = s.entities.find((entity) => entity.id === events.find((event) => event.type === "produced")?.id);
    expect(produced?.class).toBe("unit");
    expect(produced?.orderMode).toBe("move");
    expect(produced?.orderDestination).toEqual({ x: 14, y: 10 });
    expect((produced?.path.length ?? 0) > 0 || produced?.routePending).toBeTruthy();
    expect(produced && (Math.round(produced.x) !== 14 || Math.round(produced.y) !== 10)).toBe(true);
  });

  it("keeps the default idle spawn behavior when no rally point is set", () => {
    const s = readyBase();
    const barracks = addBuilding(s, 0, "barracks", 6, 4);
    barracks.producing = { kind: "infantry", remaining: 1 };

    tickProduction(s);
    const produced = s.entities.find((entity) => entity.class === "unit" && entity.kind === "infantry");
    expect(produced?.orderDestination).toBeUndefined();
    expect(produced?.idle).toBe(true);
  });
});
