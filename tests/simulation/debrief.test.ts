import { describe, expect, it } from "vitest";
import { formatMissionDuration, missionDebrief, missionMedals, missionScore, shouldShowCommandSidebar } from "../../lib/sim/debrief";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { minutesToTicks } from "../../lib/gen/pacing";
import { createSkirmish } from "../../lib/sim/api";

describe("mission debrief", () => {
  it("summarizes a completed primary objective and the battle record", () => {
    const state = makeFixture({ win: { kind: "harvestQuota", target: 900 } });
    state.result = "won";
    state.tick = 150;
    state.creditsEarned[0] = 900;
    state.unitsProduced[0] = 5;
    state.buildingsCompleted[0] = 2;
    state.losses.units = [1, 3];
    state.losses.buildings = [0, 2];
    addUnit(state, 0, "tank", 2, 2);
    addBuilding(state, 0, "power", 4, 4);
    addUnit(state, 1, "infantry", 7, 7);

    expect(missionDebrief(state)).toMatchObject({
      status: "won",
      outcome: "Primary objective achieved.",
      objective: { headline: "Extract 900 credits from the field", progress: "Extracted 900 / 900" },
      tactical: { completed: true, label: expect.any(String) },
      battle: { duration: "1 min", creditsGathered: 900, unitsTrained: 5, structuresCompleted: 2 },
      forces: {
        friendly: { unitsRemaining: 1, buildingsRemaining: 1, unitsLost: 1, buildingsLost: 0 },
        enemy: { unitsRemaining: 1, buildingsRemaining: 0, unitsLost: 3, buildingsLost: 2 },
      },
    });
  });

  it("explains defeat and preserves the incomplete objective progress", () => {
    const state = makeFixture({ win: { kind: "holdTheLine", ticks: 120 } });
    state.result = "lost";
    state.tick = 36;

    expect(missionDebrief(state)).toMatchObject({
      status: "lost",
      outcome: "The Command HQ was destroyed.",
      objective: { headline: "Hold this ground for 1 min", progress: "Hold 00:07 remaining" },
      tactical: { completed: false, emphasis: expect.any(String) },
    });
  });

  it("explains escort, extraction, and rescue losses when the objective target is destroyed", () => {
    const escort = makeFixture({ win: { kind: "escort", targetCount: 1, ticks: 100 } });
    escort.result = "lost";
    escort.lossReason = "objectiveTargetLost";
    expect(missionDebrief(escort).outcome).toBe("The convoy was lost.");

    const extraction = makeFixture({ win: { kind: "extraction", targetCount: 2, ticks: 100 } });
    extraction.result = "lost";
    extraction.lossReason = "objectiveTargetLost";
    expect(missionDebrief(extraction).outcome).toBe("The cargo was lost.");

    const rescue = makeFixture({ win: { kind: "rescue", targetCount: 2, ticks: 100 } });
    rescue.result = "lost";
    rescue.lossReason = "objectiveTargetLost";
    expect(missionDebrief(rescue).outcome).toBe("A stranded unit was lost.");
  });

  it("does not mark a time secondary complete when the mission fails early", () => {
    const state = makeFixture({ win: { kind: "rescue", targetCount: 1, ticks: 144 } });
    state.result = "lost";
    state.lossReason = "yardDestroyed";
    state.tick = 36;
    state.runtime = {
      kind: "rescue",
      phase: "complete",
      targetIds: [],
      deadline: 144,
      rescued: 0,
      required: 1,
      secondary: [
        { id: "yard", kind: "preserveYard", label: "Keep the Command HQ standing", completed: false },
        { id: "time", kind: "completeBefore", label: "Complete the operation within 12 min", target: 144, completed: true },
      ],
    };

    expect(missionDebrief(state).secondary).toMatchObject([
      { id: "yard", completed: false, failed: true },
      { id: "time", completed: false, failed: true },
    ]);
    expect(missionDebrief(state).primaryObjectives.map(({ id }) => id)).toEqual(["yard", "time"]);
    expect(missionDebrief(state).optionalObjectives).toHaveLength(0);
  });

  it("formats elapsed time as whole minutes and hides the sidebar after a result", () => {
    expect(formatMissionDuration(12 * 125 + 7)).toBe("2 min");
    expect(shouldShowCommandSidebar("playing")).toBe(true);
    expect(shouldShowCommandSidebar("won")).toBe(false);
    expect(shouldShowCommandSidebar("lost")).toBe(false);
  });

  it("normalizes remaining-time bonus so longer casual windows do not inflate scores", () => {
    function scored(deadline: number, tick: number) {
      const state = makeFixture({ win: { kind: "sabotage", ticks: deadline } });
      state.result = "won";
      state.tick = tick;
      state.runtime = {
        kind: "sabotage",
        phase: "complete",
        targetIds: [],
        deadline,
        rescued: 0,
        required: 1,
        secondary: [],
      };
      return missionScore(state);
    }

    const twelve = minutesToTicks(12);
    const thirty = minutesToTicks(30);
    expect(scored(twelve, twelve / 2)).toBe(scored(thirty, thirty / 2));
    expect(scored(twelve, 0)).toBe(1000 + 20 * 60 * 10);
    expect(scored(thirty, 0)).toBe(1000 + 20 * 60 * 10);
  });

  it("awards medals only for the completed secondary conditions", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    state.result = "won";
    state.runtime = {
      kind: "annihilate",
      phase: "complete",
      targetIds: [],
      rescued: 0,
      required: 1,
      secondary: [
        { id: "yard", kind: "preserveYard", label: "Keep the yard standing", completed: true },
        { id: "time", kind: "completeBefore", label: "Finish before the deadline", completed: true },
      ],
    };

    expect(missionMedals(state)).toBe(3);
    expect(missionScore(state)).toBeGreaterThan(0);
    state.runtime.secondary[1]!.completed = false;
    expect(missionMedals(state)).toBe(2);
    state.losses.units[0] = 1;
    expect(missionMedals(state)).toBe(1);
  });

  it("reports the local seat and all rivals in a multiplayer result without campaign scoring", () => {
    const state = createSkirmish(8123, 3, [0, 1, 2, 3]).state;
    state.result = "won";
    state.winner = 3;
    state.creditsEarned = [110, 220, 330, 440];
    state.unitsProduced = [1, 2, 3, 4];
    state.buildingsCompleted = [5, 6, 7, 8];
    state.losses.units = [1, 2, 3, 4];
    state.losses.buildings = [5, 6, 7, 8];

    const debrief = missionDebrief(state);
    expect(debrief).toMatchObject({
      status: "won",
      outcome: "All rival Command HQs destroyed.",
      objective: { headline: "Destroy all rival Command HQs" },
      battle: { creditsGathered: 440, unitsTrained: 4, structuresCompleted: 8, score: 0, medals: 0 },
      forces: {
        friendly: { unitsLost: 4, buildingsLost: 8 },
        enemy: { unitsLost: 6, buildingsLost: 18 },
      },
    });
    expect(missionScore(state)).toBe(0);
    expect(missionMedals(state)).toBe(0);

    state.result = "lost";
    state.winner = null;
    expect(missionDebrief(state)).toMatchObject({ status: "lost", outcome: "The skirmish ended in a draw." });
  });
});
