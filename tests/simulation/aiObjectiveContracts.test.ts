import { describe, expect, it } from "vitest";
import type { MissionKind, SimState, WinCategory } from "../../lib/types";
import { createCampaign } from "../../lib/gen/campaign";
import { objectiveContractFor } from "../../lib/gen/profile";
import { missionDifficulty } from "../../lib/sim/difficulty";
import { createMission } from "../../lib/sim/api";
import { tickAi } from "../../lib/sim/ai";
import { shouldAutoRepair } from "../../lib/sim/ai/helpers";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";

function objectiveFixture(kind: MissionKind): SimState {
  const state = makeFixture({
    width: 32,
    height: 32,
    win: { kind } as WinCategory,
  });
  state.missionIndex = 2;
  addBuilding(state, 1, "constructionYard", 4, 4);
  addBuilding(state, 1, "power", 7, 4);
  addBuilding(state, 1, "refinery", 4, 8);
  addBuilding(state, 1, "barracks", 8, 8);
  addBuilding(state, 1, "factory", 8, 12);
  addUnit(state, 1, "harvester", 6, 6);
  return state;
}

function producesAt(kind: MissionKind, offset: number): boolean {
  const state = objectiveFixture(kind);
  state.credits[1] = 5000;
  state.tick = missionDifficulty(state.missionIndex).enemyProductionStart + offset;
  tickAi(state);
  return state.productionQueues?.[1]?.barracks?.producing !== undefined
    || state.productionQueues?.[1]?.factory?.producing !== undefined;
}

describe("objective-specific enemy AI contracts", () => {
  it("repairs only non-target structures for selective-repair objectives", () => {
    const selective = objectiveFixture("destroyMarked");
    const selectiveTarget = addBuilding(selective, 1, "objective", 12, 12, 0, true);
    const selectiveOther = addBuilding(selective, 1, "power", 15, 12);
    selectiveTarget.hp = selectiveTarget.maxHp - 1;
    selectiveOther.hp = selectiveOther.maxHp - 1;

    expect(shouldAutoRepair(selective, selectiveTarget)).toBe(false);
    expect(shouldAutoRepair(selective, selectiveOther)).toBe(true);
    expect(shouldAutoRepair(objectiveFixture("sabotage"), selectiveOther)).toBe(true);
  });

  it.each(["decapitate", "razeAll", "annihilate"] as const)(
    "does not repair structures during %s",
    (kind) => {
      const state = objectiveFixture(kind);
      const building = state.entities.find((entity) => entity.owner === 1 && entity.kind === "power")!;
      expect(shouldAutoRepair(state, building)).toBe(false);
    },
  );

  it("applies objective production cadence instead of the generic cadence", () => {
    const base = missionDifficulty(2).enemyProductionEvery;
    const cadenceFor = (kind: MissionKind) => Math.max(1, Math.round(base * objectiveContractFor(kind)!.productionScale));

    for (const kind of ["destroyMarked", "annihilate", "decapitate"] as const) {
      const cadence = cadenceFor(kind);
      expect(producesAt(kind, cadence - 1), `${kind} before cadence`).toBe(false);
      expect(producesAt(kind, cadence), `${kind} at cadence`).toBe(true);
    }
  });

  it.each(["sabotage", "razeAll", "decapitate", "annihilate"] as const)(
    "stops fresh enemy production during the %s finale",
    (kind) => {
      const state = objectiveFixture(kind);
      state.credits[1] = 5000;
      state.runtime = {
        kind,
        phase: "active",
        targetIds: [],
        rescued: 0,
        required: 1,
        secondary: [],
        director: { phase: "finale", pressureStart: 100, finaleStart: 1000, eventCount: 2 },
      };
      const difficulty = missionDifficulty(state.missionIndex);
      state.tick = difficulty.enemyProductionStart + Math.round(
        difficulty.enemyProductionEvery * objectiveContractFor(kind)!.productionScale,
      );

      tickAi(state);

      expect(state.productionQueues?.[1]?.barracks?.producing).toBeUndefined();
      expect(state.productionQueues?.[1]?.factory?.producing).toBeUndefined();
    },
  );

  it("delays assault waves according to the objective contract", () => {
    const base = missionDifficulty(2).enemyAssaultEvery;
    const cases = [
      ["destroyMarked", base, false],
      ["destroyMarked", base + objectiveContractFor("destroyMarked")!.assaultDelay, true],
      ["annihilate", base, false],
      ["annihilate", base + objectiveContractFor("annihilate")!.assaultDelay, true],
      ["decapitate", base, false],
      ["decapitate", base + objectiveContractFor("decapitate")!.assaultDelay, true],
    ] as const;

    for (const [kind, tick, expectedAssault] of cases) {
      const state = objectiveFixture(kind);
      addBuilding(state, 0, "constructionYard", 26, 26);
      state.tick = tick;
      tickAi(state);
      expect(state.aiState, `${kind} at tick ${tick}`).toBe(expectedAssault ? "assault" : "economy");
    }
  });

  it("skips generic turret and tank support for decapitate openings", () => {
    const kind = "decapitate" as const;
    const seed = Array.from({ length: 100 }, (_, candidateSeed) => candidateSeed).find((candidateSeed) =>
      createCampaign(candidateSeed).missions.some((candidate) => candidate.win.kind === kind),
    );
    const mission = seed === undefined
      ? undefined
      : createCampaign(seed).missions.find((candidate) => candidate.win.kind === kind);
    expect(mission).toBeDefined();

    const state = createMission({ seed: seed!, missionIndex: mission!.index });
    const yard = state.entities.find((entity) => entity.owner === 1 && entity.kind === "constructionYard")!;

    expect(state.entities.some((entity) => entity.owner === 1 && entity.kind === "turret" && entity.x === yard.x + 2 && entity.y === yard.y)).toBe(false);
    expect(state.entities.some((entity) => entity.owner === 1 && entity.kind === "tank" && entity.x === yard.x - 2 && entity.y === yard.y + 2)).toBe(false);
  });
});
