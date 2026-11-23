import { describe, expect, it } from "vitest";
import { UNIT_STATS } from "../../lib/catalog";
import { issue, tick } from "../../lib/sim/api";
import { addBuilding, addUnit, makeFixture, setTile, TILE_BLOCKED } from "../../lib/sim/fixtures";
import { unitAt } from "../../lib/sim/world";
import { expectUniqueUnitCells } from "./helpers";

const PATHFINDING_TICK_OPTIONS = {
  evaluateObjectives: false,
  collectEvents: false,
  updateFog: false,
} as const;

describe("pathfinding collision and rerouting", () => {
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
      [4, 3],
      [5, 3],
      [6, 3],
      [4, 4],
      [6, 4],
      [4, 5],
      [5, 5],
      [6, 5],
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
    for (let i = 0; i < 900; i++) tick(s, undefined, PATHFINDING_TICK_OPTIONS);
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
    for (let i = 0; i < 900; i++) tick(s, undefined, PATHFINDING_TICK_OPTIONS);
    expect(Math.round(loner.x)).toBe(16);
    expect(Math.round(loner.y)).toBe(5);
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
      tick(s, undefined, PATHFINDING_TICK_OPTIONS);
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
      tick(s, undefined, PATHFINDING_TICK_OPTIONS);
      expectUniqueUnitCells(s);
      expect(Math.hypot(a.x - previousA.x, a.y - previousA.y)).toBeLessThanOrEqual(
        UNIT_STATS.infantry.speed + 1e-6,
      );
      expect(Math.hypot(b.x - previousB.x, b.y - previousB.y)).toBeLessThanOrEqual(
        UNIT_STATS.infantry.speed + 1e-6,
      );
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

    const settledAt = history.findIndex(
      (sample) =>
        sample.pathLength === 0 &&
        Math.round(sample.x) === resolvedDestination.x &&
        Math.round(sample.y) === resolvedDestination.y,
    );
    expect(settledAt).toBeGreaterThan(0);
    expect(
      history
        .slice(settledAt)
        .every(
          (sample) => sample.x === resolvedDestination.x && sample.y === resolvedDestination.y,
        ),
    ).toBe(true);
    expect(resolvedDestination).not.toEqual({ x: 14, y: 6 });
  });

  it("does not reverse a flow follower when occupancy removes its forward lane", () => {
    const s = makeFixture({ width: 12, height: 8, win: { kind: "harvestQuota", target: 99999 } });
    const mover = addUnit(s, 0, "infantry", 3, 3);
    for (const [x, y] of [
      [4, 2],
      [4, 3],
      [4, 4],
      [3, 4],
    ] as const) {
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

  it("does not shove a progressing mover sideways when someone is waiting behind", () => {
    const s = makeFixture({ width: 16, height: 10, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const lead = addUnit(s, 0, "infantry", 5, 3);
    const waiter = addUnit(s, 0, "infantry", 4, 3);
    lead.idle = false;
    lead.orderDestination = { x: 12, y: 3 };
    lead.path = [
      { x: 6, y: 3 },
      { x: 7, y: 3 },
      { x: 12, y: 3 },
    ];
    waiter.idle = false;
    waiter.orderDestination = { x: 5, y: 0 };
    waiter.path = [
      { x: 5, y: 3 },
      { x: 5, y: 2 },
      { x: 5, y: 1 },
      { x: 5, y: 0 },
    ];
    tick(s);
    expect(Math.round(lead.y)).toBe(3);
    expect(lead.path).toEqual([
      { x: 6, y: 3 },
      { x: 7, y: 3 },
      { x: 12, y: 3 },
    ]);
  });
});
