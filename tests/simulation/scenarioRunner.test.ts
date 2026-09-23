import { describe, expect, it } from "vitest";
import { createMission, tick } from "../../lib/sim/api";
import { simulationFingerprint } from "../../lib/sim/replay";
import { createScenarioRunner } from "../../lib/sim/scenarioRunner";

describe("scenario runner", () => {
  it("steps through the same simulation transition as tick", () => {
    const reference = createMission({ seed: 421, missionIndex: 0 });
    const stepped = createMission({ seed: 421, missionIndex: 0 });
    const referenceUnit = reference.entities.find((entity) => entity.owner === 0 && entity.class === "unit");
    const steppedUnit = stepped.entities.find((entity) => entity.owner === 0 && entity.class === "unit");
    expect(referenceUnit).toBeDefined();
    expect(steppedUnit).toBeDefined();
    const referenceResult = tick(reference, [{ type: "stop", unitIds: [referenceUnit!.id] }]);
    const runner = createScenarioRunner(stepped);
    const runnerResult = runner.step([{ type: "stop", unitIds: [steppedUnit!.id] }]);

    expect(runnerResult.events).toEqual(referenceResult.events);
    expect(runnerResult.commandRejections).toBe(referenceResult.commandRejections);
    expect(simulationFingerprint(runner.state)).toBe(simulationFingerprint(reference));
  });

  it("runs the requested ticks immediately in command and observer order", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const runner = createScenarioRunner(state, { collectEvents: false, updateFog: false });
    const order: string[] = [];
    const result = runner.run({
      maxTicks: 3,
      beforeTick: (currentState) => order.push(`before:${currentState.tick}`),
      commandsForTick: (currentState) => {
        order.push(`commands:${currentState.tick}`);
        return undefined;
      },
      onCommands: (currentState) => order.push(`issued:${currentState.tick}`),
      onTick: (currentState) => order.push(`after:${currentState.tick}`),
    });

    expect(result).toEqual({ state, ticksRun: 3, stopReason: "tickLimit" });
    expect(state.tick).toBe(3);
    expect(order).toEqual([
      "before:0", "commands:0", "issued:0", "after:1",
      "before:1", "commands:1", "issued:1", "after:2",
      "before:2", "commands:2", "issued:2", "after:3",
    ]);
  });

  it("stops when the scenario becomes terminal", () => {
    const state = createMission({ seed: 0, missionIndex: 0 });
    const runner = createScenarioRunner(state);
    let commandCalls = 0;
    const result = runner.run({
      maxTicks: 5_000,
      commandsForTick: (currentState) => {
        if (currentState.tick !== 0) return undefined;
        commandCalls += 1;
        return [{ type: "build", building: "constructionYard", x: 0, y: 0 }];
      },
    });

    expect(result.stopReason).toBe("terminal");
    expect(result.ticksRun).toBeGreaterThan(1);
    expect(state.result).toBe("lost");
    expect(commandCalls).toBe(1);
  });

  it("runs beforeTick before issuing a command and does not advance if it throws", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const runner = createScenarioRunner(state);
    let commandCalls = 0;

    expect(() => runner.run({
      maxTicks: 1,
      beforeTick: () => { throw new Error("deadline"); },
      commandsForTick: () => {
        commandCalls += 1;
        return undefined;
      },
    })).toThrow("deadline");
    expect(state.tick).toBe(0);
    expect(commandCalls).toBe(0);
  });
});
