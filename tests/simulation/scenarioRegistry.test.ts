import { describe, expect, it } from "vitest";
import { createCampaign } from "../../lib/gen/campaign";
import { createMission } from "../../lib/sim/api";
import { SCENARIO_DEFINITIONS, scenarioDefinitionFor } from "../../lib/sim/scenarios";
import type { MissionKind } from "../../lib/types";

const ALL_MISSION_KINDS: MissionKind[] = [
  "harvestQuota", "forceQuota", "structureQuota", "destroyMarked", "razeAll", "decapitate",
  "annihilate", "holdTheLine", "escort", "sabotage", "rescue", "extraction",
];

describe("scenario registry", () => {
  it("covers every mission kind with a complete contract", () => {
    expect(Object.keys(SCENARIO_DEFINITIONS).sort()).toEqual([...ALL_MISSION_KINDS].sort());
    for (const kind of ALL_MISSION_KINDS) {
      const definition = scenarioDefinitionFor(kind);
      expect(definition.kind).toBe(kind);
      expect(definition.presentation.label).toBeTruthy();
      expect(definition.presentation.targetLabel).toBeTruthy();
      expect(definition.setup).toEqual(expect.any(Function));
      expect(definition.tick).toEqual(expect.any(Function));
      expect(definition.progress).toEqual(expect.any(Function));
      expect(definition.isComplete).toEqual(expect.any(Function));
      expect(definition.targetLost).toEqual(expect.any(Function));
      expect(definition.deadline).toEqual(expect.any(Function));
    }
  });

  it("keeps scenario setup deterministic for every generated mission", () => {
    const first = createCampaign(421).missions.map((mission) => createMission({ seed: 421, missionIndex: mission.index }));
    const second = createCampaign(421).missions.map((mission) => createMission({ seed: 421, missionIndex: mission.index }));
    expect(first.map((state) => ({ kind: state.win.kind, runtime: state.runtime }))).toEqual(
      second.map((state) => ({ kind: state.win.kind, runtime: state.runtime })),
    );
  });

  it("places destroyMarked targets as factories or objective buildings", () => {
    for (let seed = 0; seed < 40; seed++) {
      const campaign = createCampaign(seed);
      for (const mission of campaign.missions) {
        if (mission.win.kind !== "destroyMarked") continue;
        const state = createMission({ seed, missionIndex: mission.index });
        const targets = state.runtime?.targetIds ?? [];
        expect(targets.length).toBeGreaterThan(0);
        for (const id of targets) {
          const entity = state.entities.find((candidate) => candidate.id === id);
          expect(entity?.class).toBe("building");
          expect(["factory", "objective"]).toContain(entity?.kind);
        }
      }
    }
  });
});
