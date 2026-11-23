import { describe, expect, it } from "vitest";
import { composePerfHudLine, isPerfHudEnabled, resetPerfHudFlag } from "../../lib/render/perfHud";

describe("perf HUD", () => {
  it("is off by default in node", () => {
    resetPerfHudFlag();
    expect(isPerfHudEnabled()).toBe(false);
  });

  it("names the slowest phase in the overlay line", () => {
    resetPerfHudFlag();
    const line = composePerfHudLine(
      16,
      {
        terrain: 1.2,
        fx: 4.8,
        entities: 2.1,
        combat: 0.4,
      },
      0.3,
    );
    expect(line).toContain("ms");
    expect(line).toContain("fx");
    expect(line).toMatch(/\d+ fps/);
  });
});
