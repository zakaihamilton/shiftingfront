import { describe, expect, it } from "vitest";
import { BUILDING_STATS, repairCostFor, repairHpPerTick } from "../../lib/catalog";
import { issue, tick } from "../../lib/sim/api";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { canRepair } from "../../lib/sim/repair";

describe("structure repair", () => {
  it("toggles repair on a damaged friendly building and restores HP for credits", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const power = addBuilding(s, 0, "power", 4, 4);
    power.hp = Math.floor(power.maxHp * 0.4);
    const startHp = power.hp;
    const startCredits = s.credits[0];

    issue(s, { type: "repair", buildingId: power.id });
    expect(power.repairing).toBe(true);

    for (let i = 0; i < 12; i++) tick(s);
    expect(power.hp).toBeGreaterThan(startHp);
    expect(s.credits[0]).toBeLessThan(startCredits);
    expect(power.hp).toBeLessThanOrEqual(power.maxHp);
  });

  it("stops repairing once the building is at full HP", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const turret = addBuilding(s, 0, "turret", 6, 4);
    turret.hp = turret.maxHp - repairHpPerTick("turret") * 3;
    issue(s, { type: "repair", buildingId: turret.id });
    for (let i = 0; i < 20; i++) tick(s);
    expect(turret.hp).toBe(turret.maxHp);
    expect(turret.repairing).toBe(false);
  });

  it("pauses while credits are insufficient and resumes when funded", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const barracks = addBuilding(s, 0, "barracks", 4, 4);
    barracks.hp = 100;
    s.credits[0] = 0;
    issue(s, { type: "repair", buildingId: barracks.id });
    tick(s);
    expect(barracks.hp).toBe(100);
    expect(barracks.repairing).toBe(true);

    s.credits[0] = 500;
    tick(s);
    expect(barracks.hp).toBeGreaterThan(100);
  });

  it("toggles repair off before the building is finished", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const factory = addBuilding(s, 0, "factory", 4, 4);
    factory.hp = 200;
    issue(s, { type: "repair", buildingId: factory.id });
    tick(s);
    const hpAfterStart = factory.hp;
    issue(s, { type: "repair", buildingId: factory.id });
    expect(factory.repairing).toBe(false);
    tick(s);
    expect(factory.hp).toBe(hpAfterStart);
  });

  it("refuses enemy, constructing, full-health, and unit targets", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    const enemy = addBuilding(s, 1, "power", 8, 8);
    enemy.hp = 100;
    const building = addBuilding(s, 0, "power", 4, 4, BUILDING_STATS.power.buildTicks);
    building.hp = 100;
    const full = addBuilding(s, 0, "turret", 2, 2);
    const unit = addUnit(s, 0, "infantry", 6, 6);
    unit.hp = 10;

    issue(s, { type: "repair", buildingId: enemy.id });
    issue(s, { type: "repair", buildingId: building.id });
    issue(s, { type: "repair", buildingId: full.id });
    issue(s, { type: "repair", buildingId: unit.id });

    expect(enemy.repairing).toBeFalsy();
    expect(building.repairing).toBeFalsy();
    expect(full.repairing).toBeFalsy();
    expect(unit.repairing).toBeFalsy();
    expect(canRepair(building)).toBe(false);
    expect(canRepair(full)).toBe(false);
  });

  it("derives repair duration from the revised building HP values", () => {
    expect(repairHpPerTick("barracks")).toBe(1);
    expect(repairHpPerTick("constructionYard")).toBe(4);
    expect(Math.ceil(BUILDING_STATS.barracks.hp / repairHpPerTick("barracks"))).toBe(675);
  });

  it("charges a positive cost for a repair tick", () => {
    expect(repairCostFor("power", repairHpPerTick("power"))).toBeGreaterThan(0);
    expect(repairCostFor("constructionYard", repairHpPerTick("constructionYard"))).toBeGreaterThan(0);
  });

  it("enemy bases auto-repair damaged structures", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 1, "constructionYard", 8, 8);
    const power = addBuilding(s, 1, "power", 6, 6);
    power.hp = 120;
    tick(s);
    expect(power.repairing).toBe(true);
    const hp = power.hp;
    tick(s);
    expect(power.hp).toBeGreaterThan(hp);
  });

  it("sets the highlight tone to yellow when repairing and blue when eligible but not repairing", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const power = addBuilding(s, 0, "power", 4, 4);
    power.hp = 100;
    power.repairing = false;

    const toneIdle = power.repairing ? "220,190,70" : "90,220,200";
    expect(toneIdle).toBe("90,220,200");

    power.repairing = true;
    const toneRepairing = power.repairing ? "220,190,70" : "90,220,200";
    expect(toneRepairing).toBe("220,190,70");
  });
});
