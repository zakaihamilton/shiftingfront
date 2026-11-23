import { describe, expect, it } from "vitest";
import { issue, tick } from "../../lib/sim/api";
import {
  addBuilding,
  addUnit,
  makeFixture,
  setHeight,
  setTile,
  TILE_BLOCKED,
  TILE_RESOURCE,
  TILE_WATER,
} from "../../lib/sim/fixtures";
import { groundOrders } from "../../lib/sim/orders";
import { findPath, findPathDetailed, PATH_MAX_NODES } from "../../lib/sim/pathfinding";
import { canPlaceBuilding, terrainAccess } from "../../lib/sim/world";

describe("pathfinding", () => {
  it("returns a bounded partial result for a long search", () => {
    const s = makeFixture({ width: 96, height: 96, win: { kind: "annihilate" } });
    const result = findPathDetailed(s, { x: 1, y: 1 }, { x: 95, y: 95 }, { maxNodes: 8 });

    expect(PATH_MAX_NODES).toBe(4096);
    expect(result.status).toBe("partial");
    expect(result.path.length).toBeGreaterThan(0);
  });

  it("keeps a capped search pending when only the start node was explored", () => {
    const s = makeFixture({ width: 10, height: 10, win: { kind: "annihilate" } });
    const result = findPathDetailed(s, { x: 1, y: 1 }, { x: 8, y: 8 }, { maxNodes: 1 });

    expect(result.status).toBe("partial");
    expect(result.path).toEqual([]);
  });

  it("marks a sealed destination unreachable without leaving a pending route", () => {
    const s = makeFixture({ width: 10, height: 10, win: { kind: "harvestQuota", target: 99999 } });
    for (const [x, y] of [
      [2, 2],
      [3, 2],
      [4, 2],
      [2, 3],
      [4, 3],
      [2, 4],
      [3, 4],
      [4, 4],
    ])
      setTile(s, x, y, TILE_BLOCKED);
    const result = findPathDetailed(s, { x: 3, y: 3 }, { x: 8, y: 8 });

    expect(result.status).toBe("unreachable");
    expect(result.path).toEqual([]);
  });

  it("shares explicit terrain access rules between movement and construction", () => {
    const s = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    setTile(s, 2, 2, TILE_WATER);
    setTile(s, 3, 2, TILE_BLOCKED);
    setTile(s, 4, 2, TILE_RESOURCE, 500);
    expect(terrainAccess(s, 2, 2)).toMatchObject({
      traversable: false,
      buildable: false,
      label: "Water",
    });
    expect(terrainAccess(s, 3, 2)).toMatchObject({
      traversable: false,
      buildable: false,
      label: "Hard blocker",
    });
    expect(terrainAccess(s, 4, 2)).toMatchObject({
      traversable: true,
      buildable: false,
      label: "Ore field",
    });
  });

  it("routes around a blocking building", () => {
    const s = makeFixture({ width: 10, height: 8, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "power", 3, 2);
    const path = findPath(s, { x: 2, y: 2 }, { x: 6, y: 2 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((p) => p.x === 3 && p.y === 2)).toBe(false);
    expect(path.some((p) => p.x === 4 && p.y === 2)).toBe(false);
    const last = path[path.length - 1]!;
    expect(last.x).toBe(6);
    expect(last.y).toBe(2);
  });

  it("starts building-origin searches from the reachable footprint perimeter", () => {
    const s = makeFixture({ width: 12, height: 10, win: { kind: "annihilate" } });
    const yard = addBuilding(s, 0, "constructionYard", 0, 0);
    const result = findPathDetailed(s, yard, { x: 8, y: 7 });

    expect(result.status).toBe("complete");
    expect(result.path.length).toBeGreaterThan(0);
    expect(result.path[0]).not.toEqual({ x: yard.x, y: yard.y });
  });

  it("routes to the reachable perimeter of a multi-tile building", () => {
    const s = makeFixture({ width: 12, height: 10, win: { kind: "annihilate" } });
    for (const [x, y] of [
      [4, 3],
      [5, 3],
      [6, 3],
      [4, 4],
      [4, 5],
      [4, 6],
      [5, 6],
      [6, 6],
    ])
      setTile(s, x, y, TILE_BLOCKED);
    const target = addBuilding(s, 1, "objective", 5, 4, 0, true);

    const result = findPathDetailed(s, { x: 1, y: 1 }, target);
    const last = result.path.at(-1);

    expect(result.status).toBe("complete");
    expect(last).toBeDefined();
    expect(last!.x).toBeGreaterThanOrEqual(target.x + 2);
    expect(last!.y).toBeGreaterThanOrEqual(target.y - 1);
    expect(last!.y).toBeLessThanOrEqual(target.y + 2);
  });

  it("moves a unit toward a move order", () => {
    const s = makeFixture({ width: 10, height: 8, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const u = addUnit(s, 0, "infantry", 2, 2);
    issue(s, { type: "move", unitIds: [u.id], x: 6, y: 2 });
    for (let i = 0; i < 400; i++) tick(s);
    expect(Math.round(u.x)).toBe(6);
    expect(Math.round(u.y)).toBe(2);
  });

  it("moves a combat unit onto an ore field", () => {
    const s = makeFixture({ width: 10, height: 8, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    setTile(s, 6, 2, TILE_RESOURCE, 500);
    const u = addUnit(s, 0, "infantry", 2, 2);
    issue(s, { type: "move", unitIds: [u.id], x: 6, y: 2 });
    expect(u.path.some((p) => p.x === 6 && p.y === 2)).toBe(true);
    for (let i = 0; i < 400; i++) tick(s);
    expect(Math.round(u.x)).toBe(6);
    expect(Math.round(u.y)).toBe(2);
  });

  it("orders combat units onto ore while selected harvesters gather", () => {
    const s = makeFixture({ width: 10, height: 8, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    setTile(s, 6, 2, TILE_RESOURCE, 500);
    const infantry = addUnit(s, 0, "infantry", 2, 2);
    const harvester = addUnit(s, 0, "harvester", 2, 3);
    const commands = groundOrders(s, [infantry.id, harvester.id], 6, 2);
    expect(commands).toEqual([
      { type: "harvest", unitIds: [harvester.id], x: 6, y: 2 },
      { type: "move", unitIds: [infantry.id], x: 6, y: 2 },
    ]);
    for (const command of commands) issue(s, command);
    expect(infantry.path.some((p) => p.x === 6 && p.y === 2)).toBe(true);
    expect(harvester.gatherX).toBe(6);
    expect(harvester.gatherY).toBe(2);
    expect(harvester.path.length).toBeGreaterThan(0);
  });

  it("turns a ground move into attack-move when requested", () => {
    const s = makeFixture({ width: 10, height: 8, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    setTile(s, 6, 2, TILE_RESOURCE, 500);
    const infantry = addUnit(s, 0, "infantry", 2, 2);
    const harvester = addUnit(s, 0, "harvester", 2, 3);
    expect(groundOrders(s, [infantry.id, harvester.id], 6, 2, true)).toEqual([
      { type: "harvest", unitIds: [harvester.id], x: 6, y: 2 },
      { type: "attackMove", unitIds: [infantry.id], x: 6, y: 2 },
    ]);
    expect(groundOrders(s, [infantry.id], 4, 4, true)).toEqual([
      { type: "attackMove", unitIds: [infantry.id], x: 4, y: 4 },
    ]);
    expect(groundOrders(s, [harvester.id], 1, 7, true)).toEqual([
      { type: "move", unitIds: [harvester.id], x: 1, y: 7 },
    ]);
  });

  it("cannot climb a cliff in one step", () => {
    const s = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    for (let y = 0; y < 8; y++) setHeight(s, 3, y, 3);
    const path = findPath(s, { x: 1, y: 2 }, { x: 5, y: 2 });
    const last = path[path.length - 1];
    expect(path.some((p) => p.x === 3)).toBe(false);
    expect(last && last.x === 5 && last.y === 2).toBe(false);
  });

  it("uses a hill ramp to reach a mountain", () => {
    const s = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    setHeight(s, 3, 2, 3);
    setHeight(s, 3, 1, 2);
    const path = findPath(s, { x: 2, y: 2 }, { x: 3, y: 2 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((p) => p.x === 3 && p.y === 1)).toBe(true);
  });

  it("routes around blocked terrain and rejects construction on it", () => {
    const s = makeFixture({ width: 10, height: 8, win: { kind: "annihilate" } });
    for (let y = 1; y < 7; y++) setTile(s, 4, y, TILE_BLOCKED);
    const path = findPath(s, { x: 2, y: 3 }, { x: 7, y: 3 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((p) => p.x === 4 && p.y >= 1 && p.y < 7)).toBe(false);
    expect(canPlaceBuilding(s, "power", 4, 2)).toBe(false);
  });

  it("does not cut a diagonal through a building corner", () => {
    const s = makeFixture({ width: 10, height: 8, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "turret", 3, 2);
    const path = findPath(s, { x: 2, y: 2 }, { x: 3, y: 3 });
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).not.toEqual({ x: 3, y: 3 });
    const last = path[path.length - 1]!;
    expect(last.x).toBe(3);
    expect(last.y).toBe(3);
  });
});
