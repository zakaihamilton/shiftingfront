import { describe, expect, it } from "vitest";
import { createMission } from "../../lib/sim/api";
import { runReplay, simulationFingerprint } from "../../lib/sim/replay";

describe("simulation replay", () => {
  it("applies scheduled orders at their simulation tick", () => {
    const mission = createMission({ seed: 421, missionIndex: 0 });
    const unit = mission.entities.find((entity) => entity.owner === 0 && entity.class === "unit" && !entity.neutral);
    expect(unit).toBeDefined();

    const result = runReplay({
      seed: 421,
      missionIndex: 0,
      maxTicks: 6,
      orders: [{ tick: 2, command: { type: "stop", unitIds: [unit!.id] } }],
    });

    expect(result.state.tick).toBe(6);
    expect(result.terminalResult).toBe("playing");
    expect(result.commandRejections).toBe(0);
    expect(result.inspect.tick).toBe(6);
  });

  it("is deterministic and ignores fog-only differences", () => {
    const first = runReplay({ seed: 421, missionIndex: 0, maxTicks: 120 });
    const second = runReplay({ seed: 421, missionIndex: 0, maxTicks: 120 });
    second.state.fog = second.state.fog.map(() => 2);
    second.state.entities = [...second.state.entities].reverse();

    expect(first.fingerprint).toBe(simulationFingerprint(second.state));
    expect(first.fingerprint).toBe(runReplay({ seed: 421, missionIndex: 0, maxTicks: 120 }).fingerprint);
    expect(first.inspect).toEqual(second.inspect);
    expect(first.events).toEqual(second.events);
  });

  it("changes when mutable terrain changes after an earlier fingerprint", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const before = simulationFingerprint(state);
    state.tiles[0] = state.tiles[0] === 0 ? 1 : 0;

    expect(simulationFingerprint(state)).not.toBe(before);
  });

  it("excludes control-group membership from the simulation fingerprint", () => {
    const first = createMission({ seed: 421, missionIndex: 0 });
    const second = createMission({ seed: 421, missionIndex: 0 });
    const unit = first.entities.find((entity) => entity.owner === 0 && entity.class === "unit");
    expect(unit).toBeDefined();
    first.controlGroups = { 1: [unit!.id] };

    expect(simulationFingerprint(first)).toBe(simulationFingerprint(second));
  });

  it("reports terminal loss, scheduled rejection, and the emitted events", () => {
    const result = runReplay({
      seed: 0,
      missionIndex: 0,
      maxTicks: 5_000,
      orders: [{
        tick: 0,
        command: { type: "build", building: "constructionYard", x: 0, y: 0 },
      }],
    });

    expect(result.terminalResult).toBe("lost");
    expect(result.inspect.result).toBe("lost");
    expect(result.commandRejections).toBe(1);
    expect(result.events).toContainEqual({ type: "commandRejected", reason: "invalid building" });
    expect(result.events).toContainEqual({ type: "lost" });
  }, 30_000);
});
