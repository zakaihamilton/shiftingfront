import { describe, expect, it } from "vitest";
import { MAX_MISSION_TICKS } from "../../lib/gen/pacing";
import { createMission, tick } from "../../lib/sim/api";
import { CompetentCommander } from "../../lib/sim/commander";

const IS_COVERAGE = Boolean(process.env.NODE_V8_COVERAGE || process.env.VITEST_COVERAGE);

function runGeneratedMission(seed: number, missionIndex: number) {
  const state = createMission({ seed, missionIndex });
  const commander = new CompetentCommander();
  const horizon = state.runtime?.deadline ?? state.win.ticks ?? MAX_MISSION_TICKS;
  for (let i = 0; i < horizon && state.result === "playing"; i++) {
    tick(state, commander.plan(state));
  }
  return state;
}

describe("competent commander generated objectives", () => {
  it.skipIf(IS_COVERAGE).each([
    [2, 0, "structureQuota"],
    [0, 2, "escort"],
    [0, 1, "extraction"],
  ] as const)(
    "completes generated %s/%s (%s) objectives with deterministic command execution",
    (seed, missionIndex, kind) => {
      const state = runGeneratedMission(seed, missionIndex);

      expect(state.missionKind).toBe(kind);
      expect(state.result).toBe("won");
    },
    120_000,
  );
});
