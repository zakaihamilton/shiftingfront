import { describe, expect, it } from "vitest";
import { BUILDING_STATS } from "../../lib/catalog";
import { makeFixture, addUnit, addBuilding, setTile, TILE_BLOCKED, TILE_RESOURCE } from "../../lib/sim/fixtures";
import { issue, tick } from "../../lib/sim/api";
import { tutorialBuildTile, tutorialMoveTile } from "../../lib/sim/tutorial";
import type { SimState } from "../../lib/types";

function makePlayingState(): SimState {
  const s = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
  addBuilding(s, 0, "constructionYard", 2, 2);
  addBuilding(s, 0, "power", 5, 2);
  addBuilding(s, 0, "refinery", 2, 5);
  addBuilding(s, 0, "barracks", 5, 8);
  addUnit(s, 0, "harvester", 5, 5);
  addUnit(s, 0, "infantry", 6, 2);
  addUnit(s, 0, "tank", 7, 2);
  addBuilding(s, 1, "constructionYard", 15, 15);
  addUnit(s, 1, "infantry", 14, 14);
  return s;
}

describe("issue command dispatch", () => {
  it("returns empty events when state is not playing", () => {
    const s = makePlayingState();
    s.result = "won";
    const events = issue(s, { type: "move", unitIds: [3], x: 10, y: 10 });
    expect(events).toEqual([]);
  });

  it("issues a stop command that clears unit orders", () => {
    const s = makePlayingState();
    const unit = s.entities.find((e) => e.kind === "infantry" && e.owner === 0)!;
    issue(s, { type: "move", unitIds: [unit.id], x: 15, y: 15 });
    expect(unit.path.length).toBeGreaterThan(0);
    issue(s, { type: "stop", unitIds: [unit.id] });
    expect(unit.path).toEqual([]);
    expect(unit.attackTarget).toBeUndefined();
    expect(unit.orderMode).toBeUndefined();
    expect(unit.idle).toBe(true);
  });

  it("skips non-unit entities in stop command", () => {
    const s = makePlayingState();
    const building = s.entities.find((e) => e.kind === "constructionYard")!;
    const events = issue(s, { type: "stop", unitIds: [building.id] });
    expect(events).toEqual([]);
  });

  it("skips enemy entities in stop command", () => {
    const s = makePlayingState();
    const enemy = s.entities.find((e) => e.owner === 1 && e.kind === "infantry")!;
    const events = issue(s, { type: "stop", unitIds: [enemy.id] });
    expect(events).toEqual([]);
  });

  it("issues a stance command", () => {
    const s = makePlayingState();
    const unit = s.entities.find((e) => e.kind === "infantry" && e.owner === 0)!;
    const events = issue(s, { type: "stance", unitIds: [unit.id], stance: "defensive" });
    expect(events).toEqual([]);
    expect(unit.stance).toBe("defensive");
  });

  it("issues a formation command", () => {
    const s = makePlayingState();
    const unit = s.entities.find((e) => e.kind === "infantry" && e.owner === 0)!;
    const events = issue(s, { type: "formation", unitIds: [unit.id], formation: "column" });
    expect(events).toEqual([]);
    expect(unit.formation).toBe("column");
  });

  it("handles unknown command type gracefully", () => {
    const s = makePlayingState();
    const events = issue(s, { type: "unknown" } as unknown as Parameters<typeof issue>[1]);
    expect(events).toEqual([]);
  });
});

describe("tutorial coaching", () => {
  it("keeps commands valid before their lesson stage without advancing it", () => {
    const s = makePlayingState();
    s.tutorialStage = "select";
    const events = issue(s, { type: "build", building: "power", x: 8, y: 8 });
    expect(events).not.toContainEqual({ type: "commandRejected", reason: expect.stringContaining("training step") });
    expect(s.tutorialStage).toBe("select");
  });

  it("keeps movement valid during the select stage", () => {
    const s = makePlayingState();
    s.tutorialStage = "select";
    const unit = s.entities.find((e) => e.kind === "infantry" && e.owner === 0)!;
    const events = issue(s, { type: "move", unitIds: [unit.id], x: 10, y: 10 });
    expect(events).not.toContainEqual({ type: "commandRejected", reason: expect.stringContaining("training step") });
    expect(s.tutorialStage).toBe("select");
  });

  it("advances tutorial stage after successful move", () => {
    const s = makePlayingState();
    s.tutorialStage = "move";
    const unit = s.entities.find((e) => e.kind === "infantry" && e.owner === 0)!;
    const target = tutorialMoveTile(s)!;
    issue(s, { type: "move", unitIds: [unit.id], x: target.x, y: target.y });
    expect(s.tutorialStage).toBe("build");
  });

  it("waits for the Power Plant to finish before advancing to produce", () => {
    const s = makePlayingState();
    s.tutorialStage = "build";
    const target = tutorialBuildTile(s)!;
    const events = issue(s, { type: "build", building: "power", x: target.x, y: target.y });
    expect(events).not.toContainEqual({ type: "commandRejected", reason: expect.any(String) });
    expect(s.tutorialStage).toBe("build");
    expect(s.tutorialBuildId).toBeDefined();
    for (let i = 0; i < BUILDING_STATS.power.buildTicks - 1; i++) {
      tick(s, undefined, { collectEvents: false });
      expect(s.tutorialStage).toBe("build");
    }
    tick(s, undefined, { collectEvents: false });
    expect(s.tutorialStage).toBe("produce");
  });

  it("advances from produce to attack", () => {
    const s = makePlayingState();
    s.tutorialStage = "produce";
    const barracks = s.entities.find((e) => e.kind === "barracks" && e.owner === 0);
    expect(barracks).toBeDefined();
    issue(s, { type: "produce", fromId: barracks!.id, unit: "infantry" });
    expect(s.tutorialStage).toBe("attack");
  });

  it("keeps the attack lesson open until the target is destroyed", () => {
    const s = makePlayingState();
    s.tutorialStage = "attack";
    const enemy = s.entities.find((e) => e.owner === 1 && e.kind === "infantry")!;
    const unit = s.entities.find((e) => e.kind === "tank" && e.owner === 0)!;
    issue(s, { type: "attack", unitIds: [unit.id], targetId: enemy.id });
    expect(s.tutorialStage).toBe("attack");
  });

  it("does not advance when command is rejected", () => {
    const s = makePlayingState();
    s.tutorialStage = "build";
    const events = issue(s, { type: "build", building: "constructionYard", x: 8, y: 8 });
    expect(events).toContainEqual({ type: "commandRejected", reason: "invalid building" });
    expect(s.tutorialStage).toBe("build");
  });

  it("does not advance for non-matching command types", () => {
    const s = makePlayingState();
    s.tutorialStage = "build";
    const unit = s.entities.find((e) => e.kind === "infantry" && e.owner === 0)!;
    issue(s, { type: "move", unitIds: [unit.id], x: 10, y: 10 });
    expect(s.tutorialStage).toBe("build");
  });
});

describe("groundOrders", () => {
  it("sends harvesters to resource tiles and others to move", () => {
    const s = makePlayingState();
    setTile(s, 10, 10, TILE_RESOURCE, 100);
    const harvester = s.entities.find((e) => e.kind === "harvester" && e.owner === 0)!;
    issue(s, { type: "harvest", unitIds: [harvester.id], x: 10, y: 10 });
    expect(harvester.gatherX).toBe(10);
    expect(harvester.gatherY).toBe(10);
  });
});

describe("production rally points", () => {
  it("assigns and replaces a rally point on a friendly completed producer", () => {
    const s = makePlayingState();
    const barracks = s.entities.find((e) => e.kind === "barracks" && e.owner === 0)!;

    expect(issue(s, { type: "rally", buildingId: barracks.id, x: 10, y: 10 })).toEqual([]);
    expect(barracks.rallyPoint).toEqual({ x: 10, y: 10 });
    expect(issue(s, { type: "rally", buildingId: barracks.id, x: 12, y: 11 })).toEqual([]);
    expect(barracks.rallyPoint).toEqual({ x: 12, y: 11 });
  });

  it("rejects invalid owners, buildings, construction, and ground targets without replacing the point", () => {
    const s = makePlayingState();
    const barracks = s.entities.find((e) => e.kind === "barracks" && e.owner === 0)!;
    barracks.rallyPoint = { x: 10, y: 10 };
    const enemy = s.entities.find((e) => e.owner === 1 && e.class === "building")!;
    const power = s.entities.find((e) => e.kind === "power" && e.owner === 0)!;
    const unfinished = addBuilding(s, 0, "factory", 10, 2, 10);
    const destroyed = addBuilding(s, 0, "barracks", 12, 2);
    destroyed.hp = 0;
    setTile(s, 11, 11, TILE_BLOCKED);

    expect(issue(s, { type: "rally", buildingId: enemy.id, x: 12, y: 12 })).toContainEqual({ type: "commandRejected", reason: "rally unavailable" });
    expect(issue(s, { type: "rally", buildingId: power.id, x: 12, y: 12 })).toContainEqual({ type: "commandRejected", reason: "rally unavailable" });
    expect(issue(s, { type: "rally", buildingId: unfinished.id, x: 12, y: 12 })).toContainEqual({ type: "commandRejected", reason: "rally unavailable" });
    expect(issue(s, { type: "rally", buildingId: destroyed.id, x: 12, y: 12 })).toContainEqual({ type: "commandRejected", reason: "rally unavailable" });
    expect(issue(s, { type: "rally", buildingId: barracks.id, x: 11, y: 11 })).toContainEqual({ type: "commandRejected", reason: "invalid rally target" });
    expect(issue(s, { type: "rally", buildingId: barracks.id, x: -1, y: 2 })).toContainEqual({ type: "commandRejected", reason: "invalid rally target" });
    expect(barracks.rallyPoint).toEqual({ x: 10, y: 10 });
  });
});
