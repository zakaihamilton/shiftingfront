import { describe, expect, it } from "vitest";
import { deadlineUrgency, minimapPingFor, objectiveCardsFor, phaseLabel } from "../../lib/ui/missionPresentation";
import { addUnit, makeFixture } from "../../lib/sim/fixtures";

describe("mission presentation models", () => {
  it("maps timer thresholds to explicit urgency states", () => {
    expect(deadlineUrgency(61 * 12)).toBe("normal");
    expect(deadlineUrgency(60 * 12)).toBe("watch");
    expect(deadlineUrgency(30 * 12)).toBe("urgent");
    expect(deadlineUrgency(10 * 12)).toBe("critical");
    expect(deadlineUrgency(undefined)).toBe("normal");
  });

  it("keeps objective status presentation-only and phase-aware", () => {
    const state = makeFixture({ win: { kind: "harvestQuota", target: 100 } });
    expect(objectiveCardsFor(state)[0]?.status).toBe("active");
    state.result = "won";
    expect(objectiveCardsFor(state)[0]?.status).toBe("complete");
    state.result = "lost";
    expect(objectiveCardsFor(state)[0]?.status).toBe("failed");
    state.runtime = { kind: "extraction", phase: "extraction", targetIds: [], rescued: 0, required: 0, secondary: [] };
    expect(phaseLabel(state.runtime)).toBe("Extraction phase");
  });

  it("keeps the primary card label separate from its numeric counter", () => {
    const state = makeFixture({ win: { kind: "harvestQuota", target: 2 } });

    expect(objectiveCardsFor(state)[0]).toMatchObject({
      label: "Extracted",
      current: 0,
      target: 2,
    });
  });

  it("marks required preservation and deadline rows as primary presentation objectives", () => {
    const state = makeFixture({ win: { kind: "rescue", targetCount: 1, ticks: 144 } });
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [],
      rescued: 0,
      required: 1,
      secondary: [
        { id: "yard", kind: "preserveYard", label: "Keep the Command HQ standing" },
        { id: "time", kind: "completeBefore", label: "Complete the operation within 12 min", target: 144 },
        { id: "survivors", kind: "keepUnits", label: "Keep a unit alive", target: 1 },
      ],
    };

    expect(objectiveCardsFor(state).map(({ id, priority }) => ({ id, priority }))).toEqual([
      { id: "primary", priority: "primary" },
      { id: "yard", priority: "primary" },
      { id: "time", priority: "primary" },
      { id: "survivors", priority: "optional" },
    ]);
  });

  it("does not reveal a shrouded alert target with a minimap ping", () => {
    const state = makeFixture({ win: { kind: "rescue", targetCount: 1 } });
    const enemy = addUnit(state, 1, "infantry", 9, 9);
    state.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [enemy.id],
      rescued: 0,
      required: 1,
      secondary: [],
    };

    expect(minimapPingFor(state, "urgent")).toMatchObject({
      x: 9 / (state.width - 1),
      y: 9 / (state.height - 1),
    });

    state.fog.fill(0);
    expect(minimapPingFor(state, "urgent")).toBeUndefined();
  });
});
