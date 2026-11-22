import { describe, expect, it } from "vitest";
import { tickAi } from "../../lib/sim/ai";
import { issue, tick } from "../../lib/sim/api";
import { tickCombat } from "../../lib/sim/combat";
import { addBuilding, addUnit, makeFixture, setTile, TILE_BLOCKED } from "../../lib/sim/fixtures";
import { navigationStepAllowed } from "../../lib/sim/navigation/grid";
import { smoothGridPath } from "../../lib/sim/navigation/smooth";
import {
  backgroundPathSearches,
  PATH_BUDGET_PER_TICK,
  resetPathBudget,
  tryFindPath,
} from "../../lib/sim/pathBudget";
import { findPath } from "../../lib/sim/pathfinding";
import { staticNavigationFor } from "../../lib/sim/world";

const PATHFINDING_TICK_OPTIONS = {
  evaluateObjectives: false,
  collectEvents: false,
  updateFog: false,
} as const;

function directionChanges(
  start: { x: number; y: number },
  path: readonly { x: number; y: number }[],
): number {
  return runStats(start, path).changes;
}

function longestRun(
  start: { x: number; y: number },
  path: readonly { x: number; y: number }[],
): number {
  return runStats(start, path).longest;
}

function runStats(
  start: { x: number; y: number },
  path: readonly { x: number; y: number }[],
): { changes: number; longest: number } {
  let changes = 0;
  let longest = 0;
  let run = 0;
  let previousX = start.x;
  let previousY = start.y;
  let lastX = 0;
  let lastY = 0;
  let started = false;
  for (const step of path) {
    const dx = step.x - previousX;
    const dy = step.y - previousY;
    if (!started || dx !== lastX || dy !== lastY) {
      if (started) changes += 1;
      run = 1;
    } else {
      run += 1;
    }
    if (run > longest) longest = run;
    lastX = dx;
    lastY = dy;
    started = true;
    previousX = step.x;
    previousY = step.y;
  }
  return { changes, longest };
}

describe("path smoothing and heading continuity", () => {
  it("keeps an open route on one turn toward the destination", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const path = findPath(s, { x: 2, y: 2 }, { x: 10, y: 5 });
    expect(path.at(-1)).toEqual({ x: 10, y: 5 });
    expect(path).toHaveLength(8);
    expect(directionChanges({ x: 2, y: 2 }, path)).toBe(1);
    let x = 2;
    let y = 2;
    for (const step of path) {
      expect(Math.max(Math.abs(step.x - x), Math.abs(step.y - y))).toBe(1);
      x = step.x;
      y = step.y;
    }
  });

  it("routes around a wall without entering it", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    for (let y = 1; y <= 8; y++) setTile(s, 6, y, TILE_BLOCKED);
    const path = findPath(s, { x: 2, y: 4 }, { x: 10, y: 4 });
    const navigation = staticNavigationFor(s);
    expect(path.at(-1)).toEqual({ x: 10, y: 4 });
    expect(path.some((step) => step.x === 6 && step.y >= 1 && step.y <= 8)).toBe(false);
    expect(directionChanges({ x: 2, y: 4 }, path)).toBeLessThanOrEqual(4);
    expect(longestRun({ x: 2, y: 4 }, path)).toBeGreaterThanOrEqual(3);
    let x = 2;
    let y = 4;
    for (const step of path) {
      expect(navigationStepAllowed(navigation, x, y, step.x, step.y)).toBe(true);
      x = step.x;
      y = step.y;
    }
  });

  it("pulls a staircase into a straight diagonal and refuses a costlier shortcut", () => {
    const s = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    const navigation = staticNavigationFor(s);
    const weave = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ];
    expect(smoothGridPath(navigation, { x: 0, y: 0 }, weave)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);

    const around = smoothGridPath(
      navigation,
      { x: 0, y: 0 },
      [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
      ],
      {
        cellCost: (x, y) => (x === y && x > 0 ? 50 : 1),
      },
    );
    expect(around.some((step) => step.x === 1 && step.y === 1)).toBe(false);
    expect(around.at(-1)).toEqual({ x: 2, y: 2 });
  });

  it("holds the closer heading on an open offset route", () => {
    const s = makeFixture({ width: 24, height: 16, win: { kind: "annihilate" } });
    const start = { x: 2, y: 4 };
    const path = findPath(s, start, { x: 16, y: 8 });
    expect(path.at(-1)).toEqual({ x: 16, y: 8 });
    expect(path).toHaveLength(14);
    expect(directionChanges(start, path)).toBe(1);
    expect(longestRun(start, path)).toBeGreaterThanOrEqual(10);
    expect(
      path
        .slice(0, 10)
        .every((step, index) => step.x === start.x + index + 1 && step.y === start.y),
    ).toBe(true);
  });

  it("keeps walking the current heading when that leg still reaches the goal", () => {
    const s = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    const start = { x: 2, y: 4 };
    const fresh = findPath(s, start, { x: 12, y: 10 });
    const continued = findPath(s, start, { x: 12, y: 10 }, { approach: { x: 1, y: 0 } });
    expect(fresh[0]).toEqual({ x: 3, y: 5 });
    expect(continued[0]).toEqual({ x: 3, y: 4 });
    expect(continued).toHaveLength(10);
    expect(directionChanges(start, continued)).toBe(1);
  });

  it("clears a blocked finish in one turn instead of weaving", () => {
    const s = makeFixture({ width: 24, height: 16, win: { kind: "annihilate" } });
    setTile(s, 14, 4, TILE_BLOCKED);
    setTile(s, 15, 4, TILE_BLOCKED);
    const start = { x: 2, y: 4 };
    const path = findPath(s, start, { x: 18, y: 7 });
    expect(path.at(-1)).toEqual({ x: 18, y: 7 });
    expect(directionChanges(start, path)).toBe(1);
    expect(longestRun(start, path)).toBeGreaterThanOrEqual(10);
    const navigation = staticNavigationFor(s);
    let x = start.x;
    let y = start.y;
    for (const step of path) {
      expect(navigationStepAllowed(navigation, x, y, step.x, step.y)).toBe(true);
      expect(step.x === 14 && step.y === 4).toBe(false);
      expect(step.x === 15 && step.y === 4).toBe(false);
      x = step.x;
      y = step.y;
    }
  });

  it("walks an offset order without alternating headings", () => {
    const s = makeFixture({ width: 24, height: 16, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const unit = addUnit(s, 0, "infantry", 2, 4);
    issue(s, { type: "move", unitIds: [unit.id], x: 16, y: 8 });
    const cells = [{ x: 2, y: 4 }];
    for (let tickIndex = 0; tickIndex < 400; tickIndex += 1) {
      tick(s, undefined, PATHFINDING_TICK_OPTIONS);
      const x = Math.round(unit.x);
      const y = Math.round(unit.y);
      const last = cells[cells.length - 1]!;
      if (x !== last.x || y !== last.y) cells.push({ x, y });
      if (x === 16 && y === 8 && unit.path.length === 0) break;
    }
    expect(cells.at(-1)).toEqual({ x: 16, y: 8 });
    expect(directionChanges(cells[0]!, cells.slice(1))).toBeLessThanOrEqual(1);
  });

  it("marches a group on long straight runs instead of a staircase", () => {
    const s = makeFixture({ width: 28, height: 20, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const units = Array.from({ length: 6 }, (_, index) =>
      addUnit(s, 0, "infantry", 3 + (index % 3), 4 + Math.floor(index / 3)),
    );
    issue(s, { type: "move", unitIds: units.map((unit) => unit.id), x: 20, y: 10 });
    const cells = units.map((unit) => [{ x: Math.round(unit.x), y: Math.round(unit.y) }]);
    for (let tickIndex = 0; tickIndex < 450; tickIndex += 1) {
      tick(s, undefined, PATHFINDING_TICK_OPTIONS);
      units.forEach((unit, index) => {
        const x = Math.round(unit.x);
        const y = Math.round(unit.y);
        const last = cells[index]![cells[index]!.length - 1]!;
        if (x !== last.x || y !== last.y) cells[index]!.push({ x, y });
      });
    }
    units.forEach((unit, index) => {
      const walked = cells[index]!;
      expect(longestRun(walked[0]!, walked.slice(1)), `unit ${unit.id}`).toBeGreaterThanOrEqual(8);
    });
  });

  it("walks screen up, down, left, and right straight along that facing", () => {
    const orders = [
      { from: { x: 4, y: 4 }, to: { x: 9, y: 9 }, facing: 2, axis: "down" },
      { from: { x: 4, y: 9 }, to: { x: 9, y: 4 }, facing: 0, axis: "right" },
      { from: { x: 9, y: 4 }, to: { x: 4, y: 9 }, facing: 4, axis: "left" },
      { from: { x: 9, y: 9 }, to: { x: 4, y: 4 }, facing: 6, axis: "up" },
    ] as const;
    for (const order of orders) {
      const s = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
      addBuilding(s, 0, "constructionYard", 0, 0);
      const unit = addUnit(s, 0, "infantry", order.from.x, order.from.y);
      issue(s, { type: "move", unitIds: [unit.id], x: order.to.x, y: order.to.y });
      for (let tickIndex = 0; tickIndex < 36; tickIndex += 1)
        tick(s, undefined, PATHFINDING_TICK_OPTIONS);
      const drift =
        order.facing === 2 || order.facing === 6
          ? Math.abs(unit.x - order.from.x - (unit.y - order.from.y))
          : Math.abs(unit.x - order.from.x + (unit.y - order.from.y));
      expect(drift, order.axis).toBeLessThan(1e-6);
      expect(unit.facing, order.axis).toBe(order.facing);
      expect(Math.hypot(unit.x - order.from.x, unit.y - order.from.y), order.axis).toBeGreaterThan(
        1,
      );
    }
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
      mover.path = [
        { x: 4, y },
        { x: 12, y },
      ];
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
    const prior = [
      { x: 11, y: 10 },
      { x: 12, y: 10 },
      { x: 13, y: 10 },
    ];
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
    const prior = [
      { x: 5, y: 4 },
      { x: 6, y: 4 },
    ];
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
