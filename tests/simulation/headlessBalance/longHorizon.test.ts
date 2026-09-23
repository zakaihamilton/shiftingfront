import { describe, expect, it } from "vitest";
import { createMission } from "../../../lib/sim/api";
import { ArchetypeCommander } from "../../../lib/sim/commander/archetypes";
import { simulationFingerprint } from "../../../lib/sim/replay";
import { createScenarioRunner } from "../../../lib/sim/scenarioRunner";

describe("headless balance long horizons", () => {
  it("match long-running reference transitions", () => {
    for (const strategy of ["rush", "turtle", "greed", "infantry", "vehicles"] as const) {
      const reference = createMission({ seed: 421, missionIndex: 5 });
      const headless = structuredClone(reference);
      const referenceCommander = new ArchetypeCommander(strategy);
      const headlessCommander = new ArchetypeCommander(strategy);
      const referenceRunner = createScenarioRunner(reference);
      const headlessRunner = createScenarioRunner(headless, { collectEvents: false, updateFog: false });

      for (let i = 0; i < 1_200 && reference.result === "playing"; i += 1) {
        const referenceCommands = referenceCommander.plan(reference);
        const headlessCommands = headlessCommander.plan(headless);
        expect(headlessCommands).toEqual(referenceCommands);
        const referenceTick = referenceRunner.step(referenceCommands);
        const headlessTick = headlessRunner.step(headlessCommands);
        expect(headlessTick.commandRejections).toBe(referenceTick.commandRejections);
        expect(simulationFingerprint(headless)).toBe(simulationFingerprint(reference));
      }
    }
  }, 120_000);
});
