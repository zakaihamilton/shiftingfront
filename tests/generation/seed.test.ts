import { describe, expect, it } from "vitest";
import { createCampaign } from "../../lib/gen/campaign";
import { createMission } from "../../lib/sim/api";
import { assertValidSeed, parseMissionIndex } from "../../lib/seed/rng";

describe("campaign seed validation", () => {
  it("accepts the inclusive four-digit seed range", () => {
    expect(assertValidSeed(0)).toBe(0);
    expect(assertValidSeed(9999)).toBe(9999);
  });

  it.each([-1, 10000, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid seed %s", (seed) => {
    expect(() => assertValidSeed(seed)).toThrow(RangeError);
    expect(() => createCampaign(seed)).toThrow(RangeError);
    expect(() => createMission({ seed, missionIndex: 0 })).toThrow(RangeError);
  });
});

describe("mission query parsing", () => {
  it("accepts only the six campaign mission indices", () => {
    expect(parseMissionIndex("0")).toBe(0);
    expect(parseMissionIndex("05")).toBe(5);
    expect(parseMissionIndex("6")).toBeNull();
  });

  it("rejects malformed values instead of producing NaN or invalid missions", () => {
    for (const value of [null, undefined, "", "-1", "1.5", "abc", "100"]) {
      expect(parseMissionIndex(value)).toBeNull();
    }
  });
});
