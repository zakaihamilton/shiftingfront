import { describe, expect, it } from "vitest";
import { makeFixture, addBuilding, addUnit } from "../../lib/sim/fixtures";
import {
  evaluateElimination,
  evaluateExtractionEscort,
  evaluateSabotage,
  evaluateZoneHold,
  isEntityAlive,
} from "../../lib/sim/scenarios/evaluators";
import type { Entity } from "../../lib/types";

describe("composable scenario evaluators", () => {
  describe("evaluateElimination", () => {
    it("correctly evaluates target IDs elimination", () => {
      const state = makeFixture({ win: { kind: "destroyMarked" } });
      const b1 = addBuilding(state, 1, "turret", 5, 5);
      const b2 = addBuilding(state, 1, "turret", 10, 10);

      expect(isEntityAlive(state, b1.id)).toBe(true);

      const resInitial = evaluateElimination(state, { targetIds: [b1.id, b2.id], label: "Targets" });
      expect(resInitial.isComplete).toBe(false);
      expect(resInitial.current).toBe(0);
      expect(resInitial.target).toBe(2);
      expect(resInitial.progress?.label).toBe("Targets 0 / 2");

      b1.hp = 0;
      expect(isEntityAlive(state, b1.id)).toBe(false);
      const resHalf = evaluateElimination(state, { targetIds: [b1.id, b2.id], label: "Targets" });
      expect(resHalf.isComplete).toBe(false);
      expect(resHalf.current).toBe(1);
      expect(resHalf.target).toBe(2);

      b2.hp = 0;
      const resDone = evaluateElimination(state, { targetIds: [b1.id, b2.id], label: "Targets" });
      expect(resDone.isComplete).toBe(true);
      expect(resDone.current).toBe(2);
    });

    it("correctly evaluates entity predicate filters", () => {
      const state = makeFixture({ win: { kind: "razeAll" } });
      const b = addBuilding(state, 1, "power", 5, 5);

      const filter = (e: Entity) => e.owner === 1 && e.class === "building";
      expect(evaluateElimination(state, { filter }).isComplete).toBe(false);

      b.hp = 0;
      expect(evaluateElimination(state, { filter }).isComplete).toBe(true);
    });
  });

  describe("evaluateExtractionEscort", () => {
    it("handles escort lifecycle", () => {
      const state = makeFixture({ win: { kind: "escort", targetCount: 2 } });
      const truck1 = addUnit(state, 0, "convoyTruck", 2, 2);
      const truck2 = addUnit(state, 0, "convoyTruck", 2, 3);
      state.runtime = {
        kind: "escort",
        phase: "active",
        targetIds: [truck1.id, truck2.id],
        rescued: 0,
        required: 2,
        secondary: [],
      };

      const res = evaluateExtractionEscort(state);
      expect(res.isComplete).toBe(false);
      expect(res.isTargetLost).toBe(false);
      expect(res.progress.label).toBe("Convoy 0 / 2");

      state.runtime.rescued = 2;
      const wonRes = evaluateExtractionEscort(state);
      expect(wonRes.isComplete).toBe(true);
      expect(wonRes.isTargetLost).toBe(false);

      truck1.hp = 0;
      const lostRes = evaluateExtractionEscort(state);
      expect(lostRes.isTargetLost).toBe(true);
    });

    it("handles extraction target-loss and extracted set", () => {
      const state = makeFixture({ win: { kind: "extraction", targetCount: 1 } });
      const cargo = addUnit(state, 0, "infantry", 2, 2);
      state.runtime = {
        kind: "extraction",
        phase: "active",
        targetIds: [cargo.id],
        extractedIds: [],
        rescued: 0,
        required: 1,
        secondary: [],
      };

      expect(evaluateExtractionEscort(state).isComplete).toBe(false);
      expect(evaluateExtractionEscort(state).isTargetLost).toBe(false);

      // Dead before extraction is loss
      cargo.hp = 0;
      expect(evaluateExtractionEscort(state).isTargetLost).toBe(true);

      // But if marked extracted, dead does not fail
      state.runtime.extractedIds = [cargo.id];
      expect(evaluateExtractionEscort(state).isTargetLost).toBe(false);
    });
  });

  describe("evaluateZoneHold", () => {
    it("tracks hold the line countdown and completion with yard check", () => {
      const state = makeFixture({ win: { kind: "holdTheLine", ticks: 100 } });
      addBuilding(state, 0, "constructionYard", 0, 0);

      state.tick = 50;
      const mid = evaluateZoneHold(state);
      expect(mid.isComplete).toBe(false);
      expect(mid.progress.current).toBe(50);
      expect(mid.progress.target).toBe(100);

      state.tick = 100;
      const done = evaluateZoneHold(state);
      expect(done.isComplete).toBe(true);
      expect(done.progress.label).toBe("Held");
    });
  });

  describe("evaluateSabotage", () => {
    it("evaluates sabotage target completion", () => {
      const state = makeFixture({ win: { kind: "sabotage", targetCount: 1 } });
      const b = addBuilding(state, 1, "objective", 5, 5);
      state.win.targetIds = [b.id];

      const initial = evaluateSabotage(state);
      expect(initial.isComplete).toBe(false);
      expect(initial.isTargetLost).toBe(false);
      expect(initial.progress.label).toBe("Systems 0 / 1");

      b.hp = 0;
      const won = evaluateSabotage(state);
      expect(won.isComplete).toBe(true);
      expect(won.progress.label).toBe("Systems 1 / 1");
    });
  });
});
