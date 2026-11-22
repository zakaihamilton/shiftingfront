import { describe, expect, it } from "vitest";
import { issue, tick } from "../../lib/sim/api";
import { tickCombat } from "../../lib/sim/combat";
import {
  addBuilding,
  addUnit,
  makeFixture,
  setHeight,
  setTile,
  TILE_BLOCKED,
  TILE_WATER,
} from "../../lib/sim/fixtures";
import {
  flowFieldCacheSize,
  flowFieldFor,
  flowFieldForGoals,
  flowStep,
} from "../../lib/sim/flowField";
import { navigationStepAllowed } from "../../lib/sim/navigation/grid";
import { resetPathBudget } from "../../lib/sim/pathBudget";
import { tickEscort } from "../../lib/sim/scenarios/escort";
import {
  compactDestroyedEntities,
  heightAt,
  isStaticWalkable,
  makeUnitOccupancy,
  staticNavigationFor,
} from "../../lib/sim/world";
import { expectUniqueUnitCells } from "./helpers";

const PATHFINDING_TICK_OPTIONS = {
  evaluateObjectives: false,
  collectEvents: false,
  updateFog: false,
} as const;

describe("pathfinding flow fields and navigation cache", () => {
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
    expect(
      new Set(destinations.map((destination) => `${destination.x},${destination.y}`)).size,
    ).toBe(units.length);
    expect(
      destinations.every((destination) => isStaticWalkable(s, destination.x, destination.y)),
    ).toBe(true);
    for (let i = 0; i < 600; i++) {
      tick(s, undefined, PATHFINDING_TICK_OPTIONS);
      expectUniqueUnitCells(s);
    }
    expect(
      units.every((unit) => {
        const destination = unit.orderDestination!;
        return Math.round(unit.x) === destination.x && Math.round(unit.y) === destination.y;
      }),
    ).toBe(true);
  });

  it("bounds the per-state cache for distinct multi-goal fields", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    for (let i = 0; i < 160; i++) {
      const x = 1 + (i % 20);
      const y = 1 + Math.floor(i / 20);
      flowFieldForGoals(s, [
        { x, y },
        { x: x + 1, y },
      ]);
    }
    expect(flowFieldCacheSize(s)).toBeLessThan(160);
  });

  it("keeps grouped attack-move followers active while their flow route is pending", () => {
    const s = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
    const units = [addUnit(s, 0, "infantry", 2, 2), addUnit(s, 0, "tank", 2, 3)];
    issue(s, { type: "attackMove", unitIds: units.map((unit) => unit.id), x: 16, y: 16 });
    for (const unit of units) {
      unit.path = [];
      unit.idle = false;
      unit.routePending = true;
    }

    tickCombat(s);

    expect(units.every((unit) => unit.flowGoal && !unit.idle)).toBe(true);
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
      tick(s, undefined, PATHFINDING_TICK_OPTIONS);
      expectUniqueUnitCells(s);
      for (let index = 0; index < units.length; index++) {
        const unit = units[index]!;
        const current = { x: Math.round(unit.x), y: Math.round(unit.y) };
        const before = previous[index]!;
        if (current.x !== before.x || current.y !== before.y) {
          expect(navigationStepAllowed(navigation, before.x, before.y, current.x, current.y)).toBe(
            true,
          );
        }
        if (current.x === 18 && current.y >= 27) crossedRamp = true;
        previous[index] = current;
      }
    }

    expect(crossedRamp).toBe(true);
    expect(
      units.every((unit) => {
        const destination = unit.orderDestination!;
        return (
          unit.idle && Math.round(unit.x) === destination.x && Math.round(unit.y) === destination.y
        );
      }),
    ).toBe(true);
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

    expect(
      units.every((unit) => {
        const destination = unit.orderDestination!;
        return !(
          destination.x >= 17 &&
          destination.x <= 25 &&
          destination.y >= 8 &&
          destination.y <= 19
        );
      }),
    ).toBe(true);

    for (let tickIndex = 0; tickIndex < 1_200; tickIndex++) {
      tick(s, undefined, PATHFINDING_TICK_OPTIONS);
      expectUniqueUnitCells(s);
    }

    expect(
      units.every((unit) => {
        const destination = unit.orderDestination!;
        return (
          unit.idle &&
          Math.round(unit.x) === destination.x &&
          Math.round(unit.y) === destination.y &&
          heightAt(s, destination.x, destination.y) < 3
        );
      }),
    ).toBe(true);
  });

  it("routes a departing convoy after the path budget is spent", () => {
    const s = makeFixture({ width: 24, height: 16, win: { kind: "escort", targetCount: 1 } });
    const convoy = addUnit(s, 0, "convoyTruck", 2, 2);
    convoy.neutral = true;
    convoy.scenarioRole = "convoy";
    s.tick = 10;
    s.runtime = {
      kind: "escort",
      phase: "active",
      targetIds: [convoy.id],
      convoyStartTick: s.tick,
      zone: { x: 18, y: 8 },
      deadline: 5000,
      rescued: 0,
      required: 1,
      secondary: [],
    };
    resetPathBudget(s, 0);

    tickEscort(s);

    expect(s.pathBudget?.remaining).toBe(0);
    expect(convoy.path.length).toBeGreaterThan(0);
    expect(convoy.orderDestination).toBeDefined();
    expect(convoy.routePending).not.toBe(true);
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
    convoy.path = [
      { x: 5, y: 3 },
      { x: 6, y: 3 },
      { x: 7, y: 3 },
      { x: 8, y: 3 },
    ];
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
    issue(s, {
      type: "move",
      unitIds: units.map((unit) => unit.id),
      x: 16,
      y: 9,
      formation: "line",
    });

    for (let i = 0; i < 500; i++) {
      tick(s, undefined, PATHFINDING_TICK_OPTIONS);
      expectUniqueUnitCells(s);
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
    expect(new Set(units.map((unit) => `${Math.round(unit.x)},${Math.round(unit.y)}`)).size).toBe(
      units.length,
    );
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
    const building = s.entities.find(
      (entity) => entity.class === "building" && entity.kind === "power",
    );
    building!.hp = 0;
    compactDestroyedEntities(s);
    expect(s.navigationRevision).toBe(revisionAfterAdd + 1);
  });
});
