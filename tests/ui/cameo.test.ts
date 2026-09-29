import { describe, expect, it } from "vitest";
import { BUILDING_STATS, UNIT_STATS, buildingCameoStatus, buildingLimitReached, unitCameoStatus } from "../../lib/catalog";
import { addBuilding, makeFixture } from "../../lib/sim/fixtures";

describe("sidebar cameo progress", () => {
  it("allows multiple Barracks and Vehicle Plants", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "barracks", 4, 4, BUILDING_STATS.barracks.buildTicks);

    expect(buildingLimitReached(s.entities, 0, "barracks")).toBe(false);
    expect(buildingLimitReached(s.entities, 0, "factory")).toBe(false);
  });

  it("reports construction fill for a building under construction", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const total = BUILDING_STATS.power.buildTicks;
    addBuilding(s, 0, "power", 4, 4, Math.floor(total * 0.4));
    const cameo = buildingCameoStatus(s.entities, 0, "power");
    expect(cameo.phase).toBe("progress");
    expect(cameo.queued).toBe(1);
    expect(cameo.ratio).toBeCloseTo(0.6, 2);
    expect(buildingCameoStatus(s.entities, 0, "factory").phase).toBe("idle");
  });

  it("counts queued units and distinguishes in-progress from waiting", () => {
    const s = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "barracks", 4, 4);
    s.productionQueues![0] = {
      barracks: {
        producing: { kind: "infantry", remaining: UNIT_STATS.infantry.buildTicks / 2 },
        queue: ["infantry", "antiArmor", "infantry"],
      },
    };
    const sharedQueue = s.productionQueues![0]!.barracks;
    const infantry = unitCameoStatus(s.entities, 0, "infantry", sharedQueue);
    expect(infantry.phase).toBe("progress");
    expect(infantry.queued).toBe(3);
    expect(infantry.ratio).toBeCloseTo(0.5, 5);
    const waiting = unitCameoStatus(s.entities, 0, "antiArmor", sharedQueue);
    expect(waiting.phase).toBe("waiting");
    expect(waiting.queued).toBe(1);
    expect(waiting.ratio).toBe(0);
    expect(unitCameoStatus(s.entities, 0, "tank", sharedQueue).phase).toBe("idle");
  });
});
