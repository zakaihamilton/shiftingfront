import { describe, expect, it } from "vitest";
import { homeGuardCount, isTimedRecovery, scenarioHomeGuardSize } from "../../lib/sim/policy";

describe("shared commander policy", () => {
  it("treats rescue and extraction as timed recovery", () => {
    expect(isTimedRecovery("rescue")).toBe(true);
    expect(isTimedRecovery("extraction")).toBe(true);
    expect(isTimedRecovery("escort")).toBe(false);
    expect(isTimedRecovery("decapitate")).toBe(false);
  });

  it("keeps a minority player home guard on timed recovery", () => {
    expect(scenarioHomeGuardSize("rescue", 5)).toBe(2);
    expect(scenarioHomeGuardSize("extraction", 5)).toBe(1);
    expect(scenarioHomeGuardSize("annihilate", 9)).toBe(1);
  });

  it("scales the enemy yard guard with late-campaign missions", () => {
    expect(homeGuardCount(0)).toBe(1);
    expect(homeGuardCount(3)).toBe(1);
    expect(homeGuardCount(4)).toBe(2);
  });
});
