import { describe, expect, it } from "vitest";
import { ArchetypeCommander } from "../../../lib/sim/commander/archetypes";
import { stratifiedBalanceScenarios } from "../../../lib/sim/balance";
import { simulationFingerprint } from "../../../lib/sim/replay";
import { createScenarioRunner } from "../../../lib/sim/scenarioRunner";
import { missionFactory } from "./helpers";

describe("headless balance mission kinds", () => {
  it("match reference transitions for every mission kind and strategy", () => {
    const scenarios = stratifiedBalanceScenarios(0, 39, 1);

    for (const { seed, mission } of scenarios) {
      const strategies = ["rush", "turtle", "greed", "infantry", "vehicles"] as const;
      const createScenario = missionFactory(seed, mission);
      for (const strategy of strategies) {
        const reference = createScenario();
        const headless = structuredClone(reference);
        const referenceCommander = new ArchetypeCommander(strategy);
        const headlessCommander = new ArchetypeCommander(strategy);
        const referenceRunner = createScenarioRunner(reference);
        const headlessRunner = createScenarioRunner(headless, { collectEvents: false, updateFog: false });

        for (let i = 0; i < 180 && reference.result === "playing"; i += 1) {
          const referenceCommands = referenceCommander.plan(reference);
          const headlessCommands = headlessCommander.plan(headless);
          expect(headlessCommands).toEqual(referenceCommands);

          const referenceTick = referenceRunner.step(referenceCommands);
          const headlessTick = headlessRunner.step(headlessCommands);
          expect(headlessTick.commandRejections).toBe(referenceTick.commandRejections);
          expect(simulationFingerprint(headless)).toBe(simulationFingerprint(reference));
        }
      }
    }
  }, 120_000);
});
