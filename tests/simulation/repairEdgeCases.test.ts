import { describe, expect, it } from "vitest";
import { addBuilding, makeFixture } from "../../lib/sim/fixtures";
import { issue } from "../../lib/sim/api";
import { canRepair, tickRepair } from "../../lib/sim/repair";

describe("repair edge cases", () => {
  it("skips repair on a dead building and clears repairing flag", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const power = addBuilding(s, 0, "power", 4, 4);
    power.hp = 0;
    power.repairing = true;
    tickRepair(s);
    expect(power.repairing).toBe(false);
    expect(power.hp).toBe(0);
  });

  it("clears repairing on a constructing building", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const turret = addBuilding(s, 0, "turret", 4, 4, 50);
    turret.repairing = true;
    tickRepair(s);
    expect(turret.repairing).toBe(false);
  });

  it("sets hp to maxHp when hp already meets or exceeds it", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const power = addBuilding(s, 0, "power", 4, 4);
    power.hp = power.maxHp;
    power.repairing = true;
    tickRepair(s);
    expect(power.hp).toBe(power.maxHp);
    expect(power.repairing).toBe(false);
  });

  it("skips repair when credits are insufficient for the full tick", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const barracks = addBuilding(s, 0, "barracks", 4, 4);
    barracks.hp = 100;
    s.credits[0] = 0;
    issue(s, { type: "repair", buildingId: barracks.id });
    tickRepair(s);
    expect(barracks.hp).toBe(100);
    expect(barracks.repairing).toBe(true);
  });

  it("pauses repair while a hostile combatant is actively attacking the building", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const power = addBuilding(s, 0, "power", 4, 4);
    const attacker = addBuilding(s, 1, "turret", 8, 8);
    power.hp = 100;
    power.repairing = true;
    attacker.attackTarget = power.id;
    const creditsBefore = s.credits[0];

    tickRepair(s);

    expect(power.hp).toBe(100);
    expect(s.credits[0]).toBe(creditsBefore);
    expect(power.repairing).toBe(true);

    attacker.attackTarget = undefined;
    tickRepair(s);
    expect(power.hp).toBeGreaterThan(100);
  });

  it("clamps restored hp to exactly maxHp on the finishing tick", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const power = addBuilding(s, 0, "power", 4, 4);
    power.hp = power.maxHp - 1;
    s.credits[0] = 100_000;
    issue(s, { type: "repair", buildingId: power.id });
    tickRepair(s);
    expect(power.hp).toBe(power.maxHp);
    expect(power.repairing).toBe(false);
  });

  it("canRepair returns true only for damaged owned buildings", () => {
    expect(canRepair({ class: "building", hp: 100, maxHp: 200, constructing: 0 })).toBe(true);
    expect(canRepair({ class: "building", hp: 200, maxHp: 200, constructing: 0 })).toBe(false);
    expect(canRepair({ class: "building", hp: 100, maxHp: 200, constructing: 1 })).toBe(false);
    expect(canRepair({ class: "building", hp: 0, maxHp: 200, constructing: 0 })).toBe(false);
    expect(canRepair({ class: "unit", hp: 100, maxHp: 200, constructing: 0 })).toBe(false);
  });

  it("does not affect non-repairing entities", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const power = addBuilding(s, 0, "power", 4, 4);
    power.hp = 100;
    const creditsBefore = s.credits[0];
    tickRepair(s);
    expect(power.hp).toBe(100);
    expect(s.credits[0]).toBe(creditsBefore);
  });
});
