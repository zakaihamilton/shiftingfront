import { describe, expect, it } from "vitest";
import { makeFixture, addUnit, addBuilding, setTile, TILE_RESOURCE } from "../../lib/sim/fixtures";
import { issue, tick } from "../../lib/sim/api";
import { groundOrders } from "../../lib/sim/orders";
import { battlefieldCursor } from "../../lib/ui/battlefieldCursor";

describe("harvester group orders and harvesting", () => {
  it("makes a group of 3 harvesters harvest concurrently across an ore patch", () => {
    const s = makeFixture({ width: 25, height: 25, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "refinery", 2, 2);

    // 3 ore tiles in a patch
    setTile(s, 10, 10, TILE_RESOURCE, 500);
    setTile(s, 10, 11, TILE_RESOURCE, 500);
    setTile(s, 11, 10, TILE_RESOURCE, 500);

    const h1 = addUnit(s, 0, "harvester", 5, 5);
    const h2 = addUnit(s, 0, "harvester", 5, 6);
    const h3 = addUnit(s, 0, "harvester", 6, 5);

    const orders = groundOrders(s, [h1.id, h2.id, h3.id], 10, 10);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.type).toBe("harvest");
    for (const o of orders) issue(s, o);

    // Initial assignment should distribute across patch tiles
    expect(new Set([h1.gatherX, h2.gatherX, h3.gatherX]).size).toBeGreaterThan(1);

    // Simulate travel and harvest
    for (let t = 0; t < 200; t++) {
      tick(s);
    }

    // All 3 harvesters must have harvested ore, not just 1
    expect(h1.carry).toBeGreaterThan(0);
    expect(h2.carry).toBeGreaterThan(0);
    expect(h3.carry).toBeGreaterThan(0);
  });

  it("makes a group of 3 harvesters harvest concurrently from a single ore tile from adjacent positions", () => {
    const s = makeFixture({ width: 25, height: 25, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "refinery", 2, 2);

    // Exactly 1 ore tile with enough resources for all
    setTile(s, 10, 10, TILE_RESOURCE, 1500);

    const h1 = addUnit(s, 0, "harvester", 8, 10);
    const h2 = addUnit(s, 0, "harvester", 8, 11);
    const h3 = addUnit(s, 0, "harvester", 9, 11);

    const orders = groundOrders(s, [h1.id, h2.id, h3.id], 10, 10);
    for (const o of orders) issue(s, o);

    for (let t = 0; t < 150; t++) {
      tick(s);
    }

    // All 3 harvesters must be actively harvesting, even though only 1 can stand directly on (10, 10)
    expect(h1.carry).toBeGreaterThan(0);
    expect(h2.carry).toBeGreaterThan(0);
    expect(h3.carry).toBeGreaterThan(0);
  });

  it("transitions a group to harvesting when moved to an ore location via a move command", () => {
    const s = makeFixture({ width: 25, height: 25, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "refinery", 2, 2);

    setTile(s, 12, 12, TILE_RESOURCE, 500);
    setTile(s, 12, 13, TILE_RESOURCE, 500);

    const h1 = addUnit(s, 0, "harvester", 5, 5);
    const h2 = addUnit(s, 0, "harvester", 5, 6);

    // Explicit move order to the ore location
    issue(s, { type: "move", unitIds: [h1.id, h2.id], x: 12, y: 12 });

    for (let t = 0; t < 250; t++) {
      tick(s);
    }

    // Upon arrival, both harvesters should have started harvesting
    expect(h1.carry).toBeGreaterThan(0);
    expect(h2.carry).toBeGreaterThan(0);
  });

  it("lets a harvester leave its current ore field for a newly assigned field", () => {
    const s = makeFixture({ width: 20, height: 20, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    setTile(s, 5, 5, TILE_RESOURCE, 500);
    setTile(s, 12, 12, TILE_RESOURCE, 500);
    const h = addUnit(s, 0, "harvester", 5, 5);

    issue(s, { type: "harvest", unitIds: [h.id], x: 5, y: 5 });
    tick(s);
    expect(h.carry).toBeGreaterThan(0);

    const orders = groundOrders(s, [h.id], 12, 12);
    expect(orders).toEqual([{ type: "harvest", unitIds: [h.id], x: 12, y: 12 }]);
    for (const order of orders) issue(s, order);
    tick(s);

    expect(h.gatherX).toBe(12);
    expect(h.gatherY).toBe(12);
    expect(h.orderDestination).toEqual({ x: 12, y: 12 });
  });

  it("does not divert a harvester to base resources while moving to a distant destination", () => {
    const s = makeFixture({ width: 30, height: 30, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "refinery", 2, 2);

    // Ore right near base — should be ignored during the move
    setTile(s, 4, 4, TILE_RESOURCE, 500);

    const h = addUnit(s, 0, "harvester", 3, 3);

    // Move to far location with no ore
    issue(s, { type: "move", unitIds: [h.id], x: 25, y: 25 });

    // Tick many steps; harvester must keep heading towards (25,25), not detour to (4,4)
    for (let t = 0; t < 30; t++) {
      tick(s);
    }

    // moveToHarvest flag should still be set (not arrived yet)
    expect(h.moveToHarvest).toBe(true);
    // orderDestination must still point to the user's requested location
    expect(h.orderDestination?.x).toBe(25);
    expect(h.orderDestination?.y).toBe(25);
    // No gathering should have started
    expect(h.gatherX).toBeUndefined();
    expect(h.carry).toBe(0);
  });

  it("harvester with move command travels full distance before harvesting nearby ore en route", () => {
    const s = makeFixture({ width: 30, height: 30, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "refinery", 2, 2);

    // Ore patch en route, harvester should NOT stop at it
    setTile(s, 10, 10, TILE_RESOURCE, 500);
    // Destination has no ore
    const h = addUnit(s, 0, "harvester", 5, 5);

    issue(s, { type: "move", unitIds: [h.id], x: 20, y: 20 });

    // Tick enough to pass through the en-route ore but not arrive at destination
    for (let t = 0; t < 60; t++) {
      tick(s);
    }

    // Must not have harvested; the harvester should still be en route or at destination (20,20)
    expect(h.carry).toBe(0);
    expect(h.gatherX).toBeUndefined();
  });

  it("shows the harvest cursor when hovering over or adjacent to ore with harvesters selected", () => {
    const s = makeFixture({ width: 20, height: 20, win: { kind: "harvestQuota", target: 99999 } });
    setTile(s, 10, 10, TILE_RESOURCE, 500);
    const h = addUnit(s, 0, "harvester", 5, 5);

    // Directly on ore
    const cursorDirect = battlefieldCursor({
      state: s,
      hoverTile: { x: 10, y: 10 },
      hoverEntity: undefined,
      selectedIds: [h.id],
      placeKind: null,
      repairMode: false,
      sellMode: false,
    });
    expect(cursorDirect).toBe("cell");

    // Adjacent to ore
    const cursorAdjacent = battlefieldCursor({
      state: s,
      hoverTile: { x: 10, y: 11 },
      hoverEntity: undefined,
      selectedIds: [h.id],
      placeKind: null,
      repairMode: false,
      sellMode: false,
    });
    expect(cursorAdjacent).toBe("cell");

    // Far from ore
    const cursorFar = battlefieldCursor({
      state: s,
      hoverTile: { x: 5, y: 5 },
      hoverEntity: undefined,
      selectedIds: [h.id],
      placeKind: null,
      repairMode: false,
      sellMode: false,
    });
    expect(cursorFar).toBe("crosshair");
  });
});
