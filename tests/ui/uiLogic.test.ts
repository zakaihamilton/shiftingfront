import { describe, expect, it } from "vitest";
import { campaignSummary, missionMedalDisplay } from "../../components/campaign/campaignSummary";
import { mobileCommandLabel } from "../../components/game/MobileTouchControls";
import { contextOrders, contextOrderNotice, isContactTarget, mobileCommandOrders } from "../../components/game/hooks/gameInputOrders";
import { dailySeed, menuLaunchPath } from "../../components/menu/menuLaunch";
import { createCampaign } from "../../lib/gen/campaign";
import { freshCampaignProgress } from "../../lib/persist/campaign";
import { addBuilding, addUnit, makeFixture, setTile, TILE_RESOURCE } from "../../lib/sim/fixtures";

describe("menu navigation policy", () => {
  it("rejects incomplete seeds and routes valid launches to briefing", () => {
    expect(menuLaunchPath("42")).toBeNull();
    expect(menuLaunchPath("0421")).toBe("/briefing?seed=0421&mission=0&from=menu");
  });

  it("keeps the daily seed stable for a UTC day and changes the next day", () => {
    const noon = Date.UTC(2026, 8, 3, 12);
    const laterSameDay = Date.UTC(2026, 8, 3, 23, 59);
    const nextDay = Date.UTC(2026, 8, 4, 0, 1);
    expect(dailySeed(noon)).toMatch(/^\d{4}$/);
    expect(dailySeed(noon)).toBe(dailySeed(laterSameDay));
    expect(dailySeed(noon)).not.toBe(dailySeed(nextDay));
  });
});

describe("campaign summary policy", () => {
  it("computes completion and medal totals from persisted progress", () => {
    const campaign = createCampaign(421);
    const progress = freshCampaignProgress(421);
    progress.completedMissions = [0, 1];
    progress.medals = { "0": 3, "1": 2 };
    const summary = campaignSummary(campaign, progress);

    expect(summary).toMatchObject({ completed: 2, totalMedals: 5, possibleMedals: 18, isComplete: false });
    expect(missionMedalDisplay(2)).toBe("★★☆");
  });
});

describe("mobile command policy", () => {
  it("labels commands and emits attack-and-continue movement or harvest orders", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    setTile(state, 6, 6, TILE_RESOURCE, 100);
    const unit = addUnit(state, 0, "infantry", 2, 2);

    expect(mobileCommandLabel("attackMove")).toBe("Attack-move");
    expect(mobileCommandLabel(null)).toBe("Ready");
    expect(mobileCommandOrders(state, "move", [unit.id], undefined, 6, 6)).toEqual([
      { type: "attackMove", unitIds: [unit.id], x: 6, y: 6 },
    ]);
    expect(contextOrders(state, [unit.id], undefined, 6, 6)).toEqual([
      { type: "attackMove", unitIds: [unit.id], x: 6, y: 6 },
    ]);
    expect(contextOrderNotice(contextOrders(state, [unit.id], undefined, 6, 6))).toBe("Attack-move order issued.");
    expect(mobileCommandOrders(state, "harvest", [unit.id], undefined, 6, 6)).toEqual([
      { type: "harvest", unitIds: [unit.id], x: 6, y: 6 },
    ]);
  });

  it("prioritizes support orders and sends non-support units to the same target", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const medic = addUnit(state, 0, "medic", 2, 2);
    const infantry = addUnit(state, 0, "infantry", 3, 2);
    infantry.hp = infantry.maxHp - 10;

    expect(contextOrders(state, [medic.id], infantry, 3, 2)).toEqual([
      { type: "support", unitIds: [medic.id], targetId: infantry.id },
    ]);
  });

  it("handles hostile targets, invalid commands, and scenario contacts", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 2, 2);
    const enemy = addUnit(state, 1, "tank", 4, 4);
    const contact = addUnit(state, 0, "infantry", 5, 5);
    contact.neutral = true;
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [contact.id],
      rescued: 0,
      required: 1,
      secondary: [],
    };

    expect(contextOrders(state, [unit.id], enemy, 4, 4)).toEqual([
      { type: "attack", unitIds: [unit.id], targetId: enemy.id },
    ]);
    expect(mobileCommandOrders(state, "attack", [unit.id], undefined, 4, 4)).toEqual([]);
    expect(isContactTarget(state, contact)).toBe(true);
  });

  it("turns empty-ground move taps and right-clicks from a producer into rally commands", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const barracks = addBuilding(state, 0, "barracks", 2, 2);
    expect(contextOrders(state, [barracks.id], undefined, 6, 6)).toEqual([
      { type: "rally", buildingId: barracks.id, x: 6, y: 6 },
    ]);
    expect(mobileCommandOrders(state, "move", [barracks.id], undefined, 7, 7)).toEqual([
      { type: "rally", buildingId: barracks.id, x: 7, y: 7 },
    ]);
    expect(contextOrders(state, [barracks.id], addUnit(state, 1, "infantry", 5, 5), 5, 5)).toEqual([]);
  });
});
