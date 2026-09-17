import { describe, expect, it } from "vitest";
import { findPath, findPathDetailed, PATH_MAX_NODES } from "../../lib/sim/pathfinding";
import { flowFieldCacheSize, flowFieldFor, flowFieldForGoals, flowStep } from "../../lib/sim/flowField";
import { TILE_BLOCKED, TILE_RESOURCE, TILE_WATER, addBuilding, addUnit, makeFixture, setHeight, setTile } from "../../lib/sim/fixtures";
import { issue, tick } from "../../lib/sim/api";
import { tickAi } from "../../lib/sim/ai";
import { tickCombat } from "../../lib/sim/combat";
import { FOREGROUND_PATHS_PER_ORDER, PATH_BUDGET_PER_TICK, backgroundPathSearches, resetPathBudget, tryFindPath } from "../../lib/sim/pathBudget";
import { groundOrders } from "../../lib/sim/orders";
import { BUILDING_PLACEMENT_RADIUS, buildingAt, canPlaceBuilding, compactDestroyedEntities, heightAt, isStaticWalkable, makeUnitOccupancy, occupies, powerBreakdown, powerFor, staticNavigationFor, terrainAccess, unitAt } from "../../lib/sim/world";
import { navigationStepAllowed } from "../../lib/sim/navigation/grid";
import { tickProduction } from "../../lib/sim/production";
import { BUILDING_STATS, MAX_PRODUCTION_QUEUE, UNIT_STATS } from "../../lib/catalog";
import { destinationsForGroup } from "../../lib/sim/orders/movement";
import { expectUniqueUnitCells } from "./helpers";

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

  it("routes large foreground groups through one shared terrain field", () => {
    const s = makeFixture({ width: 48, height: 48, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const units = Array.from({ length: FOREGROUND_PATHS_PER_ORDER + 6 }, (_, i) =>
      addUnit(s, 0, "infantry", 3 + (i % 10), 4 + Math.floor(i / 10)),
    );
    issue(s, {
      type: "move",
      unitIds: units.map((unit) => unit.id),
      x: 38,
      y: 38,
      formation: "line",
    });

    expect(units.every((unit) => unit.path.length === 0 && unit.routePending)).toBe(true);
    expect(units.every((unit) => !!unit.flowGoal)).toBe(true);
    tick(s);
    expect(units.every((unit) => unit.x !== 3 || unit.y !== 4 || unit.path.length > 0)).toBe(true);
    expect(backgroundPathSearches(s)).toBeLessThanOrEqual(PATH_BUDGET_PER_TICK);
  });

  it("finds unique fallback slots around a sealed group target", () => {
    const s = makeFixture({ width: 20, height: 20, win: { kind: "harvestQuota", target: 99999 } });
    for (let y = 8; y <= 12; y++) {
      for (let x = 8; x <= 12; x++) setTile(s, x, y, TILE_BLOCKED);
    }
    const units = [
      addUnit(s, 0, "infantry", 2, 2),
      addUnit(s, 0, "infantry", 3, 2),
      addUnit(s, 0, "infantry", 2, 3),
      addUnit(s, 0, "infantry", 3, 3),
    ];
    issue(s, { type: "move", unitIds: units.map((unit) => unit.id), x: 10, y: 10 });

    const destinations = units.map((unit) => unit.orderDestination!);
    expect(new Set(destinations.map((destination) => `${destination.x},${destination.y}`)).size).toBe(units.length);
    expect(destinations.every((destination) => isStaticWalkable(s, destination.x, destination.y))).toBe(true);
    for (let i = 0; i < 600; i++) {
      tick(s, undefined, { evaluateObjectives: false });
      expectUniqueUnitCells(s);
    }
    expect(units.every((unit) => {
      const destination = unit.orderDestination!;
      return Math.round(unit.x) === destination.x && Math.round(unit.y) === destination.y;
    })).toBe(true);
  });

  it("bounds the per-state cache for distinct multi-goal fields", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    for (let i = 0; i < 160; i++) {
      const x = 1 + (i % 20);
      const y = 1 + Math.floor(i / 20);
      flowFieldForGoals(s, [{ x, y }, { x: x + 1, y }]);
    }
    expect(flowFieldCacheSize(s)).toBeLessThan(160);
  });

  it("keeps grouped attack-move followers active while their flow route is pending", () => {
    const s = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
    const units = [
      addUnit(s, 0, "infantry", 2, 2),
      addUnit(s, 0, "tank", 2, 3),
    ];
    issue(s, { type: "attackMove", unitIds: units.map((unit) => unit.id), x: 16, y: 16 });
    for (const unit of units) {
      unit.path = [];
      unit.idle = false;
      unit.routePending = true;
    }

    tickCombat(s);

    expect(units.every((unit) => unit.flowGoal && !unit.idle)).toBe(true);
  });

  it("marks a sealed destination unreachable without leaving a pending route", () => {
    const s = makeFixture({ width: 10, height: 10, win: { kind: "harvestQuota", target: 99999 } });
    for (const [x, y] of [
      [2, 2], [3, 2], [4, 2], [2, 3], [4, 3], [2, 4], [3, 4], [4, 4],
    ]) setTile(s, x, y, TILE_BLOCKED);
    const result = findPathDetailed(s, { x: 3, y: 3 }, { x: 8, y: 8 });

    expect(result.status).toBe("unreachable");
    expect(result.path).toEqual([]);
  });

  it("shares explicit terrain access rules between movement and construction", () => {
    const s = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    setTile(s, 2, 2, TILE_WATER);
    setTile(s, 3, 2, TILE_BLOCKED);
    setTile(s, 4, 2, TILE_RESOURCE, 500);
    expect(terrainAccess(s, 2, 2)).toMatchObject({ traversable: false, buildable: false, label: "Water" });
    expect(terrainAccess(s, 3, 2)).toMatchObject({ traversable: false, buildable: false, label: "Hard blocker" });
    expect(terrainAccess(s, 4, 2)).toMatchObject({ traversable: true, buildable: false, label: "Ore field" });
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

  it("routes to the reachable perimeter of a multi-tile building", () => {
    const s = makeFixture({ width: 12, height: 10, win: { kind: "annihilate" } });
    for (const [x, y] of [
      [4, 3], [5, 3], [6, 3], [4, 4], [4, 5], [4, 6], [5, 6], [6, 6],
    ]) setTile(s, x, y, TILE_BLOCKED);
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

  it("keeps two units from entering the same square", () => {
    const s = makeFixture({ width: 10, height: 8, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const a = addUnit(s, 0, "infantry", 2, 2);
    const b = addUnit(s, 0, "infantry", 4, 2);
    issue(s, { type: "move", unitIds: [a.id], x: 3, y: 2 });
    issue(s, { type: "move", unitIds: [b.id], x: 3, y: 2 });
    for (let i = 0; i < 400; i++) tick(s);
    expect(unitAt(s, 3, 2)?.id).toBe(a.id);
    expect(Math.round(b.x) === 3 && Math.round(b.y) === 2).toBe(false);
  });

  it("lets a second unit settle beside a claimed destination", () => {
    const s = makeFixture({ width: 10, height: 8, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const a = addUnit(s, 0, "infantry", 2, 2);
    const b = addUnit(s, 0, "infantry", 4, 2);
    issue(s, { type: "move", unitIds: [a.id], x: 3, y: 2 });
    issue(s, { type: "move", unitIds: [b.id], x: 3, y: 2 });
    for (let i = 0; i < 400; i++) tick(s);
    expect(unitAt(s, 3, 2)?.id).toBe(a.id);
    expect(b.idle).toBe(true);
    expect(b.path.length).toBe(0);
    const settledX = b.x;
    const settledY = b.y;
    for (let i = 0; i < 24; i++) tick(s);
    expect(b.x).toBe(settledX);
    expect(b.y).toBe(settledY);
    expect(b.idle).toBe(true);
  });

  it("settles a follower when friendly units seal the final pocket", () => {
    const s = makeFixture({ width: 12, height: 10, win: { kind: "harvestQuota", target: 99999 } });
    for (const [x, y] of [
      [4, 3], [5, 3], [6, 3], [4, 4], [6, 4], [4, 5], [5, 5], [6, 5],
    ]) {
      const blocker = addUnit(s, 0, "infantry", x, y);
      blocker.orderDestination = { x, y };
      blocker.idle = true;
    }
    const follower = addUnit(s, 0, "infantry", 7, 4);
    issue(s, { type: "move", unitIds: [follower.id], x: 5, y: 4 });

    for (let i = 0; i < 40; i++) tick(s, undefined, { evaluateObjectives: false });

    expect(follower.idle).toBe(true);
    expect(follower.path).toEqual([]);
    expect(follower.orderDestination).toEqual({ x: 7, y: 4 });
  });

  it("reroutes a combat unit when another unit steps into its existing route", () => {
    const s = makeFixture({ width: 10, height: 8, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const infantry = addUnit(s, 0, "infantry", 2, 3);
    issue(s, { type: "move", unitIds: [infantry.id], x: 6, y: 3 });
    const blocker = addUnit(s, 0, "infantry", 3, 3);

    tick(s);

    expect(infantry.path[0]).not.toEqual({ x: Math.round(blocker.x), y: Math.round(blocker.y) });
    for (let i = 0; i < 500; i++) {
      tick(s);
      expectUniqueUnitCells(s);
    }
    expect(Math.round(infantry.x)).toBe(6);
    expect(Math.round(infantry.y)).toBe(3);
  });

  it("reroutes an enemy combat unit around another enemy unit", () => {
    const s = makeFixture({ width: 10, height: 10, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const enemy = addUnit(s, 1, "infantry", 2, 6);
    enemy.stance = "hold";
    enemy.path = [
      { x: 3, y: 6 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ];
    const blocker = addUnit(s, 1, "tank", 3, 6);
    blocker.stance = "hold";

    tick(s);

    expect(enemy.path[0]).not.toEqual({ x: Math.round(blocker.x), y: Math.round(blocker.y) });
    for (let i = 0; i < 500; i++) {
      tick(s);
      expectUniqueUnitCells(s);
    }
    expect(Math.round(enemy.x)).toBe(6);
    expect(Math.round(enemy.y)).toBe(6);
  });

  it("relocates a spawned unit when its requested square is occupied", () => {
    const s = makeFixture({ width: 10, height: 8, win: { kind: "annihilate" } });
    const first = addUnit(s, 0, "infantry", 2, 2);
    const second = addUnit(s, 0, "tank", 2, 2);
    expect(unitAt(s, 2, 2)?.id).toBe(first.id);
    expect(Math.round(second.x) === 2 && Math.round(second.y) === 2).toBe(false);
  });

  it("spawns barracks units from the front edge first", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "power", 0, 0);
    const barracks = addBuilding(s, 0, "barracks", 4, 4);
    barracks.producing = { kind: "infantry", remaining: 1 };
    tickProduction(s);
    const unit = s.entities.find((e) => e.class === "unit");
    expect(unit && Math.round(unit.x)).toBe(5);
    expect(unit && Math.round(unit.y)).toBe(6);
  });

  it("spawns factory units from the camera-facing edge", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "power", 0, 0);
    const factory = addBuilding(s, 0, "factory", 4, 4);
    factory.producing = { kind: "tank", remaining: 1 };
    tickProduction(s);
    const unit = s.entities.find((e) => e.class === "unit");
    expect(unit && Math.round(unit.x)).toBe(5);
    expect(unit && Math.round(unit.y)).toBe(6);
  });

  it("falls back behind a barracks when the front is blocked", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "power", 0, 0);
    const barracks = addBuilding(s, 0, "barracks", 4, 4);
    for (let x = 3; x <= 7; x++) {
      setTile(s, x, 6, TILE_BLOCKED);
      setTile(s, 6, x - 2, TILE_BLOCKED);
    }
    barracks.producing = { kind: "infantry", remaining: 1 };
    tickProduction(s);
    const unit = s.entities.find((e) => e.class === "unit");
    expect(unit).toBeTruthy();
    expect(Math.round(unit!.y)).toBeLessThan(4);
  });

  it("cannot climb a cliff in one step", () => {
    const s = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    for (let y = 0; y < 8; y++) setHeight(s, 3, y, 3);
    const path = findPath(s, { x: 1, y: 2 }, { x: 5, y: 2 });
    const last = path[path.length - 1];
    expect(path.some((p) => p.x === 3)).toBe(false);
    expect(last && last.x === 5 && last.y === 2).toBe(false);
  });

  it("routes a group around a mountain ridge through a valid ramp", () => {
    const s = makeFixture({ width: 40, height: 30, win: { kind: "harvestQuota", target: 99999 } });
    for (let y = 0; y < 30; y++) setHeight(s, 18, y, 3);
    for (const y of [27, 28]) {
      setHeight(s, 17, y, 1);
      setHeight(s, 18, y, 2);
      setHeight(s, 19, y, 1);
    }
    const units = Array.from({ length: 8 }, (_, index) =>
      addUnit(s, 0, "infantry", 4 + (index % 4), 8 + Math.floor(index / 4)),
    );
    issue(s, { type: "move", unitIds: units.map((unit) => unit.id), x: 32, y: 15 });

    const navigation = staticNavigationFor(s);
    const previous = units.map((unit) => ({ x: Math.round(unit.x), y: Math.round(unit.y) }));
    let crossedRamp = false;
    for (let tickIndex = 0; tickIndex < 1_800; tickIndex++) {
      tick(s, undefined, { evaluateObjectives: false });
      expectUniqueUnitCells(s);
      for (let index = 0; index < units.length; index++) {
        const unit = units[index]!;
        const current = { x: Math.round(unit.x), y: Math.round(unit.y) };
        const before = previous[index]!;
        if (current.x !== before.x || current.y !== before.y) {
          expect(navigationStepAllowed(navigation, before.x, before.y, current.x, current.y)).toBe(true);
        }
        if (current.x === 18 && current.y >= 27) crossedRamp = true;
        previous[index] = current;
      }
    }

    expect(crossedRamp).toBe(true);
    expect(units.every((unit) => {
      const destination = unit.orderDestination!;
      return unit.idle && Math.round(unit.x) === destination.x && Math.round(unit.y) === destination.y;
    })).toBe(true);
  });

  it("settles a group beside an unreachable mountain plateau", () => {
    const s = makeFixture({ width: 36, height: 28, win: { kind: "harvestQuota", target: 99999 } });
    for (let y = 8; y <= 19; y++) {
      for (let x = 17; x <= 25; x++) setHeight(s, x, y, 3);
    }
    const units = [
      addUnit(s, 0, "infantry", 3, 10),
      addUnit(s, 0, "infantry", 3, 11),
      addUnit(s, 0, "infantry", 4, 10),
      addUnit(s, 0, "infantry", 4, 11),
    ];
    issue(s, { type: "move", unitIds: units.map((unit) => unit.id), x: 21, y: 14 });

    expect(units.every((unit) => {
      const destination = unit.orderDestination!;
      return !(destination.x >= 17 && destination.x <= 25 && destination.y >= 8 && destination.y <= 19);
    })).toBe(true);

    for (let tickIndex = 0; tickIndex < 1_200; tickIndex++) {
      tick(s, undefined, { evaluateObjectives: false });
      expectUniqueUnitCells(s);
    }

    expect(units.every((unit) => {
      const destination = unit.orderDestination!;
      return unit.idle && Math.round(unit.x) === destination.x && Math.round(unit.y) === destination.y && heightAt(s, destination.x, destination.y) < 3;
    })).toBe(true);
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

  it("plans through idle friendlies so a boxed unit still gets a path", () => {
    const s = makeFixture({ width: 12, height: 10, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const mover = addUnit(s, 0, "infantry", 4, 4);
    for (const [x, y] of [
      [3, 3],
      [4, 3],
      [5, 3],
      [3, 4],
      [5, 4],
      [3, 5],
      [4, 5],
      [5, 5],
    ] as const) {
      addUnit(s, 0, "infantry", x, y);
    }
    issue(s, { type: "move", unitIds: [mover.id], x: 9, y: 4 });
    expect(mover.path.length).toBeGreaterThan(0);
    for (let i = 0; i < 900; i++) tick(s);
    expect(Math.round(mover.x)).toBe(9);
    expect(Math.round(mover.y)).toBe(4);
  });

  it("lets a unit squeeze through a packed friendly group that is also moving", () => {
    const s = makeFixture({ width: 24, height: 16, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const pack: ReturnType<typeof addUnit>[] = [];
    for (let y = 3; y <= 6; y++) {
      for (let x = 6; x <= 9; x++) {
        pack.push(addUnit(s, 0, "infantry", x, y));
      }
    }
    const loner = addUnit(s, 0, "infantry", 3, 4);
    issue(s, { type: "move", unitIds: pack.map((unit) => unit.id), x: 7, y: 12 });
    issue(s, { type: "move", unitIds: [loner.id], x: 16, y: 5 });
    for (let i = 0; i < 900; i++) tick(s);
    expect(Math.round(loner.x)).toBe(16);
    expect(Math.round(loner.y)).toBe(5);
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

  it("waits when two units meet in a one-tile corridor", () => {
    const s = makeFixture({ width: 14, height: 8, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    for (let x = 4; x <= 9; x++) {
      setTile(s, x, 2, TILE_BLOCKED);
      setTile(s, x, 4, TILE_BLOCKED);
    }
    const a = addUnit(s, 0, "infantry", 3, 3);
    const b = addUnit(s, 0, "infantry", 10, 3);
    issue(s, { type: "move", unitIds: [a.id], x: 10, y: 3 });
    issue(s, { type: "move", unitIds: [b.id], x: 3, y: 3 });
    for (let i = 0; i < 900; i++) {
      tick(s);
      expectUniqueUnitCells(s);
    }
    expect(Math.round(a.x)).toBeLessThan(Math.round(b.x));
    expect(Math.round(a.x)).toBeGreaterThanOrEqual(3);
    expect(Math.round(b.x)).toBeLessThanOrEqual(10);
    expect(Math.round(a.y)).toBe(3);
    expect(Math.round(b.y)).toBe(3);
  });

  it("routes adjacent units around each other without exchanging positions", () => {
    const s = makeFixture({ width: 8, height: 6, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const a = addUnit(s, 0, "infantry", 2, 2);
    const b = addUnit(s, 0, "infantry", 3, 2);
    issue(s, { type: "move", unitIds: [a.id], x: 3, y: 2 });
    issue(s, { type: "move", unitIds: [b.id], x: 2, y: 2 });
    let previousA = { x: a.x, y: a.y };
    let previousB = { x: b.x, y: b.y };
    for (let i = 0; i < 100; i++) {
      tick(s);
      expectUniqueUnitCells(s);
      expect(Math.hypot(a.x - previousA.x, a.y - previousA.y)).toBeLessThanOrEqual(UNIT_STATS.infantry.speed + 1e-6);
      expect(Math.hypot(b.x - previousB.x, b.y - previousB.y)).toBeLessThanOrEqual(UNIT_STATS.infantry.speed + 1e-6);
      previousA = { x: a.x, y: a.y };
      previousB = { x: b.x, y: b.y };
    }
    expect(Math.round(a.x)).toBe(3);
    expect(Math.round(a.y)).toBe(2);
    expect(Math.round(b.x)).toBe(2);
    expect(Math.round(b.y)).toBe(2);
  });

  it("does not teleport same-side enemy units back and forth while crossing", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    const target = addBuilding(s, 0, "constructionYard", 18, 10);
    const units = Array.from({ length: 12 }, (_, index) => {
      const unit = addUnit(s, 1, "infantry", 4 + (index % 4), 5 + Math.floor(index / 4));
      unit.attackTarget = target.id;
      unit.orderMode = "attack";
      unit.orderDestination = { x: target.x, y: target.y };
      unit.idle = false;
      return unit;
    });

    const history = new Map<number, { x: number; y: number }[]>();
    for (let i = 0; i < 500; i++) {
      tick(s, undefined, { evaluateObjectives: false });
      for (const unit of units) {
        const samples = history.get(unit.id) ?? [];
        samples.push({ x: unit.x, y: unit.y });
        history.set(unit.id, samples);
      }
    }

    for (const unit of units) {
      const samples = history.get(unit.id)!;
      let reversals = 0;
      for (let i = 2; i < samples.length; i++) {
        const before = samples[i - 2]!;
        const previous = samples[i - 1]!;
        const current = samples[i]!;
        const incomingX = previous.x - before.x;
        const incomingY = previous.y - before.y;
        const outgoingX = current.x - previous.x;
        const outgoingY = current.y - previous.y;
        if (incomingX * outgoingX + incomingY * outgoingY < -1e-8) reversals += 1;
      }
      expect(reversals, `unit ${unit.id} reversed ${reversals} times`).toBeLessThan(20);
    }
  });

  it("holds a unit at a sealed route end instead of backtracking", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    const blockedRows = [
      "................",
      "..............#.",
      ".....#...#......",
      ".#....#....#....",
      "....#...##.##...",
      "......#..#...##.",
      "..##...#..#..##.",
      "......#..#..#...",
      ".......#....#...",
      ".............##.",
      "....#.....#.....",
      "................",
    ];
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (blockedRows[y]![x] === "#") setTile(s, x, y, TILE_BLOCKED);
      }
    }
    const mover = addUnit(s, 0, "infantry", 1, 5);
    const blocker = addUnit(s, 0, "infantry", 2, 5);
    blocker.orderDestination = { x: blocker.x, y: blocker.y };
    blocker.idle = true;
    issue(s, { type: "move", unitIds: [mover.id], x: 14, y: 6 });
    const resolvedDestination = { ...mover.orderDestination! };

    const history: { x: number; y: number; pathLength: number }[] = [];
    for (let i = 0; i < 420; i++) {
      tick(s, undefined, { evaluateObjectives: false });
      history.push({ x: mover.x, y: mover.y, pathLength: mover.path.length });
    }

    const settledAt = history.findIndex((sample) =>
      sample.pathLength === 0 && Math.round(sample.x) === resolvedDestination.x && Math.round(sample.y) === resolvedDestination.y,
    );
    expect(settledAt).toBeGreaterThan(0);
    expect(history.slice(settledAt).every((sample) => sample.x === resolvedDestination.x && sample.y === resolvedDestination.y)).toBe(true);
    expect(resolvedDestination).not.toEqual({ x: 14, y: 6 });
  });

  it("does not reverse a flow follower when occupancy removes its forward lane", () => {
    const s = makeFixture({ width: 12, height: 8, win: { kind: "harvestQuota", target: 99999 } });
    const mover = addUnit(s, 0, "infantry", 3, 3);
    for (const [x, y] of [[4, 2], [4, 3], [4, 4], [3, 4]] as const) {
      const blocker = addUnit(s, 0, "infantry", x, y);
      blocker.idle = true;
    }
    mover.orderDestination = { x: 8, y: 3 };
    mover.flowGoal = { x: 8, y: 3 };
    mover.routePending = true;
    mover.idle = false;

    const history: { x: number; y: number }[] = [];
    for (let i = 0; i < 120; i++) {
      tick(s, undefined, { evaluateObjectives: false });
      history.push({ x: mover.x, y: mover.y });
    }

    for (let i = 2; i < history.length; i++) {
      const p0 = history[i - 2]!;
      const p1 = history[i - 1]!;
      const p2 = history[i]!;
      const dx1 = p1.x - p0.x;
      const dy1 = p1.y - p0.y;
      const dx2 = p2.x - p1.x;
      const dy2 = p2.y - p1.y;
      expect(dx1 * dx2 + dy1 * dy2).toBeGreaterThanOrEqual(-1e-6);
    }
    expect(Math.round(mover.x)).toBe(8);
    expect(Math.round(mover.y)).toBe(3);
  });

  it("keeps neutral convoy movement out of occupied cells", () => {
    const s = makeFixture({ width: 12, height: 8, win: { kind: "escort", targetCount: 1 } });
    const blocker = addUnit(s, 0, "infantry", 5, 3);
    blocker.orderDestination = { x: blocker.x, y: blocker.y };
    blocker.idle = true;
    const convoy = addUnit(s, 0, "convoyTruck", 4, 3);
    convoy.neutral = true;
    convoy.scenarioRole = "convoy";
    convoy.orderMode = "move";
    convoy.orderDestination = { x: 8, y: 3 };
    convoy.path = [{ x: 5, y: 3 }, { x: 6, y: 3 }, { x: 7, y: 3 }, { x: 8, y: 3 }];
    convoy.idle = false;

    for (let i = 0; i < 160; i++) {
      tick(s, undefined, { evaluateObjectives: false });
      expectUniqueUnitCells(s);
    }
    expect(Math.round(convoy.x) === 5 && Math.round(convoy.y) === 3).toBe(false);
  });

  it("spreads a group move across unique nearby tiles", () => {
    const s = makeFixture({ width: 12, height: 10, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const a = addUnit(s, 0, "infantry", 2, 2);
    const b = addUnit(s, 0, "infantry", 2, 3);
    issue(s, { type: "move", unitIds: [a.id, b.id], x: 7, y: 3 });
    expect(a.orderDestination).not.toEqual(b.orderDestination);
    expect(a.flowGoal).toEqual({ x: 7, y: 3 });
    expect(b.flowGoal).toEqual({ x: 7, y: 3 });
  });

  it("moves a flow-field formation into distinct final slots", () => {
    const s = makeFixture({ width: 24, height: 16, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const units = [
      addUnit(s, 0, "infantry", 3, 4),
      addUnit(s, 0, "infantry", 3, 5),
      addUnit(s, 0, "infantry", 4, 4),
      addUnit(s, 0, "infantry", 4, 5),
    ];
    issue(s, { type: "move", unitIds: units.map((unit) => unit.id), x: 16, y: 9, formation: "line" });

    for (let i = 0; i < 500; i++) {
      tick(s);
      expectUniqueUnitCells(s);
    }

    expect(units.every((unit) => {
      const destination = unit.orderDestination!;
      return Math.max(Math.abs(Math.round(unit.x) - destination.x), Math.abs(Math.round(unit.y) - destination.y)) <= 1;
    })).toBe(true);
    expect(new Set(units.map((unit) => `${Math.round(unit.x)},${Math.round(unit.y)}`)).size).toBe(units.length);
  });

  it("moves a packed infantry cluster to unique destinations without freezing", () => {
    const s = makeFixture({ width: 28, height: 16, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const units: ReturnType<typeof addUnit>[] = [];
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++) {
        units.push(addUnit(s, 0, "infantry", 3 + x, 4 + y));
      }
    }
    issue(s, { type: "move", unitIds: units.map((unit) => unit.id), x: 20, y: 8 });
    for (let i = 0; i < 800; i++) {
      tick(s);
      expectUniqueUnitCells(s);
    }
    expect(new Set(units.map((unit) => `${Math.round(unit.x)},${Math.round(unit.y)}`)).size).toBe(units.length);
    expect(units.every((unit) => {
      const destination = unit.orderDestination!;
      return Math.max(Math.abs(Math.round(unit.x) - destination.x), Math.abs(Math.round(unit.y) - destination.y)) <= 1;
    })).toBe(true);
  });

  it("keeps a 128-unit order cohesive through approach and arrival phases", () => {
    const s = makeFixture({ width: 96, height: 96, win: { kind: "harvestQuota", target: 99999 } });
    const units: ReturnType<typeof addUnit>[] = [];
    for (let y = 4; y < 12; y++) {
      for (let x = 3; x < 19; x++) units.push(addUnit(s, 0, "infantry", x, y));
    }
    issue(s, { type: "move", unitIds: units.map((unit) => unit.id), x: 80, y: 80 });

    const initialDestinations = units.map((unit) => ({ ...unit.orderDestination! }));
    expect(new Set(initialDestinations.map((destination) => `${destination.x},${destination.y}`)).size).toBe(128);
    const approach = flowFieldFor(s, { x: 80, y: 80 });
    expect(initialDestinations.every((destination) => approach.distance[destination.y * s.width + destination.x] !== -1)).toBe(true);
    const fieldsAfterOrder = flowFieldCacheSize(s);
    const olderCells = new Map<number, number>();
    const previousCells = new Map<number, number>();
    const averageDistance = () => units.reduce((sum, unit) => {
      const destination = unit.orderDestination!;
      return sum + Math.max(
        Math.abs(Math.round(unit.x) - destination.x),
        Math.abs(Math.round(unit.y) - destination.y),
      );
    }, 0) / units.length;
    const startingDistance = averageDistance();

    for (let tickIndex = 0; tickIndex < 3_000; tickIndex++) {
      tick(s, undefined, { evaluateObjectives: false });
      expectUniqueUnitCells(s);
      expect(backgroundPathSearches(s)).toBeLessThanOrEqual(PATH_BUDGET_PER_TICK);
      for (const unit of units) {
        const cell = Math.round(unit.y) * s.width + Math.round(unit.x);
        const previous = previousCells.get(unit.id);
        const older = olderCells.get(unit.id);
        if (previous !== undefined && older !== undefined && cell !== previous) expect(cell).not.toBe(older);
        olderCells.set(unit.id, previous ?? cell);
        previousCells.set(unit.id, cell);
      }
      if (tickIndex === 999) expect(averageDistance()).toBeLessThan(startingDistance - 20);
    }

    expect(flowFieldCacheSize(s)).toBeLessThanOrEqual(fieldsAfterOrder + 2);
    expect(units.every((unit) => {
      const destination = unit.orderDestination!;
      return Math.round(unit.x) === destination.x && Math.round(unit.y) === destination.y && unit.idle;
    })).toBe(true);
  });

  it("routes a large group through a narrow corridor to a blocked target area", () => {
    const s = makeFixture({ width: 56, height: 48, win: { kind: "harvestQuota", target: 99999 } });
    for (let y = 0; y < s.height; y++) {
      if (y < 21 || y > 26) setTile(s, 26, y, TILE_BLOCKED);
    }
    for (const [x, y] of [[40, 23], [41, 23], [40, 24], [41, 24]]) setTile(s, x, y, TILE_BLOCKED);
    const units: ReturnType<typeof addUnit>[] = [];
    for (let y = 4; y < 12; y++) {
      for (let x = 3; x < 11; x++) units.push(addUnit(s, 0, "infantry", x, y));
    }
    issue(s, { type: "move", unitIds: units.map((unit) => unit.id), x: 40, y: 24 });

    expect(new Set(units.map((unit) => `${unit.orderDestination!.x},${unit.orderDestination!.y}`)).size).toBe(units.length);
    expect(units.every((unit) => isStaticWalkable(s, unit.orderDestination!.x, unit.orderDestination!.y))).toBe(true);
    for (let i = 0; i < 4_000; i++) {
      tick(s, undefined, { evaluateObjectives: false });
      expectUniqueUnitCells(s);
      expect(backgroundPathSearches(s)).toBeLessThanOrEqual(PATH_BUDGET_PER_TICK);
    }
    expect(units.every((unit) => {
      const destination = unit.orderDestination!;
      return Math.round(unit.x) === destination.x && Math.round(unit.y) === destination.y;
    })).toBe(true);
  });

  it("preserves a 64-unit formation while spreading its arrival line", () => {
    const s = makeFixture({ width: 96, height: 96, win: { kind: "harvestQuota", target: 99999 } });
    const units: ReturnType<typeof addUnit>[] = [];
    for (let y = 4; y < 12; y++) {
      for (let x = 3; x < 11; x++) units.push(addUnit(s, 0, "infantry", x, y));
    }
    issue(s, { type: "move", unitIds: units.map((unit) => unit.id), x: 72, y: 48, formation: "line" });
    const destinations = destinationsForGroup(s, units, 72, 48, "line");
    expect(new Set(destinations.map((destination) => `${destination.x},${destination.y}`)).size).toBe(units.length);

    for (let i = 0; i < 3_500; i++) {
      tick(s, undefined, { evaluateObjectives: false });
      expectUniqueUnitCells(s);
      expect(backgroundPathSearches(s)).toBeLessThanOrEqual(PATH_BUDGET_PER_TICK);
    }
    expect(units.every((unit) => {
      const destination = unit.orderDestination!;
      return Math.max(Math.abs(Math.round(unit.x) - destination.x), Math.abs(Math.round(unit.y) - destination.y)) <= 1;
    })).toBe(true);
  });

  it("does not shove a progressing mover sideways when someone is waiting behind", () => {
    const s = makeFixture({ width: 16, height: 10, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const lead = addUnit(s, 0, "infantry", 5, 3);
    const waiter = addUnit(s, 0, "infantry", 4, 3);
    lead.idle = false;
    lead.orderDestination = { x: 12, y: 3 };
    lead.path = [{ x: 6, y: 3 }, { x: 7, y: 3 }, { x: 12, y: 3 }];
    waiter.idle = false;
    waiter.orderDestination = { x: 5, y: 0 };
    waiter.path = [{ x: 5, y: 3 }, { x: 5, y: 2 }, { x: 5, y: 1 }, { x: 5, y: 0 }];
    tick(s);
    expect(Math.round(lead.y)).toBe(3);
    expect(lead.path).toEqual([{ x: 6, y: 3 }, { x: 7, y: 3 }, { x: 12, y: 3 }]);
  });

  it("keeps leftover group followers on the flow field when peel-off A* is budgeted out", () => {
    const s = makeFixture({ width: 28, height: 16, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const units: ReturnType<typeof addUnit>[] = [];
    for (let i = 0; i < 12; i++) {
      units.push(addUnit(s, 0, "infantry", 8 + (i % 4), 6 + Math.floor(i / 4)));
    }
    issue(s, { type: "move", unitIds: units.map((unit) => unit.id), x: 16, y: 8 });
    for (const unit of units) {
      const dest = unit.orderDestination!;
      unit.x = dest.x - 2;
      unit.y = dest.y;
      unit.path = [];
      unit.routePending = true;
    }
    tick(s);
    expect(backgroundPathSearches(s)).toBeLessThanOrEqual(PATH_BUDGET_PER_TICK);
    const stillFlowing = units.filter((unit) => unit.flowGoal);
    expect(stillFlowing.length).toBeGreaterThan(0);
    expect(stillFlowing.every((unit) => unit.path.length > 0 || unit.routePending)).toBe(true);
  });

  it("keeps a stored formation when the next move omits one", () => {
    const s = makeFixture({ width: 12, height: 10, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const a = addUnit(s, 0, "infantry", 2, 2);
    const b = addUnit(s, 0, "infantry", 2, 3);
    issue(s, { type: "formation", unitIds: [a.id, b.id], formation: "line" });
    issue(s, { type: "move", unitIds: [a.id, b.id], x: 7, y: 3 });
    expect(a.formation).toBe("line");
    expect(b.formation).toBe("line");
    const endA = a.orderDestination!;
    const endB = b.orderDestination!;
    expect(endA.x).toBe(endB.x);
    expect(endA.y).not.toBe(endB.y);
  });

  it("builds deterministic fields around water, cliffs, and blocked goals", () => {
    const s = makeFixture({ width: 12, height: 10, win: { kind: "annihilate" } });
    for (let y = 0; y < s.height; y++) setTile(s, 5, y, TILE_WATER);
    const field = flowFieldFor(s, { x: 9, y: 5 });
    const sameField = flowFieldFor(s, { x: 9, y: 5 });
    expect(sameField).toBe(field);
    expect(field.distance[5 * s.width + 2]).toBe(-1);
    expect(flowStep(field, 8, 5)).toEqual({ x: 9, y: 5 });

    const cliff = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    for (let y = 0; y < cliff.height; y++) setHeight(cliff, 3, y, 3);
    const cliffField = flowFieldFor(cliff, { x: 6, y: 2 });
    expect(cliffField.distance[2 * cliff.width + 1]).toBe(-1);

    const blockedGoal = makeFixture({ width: 12, height: 10, win: { kind: "annihilate" } });
    addBuilding(blockedGoal, 1, "power", 6, 4);
    const blockedField = flowFieldFor(blockedGoal, { x: 6, y: 4 });
    expect(blockedField.goal).not.toEqual({ x: 6, y: 4 });
    expect(flowStep(blockedField, 2, 4)).toBeTruthy();
  });

  it("skips an occupied greedy flow cell when a free lane exists", () => {
    const s = makeFixture({ width: 20, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addUnit(s, 0, "infantry", 6, 4);
    const mover = addUnit(s, 0, "infantry", 5, 4);
    const partner = addUnit(s, 0, "infantry", 5, 5);
    const occupancy = makeUnitOccupancy(s);
    const field = flowFieldFor(s, { x: 14, y: 4 });
    expect(flowStep(field, 5, 4)).toEqual({ x: 6, y: 4 });
    const avoided = flowStep(field, 5, 4, {
      occupancy,
      reserved: new Map(),
      ignoreId: mover.id,
      state: s,
    });
    expect(avoided).toBeTruthy();
    expect(avoided).not.toEqual({ x: 6, y: 4 });

    issue(s, { type: "move", unitIds: [mover.id, partner.id], x: 14, y: 4 });
    tick(s);
    expect(mover.path.length).toBeGreaterThan(0);
    expect(mover.path[0]).not.toEqual({ x: 6, y: 4 });
  });

  it("invalidates cached navigation immediately when a building is cancelled or sold", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const cancelled = addBuilding(s, 0, "power", 5, 4, 10);
    const beforeCancel = staticNavigationFor(s);
    issue(s, { type: "cancelBuild", building: "power" });
    expect(staticNavigationFor(s)).not.toBe(beforeCancel);

    const sold = addBuilding(s, 0, "turret", 8, 4);
    const beforeSell = staticNavigationFor(s);
    issue(s, { type: "sell", buildingId: sold.id });
    expect(staticNavigationFor(s)).not.toBe(beforeSell);
    expect(cancelled.hp).toBe(0);
    expect(sold.hp).toBe(0);
  });

  it("invalidates cached fields when a building footprint changes", () => {
    const s = makeFixture({ width: 12, height: 10, win: { kind: "annihilate" } });
    const before = flowFieldFor(s, { x: 9, y: 4 });
    const revision = s.navigationRevision;
    addBuilding(s, 1, "power", 5, 4);
    const after = flowFieldFor(s, { x: 9, y: 4 });
    expect(s.navigationRevision).toBe(revision + 1);
    expect(after).not.toBe(before);

    const revisionAfterAdd = s.navigationRevision;
    const building = s.entities.find((entity) => entity.class === "building" && entity.kind === "power");
    building!.hp = 0;
    compactDestroyedEntities(s);
    expect(s.navigationRevision).toBe(revisionAfterAdd + 1);
  });
});

describe("building footprints", () => {
  it("occupies every tile in the footprint", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const b = addBuilding(s, 0, "factory", 4, 4);
    expect(occupies(b, 4, 4)).toBe(true);
    expect(occupies(b, 6, 5)).toBe(true);
    expect(occupies(b, 7, 4)).toBe(false);
    expect(buildingAt(s, 5, 5)?.id).toBe(b.id);
  });

  it("rejects placement that straddles a cliff", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    setHeight(s, 3, 2, 2);
    expect(canPlaceBuilding(s, "power", 2, 2)).toBe(false);
    expect(canPlaceBuilding(s, "power", 5, 5)).toBe(true);
  });

  it("leaves one walkable tile between buildings from either faction", () => {
    const s = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 1, "power", 4, 4, 50);

    expect(canPlaceBuilding(s, "turret", 6, 4, 0, false)).toBe(false);
    expect(canPlaceBuilding(s, "turret", 7, 4, 0, false)).toBe(true);
    expect(canPlaceBuilding(s, "turret", 4, 6, 0, false)).toBe(false);
    expect(canPlaceBuilding(s, "turret", 4, 7, 0, false)).toBe(true);
    expect(canPlaceBuilding(s, "turret", 6, 6, 0, false)).toBe(false);
    expect(canPlaceBuilding(s, "turret", 7, 7, 0, false)).toBe(true);

    expect(issue(s, { type: "build", building: "turret", x: 6, y: 4 })).toEqual([
      { type: "commandRejected", reason: "invalid placement" },
    ]);
  });

  it("rejects turrets and buildings on ore fields while leaving them walkable", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    s.credits[0] = 50_000;
    addBuilding(s, 0, "constructionYard", 0, 0);
    setTile(s, 6, 4, TILE_RESOURCE, 500);
    setTile(s, 7, 4, TILE_RESOURCE, 500);
    expect(canPlaceBuilding(s, "turret", 6, 4)).toBe(false);
    expect(canPlaceBuilding(s, "power", 6, 4)).toBe(false);
    expect(issue(s, { type: "build", building: "turret", x: 6, y: 4 })).toEqual([
      { type: "commandRejected", reason: "invalid placement" },
    ]);
    expect(issue(s, { type: "build", building: "power", x: 6, y: 4 })).toEqual([
      { type: "commandRejected", reason: "invalid placement" },
    ]);
    const path = findPath(s, { x: 5, y: 4 }, { x: 8, y: 4 });
    expect(path.some((p) => p.x === 6 && p.y === 4)).toBe(true);
  });

  it("requires every new building, including turrets, to join the owner building network", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 1, "constructionYard", 16, 16);

    expect(canPlaceBuilding(s, "power", 3, 0)).toBe(true);
    expect(canPlaceBuilding(s, "turret", 8, 0)).toBe(true);
    expect(canPlaceBuilding(s, "turret", 11, 0)).toBe(false);
    expect(canPlaceBuilding(s, "turret", 16, 16)).toBe(false);
    expect(issue(s, { type: "build", building: "turret", x: 11, y: 0 })).toEqual([
      { type: "commandRejected", reason: "invalid placement" },
    ]);
    expect(BUILDING_PLACEMENT_RADIUS).toBe(8);
  });
});

describe("production queue", () => {
  it("queues up to 10 units and rejects the 11th", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    s.credits[0] = 50_000;
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "power", 2, 0);
    const barracks = addBuilding(s, 0, "barracks", 6, 4);
    for (let i = 0; i < MAX_PRODUCTION_QUEUE; i++) {
      const events = issue(s, { type: "produce", fromId: barracks.id, unit: "infantry" });
      expect(events).toEqual([]);
    }
    expect(barracks.producing?.kind).toBe("infantry");
    expect(barracks.queue).toHaveLength(MAX_PRODUCTION_QUEUE - 1);
    const creditsAfterTen = s.credits[0];
    issue(s, { type: "produce", fromId: barracks.id, unit: "infantry" });
    expect(barracks.queue).toHaveLength(MAX_PRODUCTION_QUEUE - 1);
    expect(s.credits[0]).toBe(creditsAfterTen);
  });

  it("starts the next queued unit after the current one finishes", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    s.credits[0] = 50_000;
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "power", 2, 0);
    const barracks = addBuilding(s, 0, "barracks", 6, 4);
    issue(s, { type: "produce", fromId: barracks.id, unit: "infantry" });
    issue(s, { type: "produce", fromId: barracks.id, unit: "antiArmor" });
    barracks.producing = { kind: "infantry", remaining: 1 };
    tickProduction(s);
    expect(s.entities.some((e) => e.class === "unit" && e.kind === "infantry")).toBe(true);
    expect(barracks.producing?.kind).toBe("antiArmor");
    expect(barracks.producing?.remaining).toBe(UNIT_STATS.antiArmor.buildTicks);
    expect(barracks.queue).toHaveLength(0);
  });
});

describe("cancel production and construction", () => {
  it("allows only one barracks and one factory per owner in a mission", () => {
    const s = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    s.credits[0] = 50_000;
    addBuilding(s, 0, "constructionYard", 0, 0);

    expect(issue(s, { type: "build", building: "barracks", x: 4, y: 4 })).toEqual([]);
    expect(issue(s, { type: "build", building: "barracks", x: 8, y: 4 })).toEqual([
      { type: "commandRejected", reason: "building limit reached" },
    ]);
    expect(issue(s, { type: "build", building: "factory", x: 4, y: 8 })).toEqual([]);
    expect(issue(s, { type: "build", building: "factory", x: 8, y: 8 })).toEqual([
      { type: "commandRejected", reason: "building limit reached" },
    ]);
  });

  it("refunds a queued unit before cancelling the unit in progress", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    s.credits[0] = 50_000;
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "power", 2, 0);
    const barracks = addBuilding(s, 0, "barracks", 6, 4);
    issue(s, { type: "produce", fromId: barracks.id, unit: "infantry" });
    issue(s, { type: "produce", fromId: barracks.id, unit: "infantry" });
    issue(s, { type: "produce", fromId: barracks.id, unit: "antiArmor" });
    const afterQueue = s.credits[0];

    issue(s, { type: "cancelProduce", unit: "infantry" });
    expect(barracks.producing?.kind).toBe("infantry");
    expect(barracks.queue).toEqual(["antiArmor"]);
    expect(s.credits[0]).toBe(afterQueue + UNIT_STATS.infantry.cost);

    issue(s, { type: "cancelProduce", unit: "infantry" });
    expect(barracks.producing?.kind).toBe("antiArmor");
    expect(barracks.producing?.remaining).toBe(UNIT_STATS.antiArmor.buildTicks);
    expect(barracks.queue).toHaveLength(0);
    expect(s.credits[0]).toBe(afterQueue + UNIT_STATS.infantry.cost * 2);
  });

  it("cancels an unfinished building, refunds its cost, and frees the tiles", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    s.credits[0] = 50_000;
    addBuilding(s, 0, "constructionYard", 0, 0);
    issue(s, { type: "build", building: "power", x: 6, y: 4 });
    const power = s.entities.find((e) => e.kind === "power");
    expect(power?.constructing).toBeGreaterThan(0);
    expect(buildingAt(s, 6, 4)?.id).toBe(power?.id);
    const afterBuild = s.credits[0];

    issue(s, { type: "cancelBuild", building: "power" });
    expect(power?.hp).toBe(0);
    expect(power?.constructing).toBe(0);
    expect(buildingAt(s, 6, 4)).toBeUndefined();
    expect(s.credits[0]).toBe(afterBuild + BUILDING_STATS.power.cost);
    expect(canPlaceBuilding(s, "power", 6, 4)).toBe(true);
  });

  it("cancels the most recently placed building of that kind", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    s.credits[0] = 50_000;
    addBuilding(s, 0, "constructionYard", 0, 0);
    issue(s, { type: "build", building: "turret", x: 6, y: 4 });
    issue(s, { type: "build", building: "turret", x: 8, y: 4 });
    const first = s.entities.find((e) => e.kind === "turret" && e.x === 6);
    const second = s.entities.find((e) => e.kind === "turret" && e.x === 8);
    expect(first?.constructing).toBeGreaterThan(0);
    expect(second?.constructing).toBeGreaterThan(0);

    issue(s, { type: "cancelBuild", building: "turret" });
    expect(second?.hp).toBe(0);
    expect(first?.hp).toBeGreaterThan(0);
    expect(first?.constructing).toBeGreaterThan(0);
  });
});

describe("power grid", () => {
  it("splits generated power from drain", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "power", 3, 0);
    addBuilding(s, 0, "barracks", 6, 0);
    const grid = powerBreakdown(s, 0);
    expect(grid.produced).toBe(BUILDING_STATS.constructionYard.power + BUILDING_STATS.power.power);
    expect(grid.used).toBe(-BUILDING_STATS.barracks.power);
    expect(grid.surplus).toBe(grid.produced - grid.used);
    expect(powerFor(s, 0)).toBe(grid.surplus);
  });
});

describe("pathfinding budget", () => {
  it("caps background searches and still honors player orders", () => {
    const s = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const mover = addUnit(s, 0, "infantry", 1, 1);
    resetPathBudget(s, 0);
    issue(s, { type: "move", unitIds: [mover.id], x: 8, y: 8 });
    expect(mover.path.length).toBeGreaterThan(0);
    expect(backgroundPathSearches(s)).toBe(0);

    resetPathBudget(s, PATH_BUDGET_PER_TICK);
    const hits: Array<ReturnType<typeof tryFindPath>> = [];
    for (let i = 0; i < 10; i++) {
      hits.push(tryFindPath(s, { x: 1, y: 1 }, { x: 10, y: 10 }));
    }
    expect(hits.filter((path) => path !== undefined)).toHaveLength(PATH_BUDGET_PER_TICK);
    expect(backgroundPathSearches(s)).toBe(PATH_BUDGET_PER_TICK);
  });

  it("does not exceed the per-tick detour cap on a crowded map", () => {
    const s = makeFixture({ width: 48, height: 24, win: { kind: "annihilate" } });
    for (let i = 0; i < 12; i++) {
      const y = i + 2;
      addUnit(s, 0, "infantry", 4, y);
      const mover = addUnit(s, 0, "infantry", 3, y);
      mover.idle = false;
      mover.path = [{ x: 4, y }, { x: 12, y }];
    }
    tick(s);
    expect(backgroundPathSearches(s)).toBeLessThanOrEqual(PATH_BUDGET_PER_TICK);
  });

  it("does not clear AI paths when the budget is exhausted before tickAi", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    addBuilding(s, 1, "constructionYard", 18, 18);
    addBuilding(s, 0, "constructionYard", 2, 2);
    const raider = addUnit(s, 1, "infantry", 10, 10);
    raider.hp = 10;
    const prior = [{ x: 11, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 10 }];
    raider.path = prior.map((p) => ({ ...p }));
    raider.idle = false;

    resetPathBudget(s, 0);
    expect(() => tickAi(s)).not.toThrow();
    expect(s.aiState).toBe("retreat");
    expect(raider.path).toEqual(prior);
    expect(backgroundPathSearches(s)).toBe(0);
  });

  it("does not clear a combat chase path when the budget is exhausted", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const attacker = addUnit(s, 0, "tank", 4, 4);
    addUnit(s, 1, "infantry", 14, 4);
    const prior = [{ x: 5, y: 4 }, { x: 6, y: 4 }];
    attacker.path = prior.map((p) => ({ ...p }));
    attacker.idle = true;

    resetPathBudget(s, 0);
    expect(() => tickCombat(s)).not.toThrow();
    expect(attacker.path).toEqual(prior);
    expect(backgroundPathSearches(s)).toBe(0);
  });

  it("maintains independent search budgets across different SimState instances", () => {
    const s1 = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const s2 = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });

    resetPathBudget(s1, 1);
    resetPathBudget(s2, 5);

    expect(tryFindPath(s1, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeDefined();
    expect(tryFindPath(s1, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeUndefined(); // s1 exhausted
    expect(backgroundPathSearches(s1)).toBe(1);
    expect(s1.pathBudget?.remaining).toBe(0);

    // s2 should still have its full budget
    expect(backgroundPathSearches(s2)).toBe(0);
    expect(s2.pathBudget?.remaining).toBe(5);
    expect(tryFindPath(s2, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeDefined();
    expect(backgroundPathSearches(s2)).toBe(1);
    expect(s2.pathBudget?.remaining).toBe(4);

    // Tick s1 resets s1's budget but leaves s2 alone
    tick(s1);
    expect(s1.pathBudget?.remaining).toBe(PATH_BUDGET_PER_TICK);
    expect(s1.pathBudget?.used).toBe(0);
    expect(s2.pathBudget?.remaining).toBe(4);
    expect(s2.pathBudget?.used).toBe(1);
  });

  it("does not let an initialized state consume the default budget of a new state", () => {
    const s1 = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const s2 = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });

    resetPathBudget(s1, 1);
    resetPathBudget(s2, 1);
    expect(tryFindPath(s1, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeDefined();
    expect(s1.pathBudget).toEqual({ remaining: 0, used: 1 });

    expect(tryFindPath(s2, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeDefined();
    expect(s2.pathBudget).toEqual({ remaining: 0, used: 1 });
  });
});
