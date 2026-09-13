import { describe, expect, it } from "vitest";
import { createMission, inspect, tick } from "../../lib/sim/api";
import { ARCHETYPE_STRATEGIES, ArchetypeCommander } from "../../lib/sim/commander/archetypes";
import { hasNonFiniteState } from "../../lib/sim/balance";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import type { Command, Entity, MissionKind, SimState } from "../../lib/types";

describe("player archetype commanders", () => {
  it.each(ARCHETYPE_STRATEGIES)("uses the public command API for %s", (strategy) => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const commander = new ArchetypeCommander(strategy);
    let commandCount = 0;
    let rejections = 0;
    for (let i = 0; i < 480 && state.result === "playing"; i++) {
      const commands = commander.plan(state);
      commandCount += commands.length;
      const result = tick(state, commands);
      rejections += result.events.filter((event) => event.type === "commandRejected").length;
    }
    expect(commandCount).toBeGreaterThan(0);
    expect(rejections).toBe(0);
  });

  it("keeps production signatures distinct", () => {
    const infantry = createMission({ seed: 0, missionIndex: 0 });
    const vehicles = createMission({ seed: 0, missionIndex: 0 });
    const infantryCommander = new ArchetypeCommander("infantry");
    const vehiclesCommander = new ArchetypeCommander("vehicles");
    for (let i = 0; i < 1_200 && infantry.result === "playing"; i++) tick(infantry, infantryCommander.plan(infantry));
    for (let i = 0; i < 1_200 && vehicles.result === "playing"; i++) tick(vehicles, vehiclesCommander.plan(vehicles));
    expect(infantry.unitsProducedByRole.infantry + infantry.unitsProducedByRole.antiArmor)
      .toBeGreaterThan(vehicles.unitsProducedByRole.tank);
    expect(vehicles.unitsProducedByRole.tank).toBeGreaterThan(infantry.unitsProducedByRole.tank);
  });

  it("makes greed establish harvest capacity before barracks production", () => {
    const state = createMission({ seed: 0, missionIndex: 0 });
    const commander = new ArchetypeCommander("greed");
    for (let i = 0; i < 1_200 && state.result === "playing"; i++) tick(state, commander.plan(state));
    expect(state.unitsProducedByRole.harvester).toBeGreaterThan(0);
  });

  function turtleCommitPlan(kind: MissionKind, placeTarget: (state: SimState) => Entity) {
    const state = makeFixture({ width: 28, height: 28, win: { kind, ticks: 3600 } });
    const yard = addBuilding(state, 0, "constructionYard", 2, 2);
    const infantry = addUnit(state, 0, "infantry", 4, 4);
    const target = placeTarget(state);
    state.win.targetIds = [target.id];
    state.runtime = {
      kind,
      phase: "active",
      targetIds: [target.id],
      rescued: 0,
      required: 1,
      deadline: 3600,
      secondary: [],
    };
    state.tick = 3240;
    return { yard, infantry, target, commands: new ArchetypeCommander("turtle").plan(state) };
  }

  function combatOrder(commands: Command[]) {
    return commands.find((command) => command.type === "move" || command.type === "attackMove" || command.type === "attack");
  }

  it("holds turtle combat at the yard on rescue after the late-commit tick", () => {
    const { yard, infantry, target, commands } = turtleCommitPlan("rescue", (state) => {
      const stranded = addUnit(state, 0, "infantry", 24, 24);
      stranded.neutral = true;
      stranded.scenarioRole = "stranded";
      return stranded;
    });
    expect(combatOrder(commands)).toEqual({
      type: "move",
      unitIds: [infantry.id],
      x: yard.x,
      y: yard.y,
      formation: "line",
    });
    expect(commands.some((command) =>
      (command.type === "move" || command.type === "attackMove") &&
      command.x === target.x &&
      command.y === target.y,
    )).toBe(false);
  });

  it("late-counterattacks turtle combat on offensive missions after commit", () => {
    const { infantry, target, commands } = turtleCommitPlan("destroyMarked", (state) => (
      addBuilding(state, 1, "power", 24, 24, 0, true)
    ));
    expect(combatOrder(commands)).toEqual({
      type: "attackMove",
      unitIds: [infantry.id],
      x: target.x,
      y: target.y,
      formation: "line",
    });
  });

  it("makes turtle repair its highest-priority damaged building", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const yard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard");
    expect(yard).toBeDefined();
    yard!.hp -= 100;
    const commander = new ArchetypeCommander("turtle");
    const commands = commander.plan(state);
    expect(commands).toContainEqual({ type: "repair", buildingId: yard!.id });
    const beforeRepair = yard!.hp;
    const result = tick(state, commands);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "repairStarted" }));
    expect(yard!.hp).toBeGreaterThan(beforeRepair);
  });

  it("detects non-finite values in nested state fields", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    expect(hasNonFiniteState(state)).toBe(false);
    state.heights[0] = Number.NaN;
    expect(hasNonFiniteState(state)).toBe(true);
    state.heights[0] = 1;
    state.entities[0]!.orderDestination = { x: Number.POSITIVE_INFINITY, y: 1 };
    expect(hasNonFiniteState(state)).toBe(true);
  });

  it("is deterministic for identical seed, mission, and strategy", () => {
    for (const strategy of ARCHETYPE_STRATEGIES) {
      const a = createMission({ seed: 421, missionIndex: 0 });
      const b = createMission({ seed: 421, missionIndex: 0 });
      const commanderA = new ArchetypeCommander(strategy);
      const commanderB = new ArchetypeCommander(strategy);
      for (let i = 0; i < 720 && a.result === "playing"; i++) {
        const commandsA = commanderA.plan(a);
        const commandsB = commanderB.plan(b);
        expect(commandsA).toEqual(commandsB);
        tick(a, commandsA, { collectEvents: false, updateFog: false });
        tick(b, commandsB, { collectEvents: false, updateFog: false });
      }
      expect(inspect(a)).toEqual(inspect(b));
    }
  });
});
