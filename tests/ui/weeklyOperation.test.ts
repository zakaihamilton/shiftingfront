import { describe, expect, it } from "vitest";
import { weeklyIndex, weeklySeed } from "../../components/menu/menuLaunch";

describe("weekly operation seed", () => {
  it("stays on the same seed from Monday 00:00 UTC through Sunday night", () => {
    const monday = Date.UTC(2026, 8, 14);
    const sunday = Date.UTC(2026, 8, 20, 23, 59, 59, 999);
    expect(weeklyIndex(monday)).toBe(weeklyIndex(sunday));
    expect(weeklySeed(monday)).toBe(weeklySeed(sunday));
    expect(weeklySeed(monday)).toMatch(/^\d{4}$/);
  });

  it("rotates at the next Monday 00:00 UTC", () => {
    const before = Date.UTC(2026, 8, 20, 23, 59, 59, 999);
    const after = Date.UTC(2026, 8, 21);
    expect(weeklyIndex(after)).toBe(weeklyIndex(before) + 1);
    expect(weeklySeed(after)).not.toBe(weeklySeed(before));
  });
});
