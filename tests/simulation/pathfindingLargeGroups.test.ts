import { describe, expect, it } from "vitest";
import { issue, tick } from "../../lib/sim/api";
import { addBuilding, addUnit, makeFixture, setTile, TILE_BLOCKED } from "../../lib/sim/fixtures";
import { flowFieldCacheSize, flowFieldFor } from "../../lib/sim/flowField";
import { destinationsForGroup } from "../../lib/sim/orders/movement";
import {
  backgroundPathSearches,
  FOREGROUND_PATHS_PER_ORDER,
  PATH_BUDGET_PER_TICK,
} from "../../lib/sim/pathBudget";
import { isStaticWalkable } from "../../lib/sim/world";
import { expectUniqueUnitCells } from "./helpers";

const IS_COVERAGE = Boolean(process.env.NODE_V8_COVERAGE || process.env.VITEST_COVERAGE);
const LARGE_GROUP_TIMEOUT = 120_000;
const PATHFINDING_TICK_OPTIONS = {
  evaluateObjectives: false,
  collectEvents: false,
  updateFog: false,
} as const;

describe("pathfinding large groups", () => {
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
      tick(s, undefined, PATHFINDING_TICK_OPTIONS);
      expectUniqueUnitCells(s);
    }
    expect(new Set(units.map((unit) => `${Math.round(unit.x)},${Math.round(unit.y)}`)).size).toBe(
      units.length,
    );
    expect(
      units.every((unit) => {
        const destination = unit.orderDestination!;
        return (
          Math.max(
            Math.abs(Math.round(unit.x) - destination.x),
            Math.abs(Math.round(unit.y) - destination.y),
          ) <= 1
        );
      }),
    ).toBe(true);
  });

  it("keeps a 16-unit order cohesive through approach and arrival phases", () => {
    const s = makeFixture({ width: 48, height: 48, win: { kind: "harvestQuota", target: 99999 } });
    const units: ReturnType<typeof addUnit>[] = [];
    for (let y = 4; y < 8; y++) {
      for (let x = 3; x < 7; x++) units.push(addUnit(s, 0, "infantry", x, y));
    }
    issue(s, { type: "move", unitIds: units.map((unit) => unit.id), x: 36, y: 36 });

    const initialDestinations = units.map((unit) => ({ ...unit.orderDestination! }));
    expect(
      new Set(initialDestinations.map((destination) => `${destination.x},${destination.y}`)).size,
    ).toBe(16);
    const approach = flowFieldFor(s, { x: 36, y: 36 });
    expect(
      initialDestinations.every(
        (destination) => approach.distance[destination.y * s.width + destination.x] !== -1,
      ),
    ).toBe(true);
    const fieldsAfterOrder = flowFieldCacheSize(s);
    const olderCells = new Map<number, number>();
    const previousCells = new Map<number, number>();
    const averageDistance = () =>
      units.reduce((sum, unit) => {
        const destination = unit.orderDestination!;
        return (
          sum +
          Math.max(
            Math.abs(Math.round(unit.x) - destination.x),
            Math.abs(Math.round(unit.y) - destination.y),
          )
        );
      }, 0) / units.length;
    const startingDistance = averageDistance();

    for (let tickIndex = 0; tickIndex < 2_000; tickIndex++) {
      tick(s, undefined, PATHFINDING_TICK_OPTIONS);
      expectUniqueUnitCells(s);
      expect(backgroundPathSearches(s)).toBeLessThanOrEqual(PATH_BUDGET_PER_TICK);
      for (const unit of units) {
        const cell = Math.round(unit.y) * s.width + Math.round(unit.x);
        const previous = previousCells.get(unit.id);
        const older = olderCells.get(unit.id);
        if (previous !== undefined && older !== undefined && cell !== previous)
          expect(cell).not.toBe(older);
        olderCells.set(unit.id, previous ?? cell);
        previousCells.set(unit.id, cell);
      }
      if (tickIndex === 399) expect(averageDistance()).toBeLessThan(startingDistance - 8);
    }

    expect(flowFieldCacheSize(s)).toBeLessThanOrEqual(fieldsAfterOrder + 2);
    expect(
      units.every((unit) => {
        const destination = unit.orderDestination!;
        return (
          Math.round(unit.x) === destination.x && Math.round(unit.y) === destination.y && unit.idle
        );
      }),
    ).toBe(true);
  });

  it.skipIf(IS_COVERAGE)(
    "keeps a 128-unit order cohesive through approach and arrival phases",
    () => {
      const s = makeFixture({
        width: 96,
        height: 96,
        win: { kind: "harvestQuota", target: 99999 },
      });
      const units: ReturnType<typeof addUnit>[] = [];
      for (let y = 4; y < 12; y++) {
        for (let x = 3; x < 19; x++) units.push(addUnit(s, 0, "infantry", x, y));
      }
      issue(s, { type: "move", unitIds: units.map((unit) => unit.id), x: 80, y: 80 });

      const initialDestinations = units.map((unit) => ({ ...unit.orderDestination! }));
      expect(
        new Set(initialDestinations.map((destination) => `${destination.x},${destination.y}`)).size,
      ).toBe(128);
      const approach = flowFieldFor(s, { x: 80, y: 80 });
      expect(
        initialDestinations.every(
          (destination) => approach.distance[destination.y * s.width + destination.x] !== -1,
        ),
      ).toBe(true);
      const fieldsAfterOrder = flowFieldCacheSize(s);
      const olderCells = new Map<number, number>();
      const previousCells = new Map<number, number>();
      const averageDistance = () =>
        units.reduce((sum, unit) => {
          const destination = unit.orderDestination!;
          return (
            sum +
            Math.max(
              Math.abs(Math.round(unit.x) - destination.x),
              Math.abs(Math.round(unit.y) - destination.y),
            )
          );
        }, 0) / units.length;
      const startingDistance = averageDistance();

      for (let tickIndex = 0; tickIndex < 3_000; tickIndex++) {
        tick(s, undefined, PATHFINDING_TICK_OPTIONS);
        expectUniqueUnitCells(s);
        expect(backgroundPathSearches(s)).toBeLessThanOrEqual(PATH_BUDGET_PER_TICK);
        for (const unit of units) {
          const cell = Math.round(unit.y) * s.width + Math.round(unit.x);
          const previous = previousCells.get(unit.id);
          const older = olderCells.get(unit.id);
          if (previous !== undefined && older !== undefined && cell !== previous)
            expect(cell).not.toBe(older);
          olderCells.set(unit.id, previous ?? cell);
          previousCells.set(unit.id, cell);
        }
        if (tickIndex === 999) expect(averageDistance()).toBeLessThan(startingDistance - 20);
      }

      expect(flowFieldCacheSize(s)).toBeLessThanOrEqual(fieldsAfterOrder + 2);
      expect(
        units.every((unit) => {
          const destination = unit.orderDestination!;
          return (
            Math.round(unit.x) === destination.x &&
            Math.round(unit.y) === destination.y &&
            unit.idle
          );
        }),
      ).toBe(true);
    },
    LARGE_GROUP_TIMEOUT,
  );

  it.skipIf(IS_COVERAGE)(
    "routes a large group through a narrow corridor to a blocked target area",
    () => {
      const s = makeFixture({
        width: 56,
        height: 48,
        win: { kind: "harvestQuota", target: 99999 },
      });
      for (let y = 0; y < s.height; y++) {
        if (y < 21 || y > 26) setTile(s, 26, y, TILE_BLOCKED);
      }
      for (const [x, y] of [
        [40, 23],
        [41, 23],
        [40, 24],
        [41, 24],
      ])
        setTile(s, x, y, TILE_BLOCKED);
      const units: ReturnType<typeof addUnit>[] = [];
      for (let y = 4; y < 12; y++) {
        for (let x = 3; x < 11; x++) units.push(addUnit(s, 0, "infantry", x, y));
      }
      issue(s, { type: "move", unitIds: units.map((unit) => unit.id), x: 40, y: 24 });

      expect(
        new Set(units.map((unit) => `${unit.orderDestination!.x},${unit.orderDestination!.y}`))
          .size,
      ).toBe(units.length);
      expect(
        units.every((unit) =>
          isStaticWalkable(s, unit.orderDestination!.x, unit.orderDestination!.y),
        ),
      ).toBe(true);
      for (let i = 0; i < 4_000; i++) {
        tick(s, undefined, PATHFINDING_TICK_OPTIONS);
        expectUniqueUnitCells(s);
        expect(backgroundPathSearches(s)).toBeLessThanOrEqual(PATH_BUDGET_PER_TICK);
      }
      expect(
        units.every((unit) => {
          const destination = unit.orderDestination!;
          return Math.round(unit.x) === destination.x && Math.round(unit.y) === destination.y;
        }),
      ).toBe(true);
    },
    LARGE_GROUP_TIMEOUT,
  );

  it.skipIf(IS_COVERAGE)(
    "preserves a 64-unit formation while spreading its arrival line",
    () => {
      const s = makeFixture({
        width: 96,
        height: 96,
        win: { kind: "harvestQuota", target: 99999 },
      });
      const units: ReturnType<typeof addUnit>[] = [];
      for (let y = 4; y < 12; y++) {
        for (let x = 3; x < 11; x++) units.push(addUnit(s, 0, "infantry", x, y));
      }
      issue(s, {
        type: "move",
        unitIds: units.map((unit) => unit.id),
        x: 72,
        y: 48,
        formation: "line",
      });
      const destinations = destinationsForGroup(s, units, 72, 48, "line");
      expect(
        new Set(destinations.map((destination) => `${destination.x},${destination.y}`)).size,
      ).toBe(units.length);

      for (let i = 0; i < 3_500; i++) {
        tick(s, undefined, PATHFINDING_TICK_OPTIONS);
        expectUniqueUnitCells(s);
        expect(backgroundPathSearches(s)).toBeLessThanOrEqual(PATH_BUDGET_PER_TICK);
      }
      expect(
        units.every((unit) => {
          const destination = unit.orderDestination!;
          return (
            Math.max(
              Math.abs(Math.round(unit.x) - destination.x),
              Math.abs(Math.round(unit.y) - destination.y),
            ) <= 1
          );
        }),
      ).toBe(true);
    },
    LARGE_GROUP_TIMEOUT,
  );

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
});
