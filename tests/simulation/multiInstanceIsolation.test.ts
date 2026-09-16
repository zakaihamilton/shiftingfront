import { describe, expect, it } from "vitest";
import { createMission, issue, tick } from "../../lib/sim/api";
import { simulationFingerprint } from "../../lib/sim/replay";

describe("multi-instance simulation isolation", () => {
  it("produces identical deterministic fingerprints whether run in isolation or interleaved concurrently", () => {
    const runSimScenario = (seed: number, missionIndex: number, moveTarget: { x: number; y: number }) => {
      const state = createMission({ seed, missionIndex });
      const mover = state.entities.find((e) => e.owner === 0 && e.class === "unit");
      if (mover) {
        issue(state, { type: "move", unitIds: [mover.id], x: moveTarget.x, y: moveTarget.y });
      }
      for (let t = 0; t < 60; t++) {
        tick(state);
      }
      return simulationFingerprint(state);
    };

    // 1. Run in isolation
    const isolatedFingerprint1 = runSimScenario(1001, 0, { x: 20, y: 20 });
    const isolatedFingerprint2 = runSimScenario(2002, 1, { x: 30, y: 15 });

    // 2. Run interleaved concurrently tick-by-tick
    const state1 = createMission({ seed: 1001, missionIndex: 0 });
    const state2 = createMission({ seed: 2002, missionIndex: 1 });

    const mover1 = state1.entities.find((e) => e.owner === 0 && e.class === "unit");
    if (mover1) {
      issue(state1, { type: "move", unitIds: [mover1.id], x: 20, y: 20 });
    }
    const mover2 = state2.entities.find((e) => e.owner === 0 && e.class === "unit");
    if (mover2) {
      issue(state2, { type: "move", unitIds: [mover2.id], x: 30, y: 15 });
    }

    for (let t = 0; t < 60; t++) {
      tick(state1);
      tick(state2);
    }

    const interleavedFingerprint1 = simulationFingerprint(state1);
    const interleavedFingerprint2 = simulationFingerprint(state2);

    expect(interleavedFingerprint1).toBe(isolatedFingerprint1);
    expect(interleavedFingerprint2).toBe(isolatedFingerprint2);
  });
});
