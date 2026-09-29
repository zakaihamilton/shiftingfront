import { describe, expect, it, vi } from "vitest";
import { MAX_PRODUCTION_QUEUE, UNIT_STATS } from "../../lib/catalog";
import { PRODUCIBLE } from "../../components/game/hooks/gameActions";
import { addBuilding, makeFixture } from "../../lib/sim/fixtures";
import { cancelProduce, startProduce } from "../../lib/sim/orders/production";

function readyBase() {
  const s = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
  s.credits[0] = 50_000;
  addBuilding(s, 0, "constructionYard", 2, 2);
  addBuilding(s, 0, "power", 5, 2);
  addBuilding(s, 0, "barracks", 5, 5);
  addBuilding(s, 0, "factory", 8, 5);
  return s;
}

describe("startProduce rejection branches", () => {
  it("rejects scenario-only convoy trucks", () => {
    const s = readyBase();
    const factory = s.entities.find((entity) => entity.owner === 0 && entity.kind === "factory")!;
    expect(PRODUCIBLE).not.toContain("convoyTruck");
    expect(startProduce(s, factory.id, "convoyTruck")).toEqual([
      { type: "commandRejected", reason: "unit unavailable" },
    ]);
  });

  it("rejects when unit is unavailable at current mission index", async () => {
    const catalog = await import("../../lib/catalog");
    const spy = vi.spyOn(catalog, "isUnitAvailable").mockReturnValue(false);
    try {
      const s = readyBase();
      const events = startProduce(s, 3, "medic");
      expect(events).toEqual([{ type: "commandRejected", reason: "unit unavailable" }]);
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects when producer does not exist", () => {
    const s = readyBase();
    const events = startProduce(s, 999, "infantry");
    expect(events).toEqual([{ type: "commandRejected", reason: "producer unavailable" }]);
  });

  it("rejects when producer is an enemy building", () => {
    const s = readyBase();
    const enemy = addBuilding(s, 1, "barracks", 12, 5);
    const events = startProduce(s, enemy.id, "infantry");
    expect(events).toEqual([{ type: "commandRejected", reason: "producer unavailable" }]);
  });

  it("rejects when producer is still constructing", () => {
    const s = readyBase();
    const constructing = addBuilding(s, 0, "barracks", 5, 8, 100);
    const events = startProduce(s, constructing.id, "infantry");
    expect(events).toEqual([{ type: "commandRejected", reason: "producer unavailable" }]);
  });

  it("rejects when producer is a unit not a building", () => {
    const s = readyBase();
    const unit = s.entities.find((e) => e.class === "unit" && e.owner === 0);
    if (unit) {
      const events = startProduce(s, unit.id, "infantry");
      expect(events).toEqual([{ type: "commandRejected", reason: "producer unavailable" }]);
    }
  });

  it("rejects when requesting wrong unit type for producer", () => {
    const s = readyBase();
    const barracks = s.entities.find((e) => e.kind === "barracks" && e.owner === 0)!;
    const events = startProduce(s, barracks.id, "tank");
    expect(events).toEqual([{ type: "commandRejected", reason: "wrong producer" }]);
  });

  it("rejects when production queue is full", () => {
    const s = readyBase();
    s.credits[0] = 500_000;
    const barracks = s.entities.find((e) => e.kind === "barracks" && e.owner === 0)!;
    for (let i = 0; i < MAX_PRODUCTION_QUEUE; i++) {
      startProduce(s, barracks.id, "infantry");
    }
    const events = startProduce(s, barracks.id, "infantry");
    expect(events).toEqual([{ type: "commandRejected", reason: "production queue full" }]);
  });

  it("rejects when credits are insufficient", () => {
    const s = readyBase();
    s.credits[0] = 0;
    const barracks = s.entities.find((e) => e.kind === "barracks" && e.owner === 0)!;
    const events = startProduce(s, barracks.id, "infantry");
    expect(events).toEqual([{ type: "commandRejected", reason: "insufficient credits" }]);
  });

  it("rejects when power is in deficit", () => {
    const s = readyBase();
    const barracks = s.entities.find((e) => e.kind === "barracks" && e.owner === 0)!;
    const powers = s.entities.filter((e) => e.kind === "power" && e.owner === 0);
    for (const p of powers) { p.hp = 0; }
    const events = startProduce(s, barracks.id, "infantry");
    expect(events).toEqual([{ type: "commandRejected", reason: "power shortage" }]);
  });
});

describe("startProduce queue behavior", () => {
  it("shares the Barracks queue across buildings of the same type", () => {
    const s = readyBase();
    const barracks = s.entities.find((e) => e.kind === "barracks" && e.owner === 0)!;
    const otherBarracks = addBuilding(s, 0, "barracks", 5, 10);
    startProduce(s, barracks.id, "infantry");
    expect(s.productionQueues?.[0]?.barracks?.producing).toEqual({ kind: "infantry", remaining: UNIT_STATS.infantry.buildTicks });
    startProduce(s, otherBarracks.id, "antiArmor");
    expect(s.productionQueues?.[0]?.barracks?.queue).toContain("antiArmor");
  });

  it("initializes the shared queue when no local queue exists", () => {
    const s = readyBase();
    const barracks = s.entities.find((e) => e.kind === "barracks" && e.owner === 0)!;
    delete (barracks as { queue?: unknown }).queue;
    startProduce(s, barracks.id, "infantry");
    expect(s.productionQueues?.[0]?.barracks?.queue).toEqual([]);
  });
});

describe("cancelProduce", () => {
  it("cancels a queued unit and refunds credits", () => {
    const s = readyBase();
    const barracks = s.entities.find((e) => e.kind === "barracks" && e.owner === 0)!;
    startProduce(s, barracks.id, "infantry");
    startProduce(s, barracks.id, "antiArmor");
    const creditsBefore = s.credits[0];
    const events = cancelProduce(s, "antiArmor");
    expect(events).toEqual([]);
    expect(s.credits[0]).toBe(creditsBefore + UNIT_STATS.antiArmor.cost);
    expect(s.productionQueues?.[0]?.barracks?.queue).not.toContain("antiArmor");
  });

  it("cancels active production and promotes next in queue", () => {
    const s = readyBase();
    const barracks = s.entities.find((e) => e.kind === "barracks" && e.owner === 0)!;
    startProduce(s, barracks.id, "infantry");
    startProduce(s, barracks.id, "antiArmor");
    const creditsBefore = s.credits[0];
    cancelProduce(s, "infantry");
    expect(s.productionQueues?.[0]?.barracks?.producing?.kind).toBe("antiArmor");
    expect(s.credits[0]).toBe(creditsBefore + UNIT_STATS.infantry.cost);
  });

  it("clears producing when last in-queue unit is cancelled", () => {
    const s = readyBase();
    const barracks = s.entities.find((e) => e.kind === "barracks" && e.owner === 0)!;
    startProduce(s, barracks.id, "infantry");
    cancelProduce(s, "infantry");
    expect(s.productionQueues?.[0]?.barracks?.producing).toBeUndefined();
  });

  it("returns early when no building is producing the unit", () => {
    const s = readyBase();
    const creditsBefore = s.credits[0];
    const events = cancelProduce(s, "tank");
    expect(events).toEqual([]);
    expect(s.credits[0]).toBe(creditsBefore);
  });

  it("cancels shared jobs independently of producer building state", () => {
    const s = readyBase();
    const barracks = s.entities.find((e) => e.kind === "barracks" && e.owner === 0)!;
    startProduce(s, barracks.id, "infantry");
    const creditsBefore = s.credits[0];
    const deadBarracks = addBuilding(s, 0, "barracks", 5, 8);
    deadBarracks.hp = 0;
    const events = cancelProduce(s, "infantry");
    expect(events).toEqual([]);
    expect(s.productionQueues?.[0]?.barracks?.producing).toBeUndefined();
    expect(s.credits[0]).toBe(creditsBefore + UNIT_STATS.infantry.cost);
    expect(deadBarracks.hp).toBe(0);
  });

  it("leaves an empty shared queue unchanged when no job matches", () => {
    const s = readyBase();
    const events = cancelProduce(s, "infantry");
    expect(events).toEqual([]);
    expect(s.productionQueues?.[0]?.barracks).toEqual({ queue: [] });
  });
});
