import { describe, expect, it } from "vitest";
import { createMission } from "../../../lib/sim/api";
import { ArchetypeCommander } from "../../../lib/sim/commander/archetypes";
import { simulationFingerprint } from "../../../lib/sim/replay";
import { createScenarioRunner } from "../../../lib/sim/scenarioRunner";
import { withoutFog } from "./helpers";

describe("headless balance reference transitions", () => {
  it("match the event-producing reference state transitions", () => {
    const reference = createMission({ seed: 7, missionIndex: 3 });
    const headless = structuredClone(reference);
    const referenceCommander = new ArchetypeCommander("rush");
    const headlessCommander = new ArchetypeCommander("rush");
    const referenceRunner = createScenarioRunner(reference);
    const headlessRunner = createScenarioRunner(headless, { collectEvents: false, updateFog: false });

    for (let i = 0; i < 240 && reference.result === "playing"; i += 1) {
      const referenceCommands = referenceCommander.plan(reference);
      const headlessCommands = headlessCommander.plan(headless);
      expect(headlessCommands).toEqual(referenceCommands);

      referenceRunner.step(referenceCommands);
      headlessRunner.step(headlessCommands);
      expect(simulationFingerprint(headless)).toBe(simulationFingerprint(reference));
    }
    expect(withoutFog(headless)).toEqual(withoutFog(reference));
  });
});
