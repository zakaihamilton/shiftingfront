import { describe, expect, it, vi } from "vitest";
import {
  drawUnitHealthMeter,
  entityHasWorldHealthMeter,
  healthMeterColors,
  repairTargetIds,
  worldHealthMeterHeight,
  worldHealthMeterLayout,
} from "../../lib/render/renderOverlays";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";

describe("health meter colors", () => {
  it("returns olive for health ratio > 0.5", () => {
    const full = healthMeterColors(1.0);
    expect(full.top).toBe("#6b8f4e");
    expect(full.bottom).toBe("#3f5c32");

    const halfPlus = healthMeterColors(0.51);
    expect(halfPlus.top).toBe("#6b8f4e");
  });

  it("returns brass for health ratio between 0.25 and 0.5", () => {
    const mid = healthMeterColors(0.5);
    expect(mid.top).toBe("#c4a24a");
    expect(mid.bottom).toBe("#7a5e22");

    const quarterPlus = healthMeterColors(0.26);
    expect(quarterPlus.top).toBe("#c4a24a");
  });

  it("returns dried-blood for health ratio <= 0.25", () => {
    const low = healthMeterColors(0.25);
    expect(low.top).toBe("#a84a42");
    expect(low.bottom).toBe("#6b2a26");

    const critical = healthMeterColors(0.05);
    expect(critical.top).toBe("#a84a42");
  });

  it("adapts health meter colors for deuteranopia / protanopia", () => {
    // High health uses high-contrast sky blue, mid uses amber, low uses rose/magenta
    const high = healthMeterColors(0.8, "deuteranopia");
    expect(high.top).toBe("#38bdf8");
    expect(high.bottom).toBe("#0284c7");

    const mid = healthMeterColors(0.4, "deuteranopia");
    expect(mid.top).toBe("#fbbf24");
    expect(mid.bottom).toBe("#d97706");

    const low = healthMeterColors(0.2, "protanopia");
    expect(low.top).toBe("#f43f5e");
    expect(low.bottom).toBe("#be123c");
  });

  it("adapts health meter colors for tritanopia", () => {
    // High health uses teal, mid uses coral orange, low uses purple
    const high = healthMeterColors(0.8, "tritanopia");
    expect(high.top).toBe("#2dd4bf");
    expect(high.bottom).toBe("#0f766e");

    const mid = healthMeterColors(0.4, "tritanopia");
    expect(mid.top).toBe("#fb923c");
    expect(mid.bottom).toBe("#c2410c");

    const low = healthMeterColors(0.2, "tritanopia");
    expect(low.top).toBe("#a855f7");
    expect(low.bottom).toBe("#7e22ce");
  });
});

describe("worldHealthMeterHeight", () => {
  it("stays a thin 2px strip at default zoom", () => {
    expect(worldHealthMeterHeight(1)).toBe(2);
  });

  it("scales with zoom", () => {
    expect(worldHealthMeterHeight(2)).toBe(5);
  });
});

describe("drawUnitHealthMeter canvas rendering", () => {
  function createMockCtx(): CanvasRenderingContext2D {
    const grad = {
      addColorStop: vi.fn(),
    };
    return {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      createLinearGradient: vi.fn().mockReturnValue(grad),
      globalAlpha: 1,
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;
  }

  it("skips rendering if maxHp <= 0 or hp <= 0", () => {
    const ctx = createMockCtx();
    drawUnitHealthMeter(ctx, 100, 50, 0, 100, 1);
    expect(ctx.save).not.toHaveBeenCalled();

    drawUnitHealthMeter(ctx, 100, 50, 100, 0, 1);
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it("renders steel housing, track, fill, and segment ticks for full health", () => {
    const ctx = createMockCtx();
    drawUnitHealthMeter(ctx, 100, 50, 100, 100, 1, 1, false, 20);

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
    expect(ctx.createLinearGradient).toHaveBeenCalledWith(90, 50, 90, 52);
    expect(ctx.strokeStyle).toBe("rgba(58, 77, 94, 0.85)");
    expect(ctx.strokeRect).toHaveBeenCalledWith(89.5, 49.5, 21, 3);
    expect(ctx.fillRect).toHaveBeenCalledWith(89, 49, 22, 4); // housing
    expect(ctx.fillRect).toHaveBeenCalledWith(90, 50, 20, 2); // track
    expect(ctx.fillRect).toHaveBeenCalledWith(90, 50, 20, 2); // fill
    expect(ctx.fillRect).toHaveBeenCalledWith(94, 50, 1, 2);
    expect(ctx.fillRect).toHaveBeenCalledWith(98, 50, 1, 2);
    expect(ctx.fillRect).toHaveBeenCalledWith(102, 50, 1, 2);
    expect(ctx.fillRect).toHaveBeenCalledWith(106, 50, 1, 2);
    expect(ctx.fillRect).not.toHaveBeenCalledWith(89, 50, 2, 2); // no owner-colored overlay
  });

  it("renders proportional fill and only ticks inside the filled width", () => {
    const ctx = createMockCtx();
    drawUnitHealthMeter(ctx, 100, 50, 50, 100, 1, 1, false, 20);

    expect(ctx.fillRect).toHaveBeenCalledWith(90, 50, 10, 2);
    expect(ctx.fillRect).toHaveBeenCalledWith(94, 50, 1, 2);
    expect(ctx.fillRect).toHaveBeenCalledWith(98, 50, 1, 2);
    expect(ctx.fillRect).not.toHaveBeenCalledWith(102, 50, 1, 2);
  });

  it("renders a selection accent under the housing when isSelected is true", () => {
    const ctx = createMockCtx();
    drawUnitHealthMeter(ctx, 100, 50, 80, 100, 1, 1, true, 20);

    expect(ctx.fillRect).toHaveBeenCalledWith(90, 53, 20, 1);
  });

  it("respects alpha and zoom scaling", () => {
    const ctx = createMockCtx();
    drawUnitHealthMeter(ctx, 200, 100, 100, 100, 2, 0.75, false);

    expect(ctx.globalAlpha).toBe(0.75);
    expect(ctx.fillRect).toHaveBeenCalledWith(179, 99, 42, 7);
  });

  it("adds a yellow glow around a repairing health bar", () => {
    const ctx = createMockCtx();
    drawUnitHealthMeter(ctx, 100, 50, 50, 100, 1, 1, false, 20, true);

    expect(ctx.shadowColor).toBe("rgba(255, 214, 72, 0.92)");
    expect(ctx.shadowBlur).toBe(5);
    expect(ctx.strokeRect).toHaveBeenNthCalledWith(1, 88.5, 48.5, 23, 5);
    expect(ctx.strokeRect).toHaveBeenNthCalledWith(2, 89.5, 49.5, 21, 3);
  });

});

describe("repairTargetIds", () => {
  it("tracks repairing buildings and units assigned to support providers", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const building = addBuilding(state, 0, "power", 4, 4);
    building.repairing = true;
    const truck = addUnit(state, 0, "repairTruck", 2, 2);
    const tank = addUnit(state, 0, "tank", 3, 3);
    truck.supportTargetId = tank.id;
    const idleUnit = addUnit(state, 0, "infantry", 5, 5);

    expect(repairTargetIds(state)).toEqual(new Set([building.id, tank.id]));
    expect(repairTargetIds({ entities: [{ ...idleUnit, hp: 0 }] })).toEqual(new Set());
  });
});

describe("entityHasWorldHealthMeter", () => {
  it("shows the world meter for units", () => {
    expect(entityHasWorldHealthMeter({ class: "unit", kind: "infantry" })).toBe(true);
    expect(entityHasWorldHealthMeter({ class: "unit", kind: "tank" })).toBe(true);
    expect(entityHasWorldHealthMeter({ class: "unit", kind: "harvester" })).toBe(true);
  });

  it("shows the world meter for turret buildings", () => {
    expect(entityHasWorldHealthMeter({ class: "building", kind: "turret" })).toBe(true);
  });

  it("shows a world meter for a non-turret building while it is being repaired", () => {
    expect(entityHasWorldHealthMeter({ class: "building", kind: "power" }, true)).toBe(true);
  });

  it("hides the world meter for other buildings", () => {
    expect(entityHasWorldHealthMeter({ class: "building", kind: "constructionYard" })).toBe(false);
    expect(entityHasWorldHealthMeter({ class: "building", kind: "power" })).toBe(false);
    expect(entityHasWorldHealthMeter({ class: "building", kind: "refinery" })).toBe(false);
    expect(entityHasWorldHealthMeter({ class: "building", kind: "barracks" })).toBe(false);
    expect(entityHasWorldHealthMeter({ class: "building", kind: "factory" })).toBe(false);
    expect(entityHasWorldHealthMeter({ class: "building", kind: "objective" })).toBe(false);
  });
});

describe("worldHealthMeterLayout", () => {
  it("places unit meters above the sprite top", () => {
    const layout = worldHealthMeterLayout({ kind: "infantry" }, { w: 24 }, 100, 80, 200, 1);
    expect(layout.centerX).toBe(112);
    expect(layout.meterY).toBe(73);
    expect(layout.barW).toBe(18);
  });

  it("places turret meters just above the 3D cannon instead of the padded sprite top", () => {
    const layout = worldHealthMeterLayout({ kind: "turret" }, { w: 84 }, 40, 10, 200, 1);
    expect(layout.centerX).toBe(82);
    expect(layout.meterY).toBe(190);
    expect(layout.barW).toBe(24);
    expect(layout.meterY).toBeGreaterThan(10);
  });
});
