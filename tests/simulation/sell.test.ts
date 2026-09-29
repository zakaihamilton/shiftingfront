import { describe, expect, it } from "vitest";
import { BUILDING_STATS, sellRefundFor } from "../../lib/catalog";
import { issue } from "../../lib/sim/api";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { tickProduction } from "../../lib/sim/production";
import { canSell } from "../../lib/sim/sell";

describe("structure selling", () => {
  it("scraps a finished friendly building and refunds remaining value", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const power = addBuilding(s, 0, "power", 4, 4);
    const startCredits = s.credits[0];

    const events = issue(s, { type: "sell", buildingId: power.id });
    expect(power.hp).toBe(0);
    expect(s.credits[0]).toBe(startCredits + sellRefundFor("power", BUILDING_STATS.power.hp));
    expect(s.losses.buildings).toEqual([1, 0]);
    expect(events).toEqual([{ type: "sold", id: power.id, kind: "power", x: power.x, y: power.y }]);
  });

  it("pays less for a damaged building", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const turret = addBuilding(s, 0, "turret", 6, 4);
    turret.hp = turret.maxHp / 2;
    const startCredits = s.credits[0];
    issue(s, { type: "sell", buildingId: turret.id });
    expect(s.credits[0]).toBe(startCredits + sellRefundFor("turret", turret.maxHp / 2));
    expect(s.credits[0]).toBeLessThan(startCredits + sellRefundFor("turret", turret.maxHp));
  });

  it("keeps shared jobs when a producer is sold and uses another producer", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "power", 3, 0);
    const barracks = addBuilding(s, 0, "barracks", 4, 4);
    const otherBarracks = addBuilding(s, 0, "barracks", 8, 4);
    issue(s, { type: "produce", fromId: barracks.id, unit: "infantry" });
    issue(s, { type: "produce", fromId: otherBarracks.id, unit: "antiArmor" });
    issue(s, { type: "produce", fromId: otherBarracks.id, unit: "infantry" });
    const sharedQueue = s.productionQueues?.[0]?.barracks;
    sharedQueue!.producing!.remaining = 1;
    const startCredits = s.credits[0];

    issue(s, { type: "sell", buildingId: barracks.id });
    expect(barracks.hp).toBe(0);
    expect(s.credits[0]).toBe(startCredits + sellRefundFor("barracks", BUILDING_STATS.barracks.hp));
    expect(sharedQueue).toEqual({
      producing: { kind: "infantry", remaining: 1 },
      queue: ["antiArmor", "infantry"],
    });

    const events = tickProduction(s);
    expect(events).toContainEqual(expect.objectContaining({
      type: "produced",
      kind: "infantry",
      sourceId: otherBarracks.id,
    }));
  });

  it("refuses enemy, constructing, yard, objective, and unit targets", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    const yard = addBuilding(s, 0, "constructionYard", 0, 0);
    const enemy = addBuilding(s, 1, "power", 8, 8);
    const building = addBuilding(s, 0, "power", 4, 4, BUILDING_STATS.power.buildTicks);
    const objective = addBuilding(s, 0, "objective", 2, 6);
    const unit = addUnit(s, 0, "infantry", 6, 6);
    const startCredits = s.credits[0];

    issue(s, { type: "sell", buildingId: enemy.id });
    issue(s, { type: "sell", buildingId: building.id });
    issue(s, { type: "sell", buildingId: yard.id });
    issue(s, { type: "sell", buildingId: objective.id });
    issue(s, { type: "sell", buildingId: unit.id });

    expect(enemy.hp).toBeGreaterThan(0);
    expect(building.hp).toBeGreaterThan(0);
    expect(yard.hp).toBeGreaterThan(0);
    expect(objective.hp).toBeGreaterThan(0);
    expect(unit.hp).toBeGreaterThan(0);
    expect(s.credits[0]).toBe(startCredits);
    expect(canSell(building)).toBe(false);
    expect(canSell(yard)).toBe(false);
    expect(canSell(objective)).toBe(false);
    expect(canSell(unit)).toBe(false);
  });

  it("charges a positive refund for a finished structure", () => {
    expect(sellRefundFor("power", BUILDING_STATS.power.hp)).toBeGreaterThan(0);
    expect(sellRefundFor("turret", BUILDING_STATS.turret.hp)).toBe(Math.round(BUILDING_STATS.turret.cost * 0.5));
  });
});
