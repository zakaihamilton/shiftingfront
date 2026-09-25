import { describe, expect, it } from "vitest";
import { createMission, tick } from "../../lib/sim/api";
import {
  createSimulationTickContext,
  runSimulationSystems,
  SIMULATION_SYSTEMS,
  type SimulationSystem,
} from "../../lib/sim/pipeline";

describe("simulation pipeline", () => {
  it("declares the behavior-preserving system order", () => {
    expect(SIMULATION_SYSTEMS.map((system) => system.id)).toEqual([
      "production",
      "economy",
      "movement",
      "combat",
      "tutorial",
      "repair",
      "support",
      "director",
      "ai",
      "fog",
      "clock",
      "scenario",
      "objectives",
      "cleanup",
    ]);
  });

  it("runs systems through a shared context and preserves event order", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const events = [] as ReturnType<typeof createSimulationTickContext>["events"];
    const order: string[] = [];
    const systems: SimulationSystem[] = [
      { id: "production", run: ({ emit }) => { order.push("production"); emit([{ type: "alert", kind: "objective", text: "first" }]); } },
      { id: "economy", run: ({ emit }) => { order.push("economy"); emit([{ type: "alert", kind: "objective", text: "second" }]); } },
      { id: "cleanup", run: () => { order.push("cleanup"); } },
    ];

    runSimulationSystems(createSimulationTickContext(state, events, {}), systems);

    expect(order).toEqual(["production", "economy", "cleanup"]);
    expect(events).toEqual([
      { type: "alert", kind: "objective", text: "first" },
      { type: "alert", kind: "objective", text: "second" },
    ]);
  });

  it("keeps command rejection counts and headless options compatible", () => {
    const state = createMission({ seed: 0, missionIndex: 5 });
    const result = tick(state, [{ type: "build", building: "constructionYard", x: 0, y: 0 }]);
    expect(result.commandRejections).toBe(1);
    expect(result.events).toContainEqual({ type: "commandRejected", reason: "invalid building" });

    const headless = createMission({ seed: 421, missionIndex: 0 });
    const headlessResult = tick(headless, undefined, { collectEvents: false, updateFog: false, evaluateObjectives: false });
    expect(headlessResult.events).toEqual([]);
    expect(headless.tick).toBe(1);
  });

  it("does not duplicate events when a system returns the shared event sink", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const events = [] as ReturnType<typeof createSimulationTickContext>["events"];
    const context = createSimulationTickContext(state, events, {});
    // Simulate a system pushing directly to context.events and then calling emit(context.events)
    events!.push({ type: "alert", kind: "objective", text: "single" });
    context.emit(events);
    expect(events).toHaveLength(1);
    expect(events![0]).toEqual({ type: "alert", kind: "objective", text: "single" });
  });
});
