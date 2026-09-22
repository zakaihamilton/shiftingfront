import { describe, expect, it } from "vitest";
import { makeFixture, addUnit } from "../../lib/sim/fixtures";
import { heightMultiplier, heightRangeBonus } from "../../lib/sim/combat/targeting";
import { buildGrid, candidatesInSplash, statsFor } from "../../lib/sim/combat/grid";
import { strike } from "../../lib/sim/combat/damage";
import { rngFromState } from "../../lib/seed/rng";

describe("combat physics and elevation mechanics", () => {
  it("provides high ground elevation damage and range bonuses", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
    const uHigh = addUnit(state, 0, "tank", 5, 5);
    const uLow = addUnit(state, 1, "tank", 5, 8);

    // Set elevations: uHigh on plateau level 2, uLow in valley level 1
    state.heights[5 * state.width + 5] = 2;
    state.heights[8 * state.width + 5] = 1;

    // Firing downhill grants damage and range bonus
    expect(heightMultiplier(state, uHigh, uLow)).toBeGreaterThan(1.0);
    expect(heightRangeBonus(state, uHigh, uLow)).toBe(1);

    // Firing uphill suffers a damage penalty and no range bonus
    expect(heightMultiplier(state, uLow, uHigh)).toBeLessThan(1.0);
    expect(heightRangeBonus(state, uLow, uHigh)).toBe(0);
  });

  it("queries splash candidates efficiently via spatial grid", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
    const target = addUnit(state, 1, "infantry", 10, 10);
    const near = addUnit(state, 1, "infantry", 11, 10);
    const far = addUnit(state, 1, "infantry", 18, 18);

    const grid = buildGrid(state);
    const candidates = candidatesInSplash(grid, target.x, target.y, 2.5);

    const candidateIds = candidates.map((c) => c.id);
    expect(candidateIds).toContain(target.id);
    expect(candidateIds).toContain(near.id);
    expect(candidateIds).not.toContain(far.id);
  });

  it("applies distance attenuation and cliff occlusion to splash explosions", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
    const attacker = addUnit(state, 0, "tank", 5, 5);
    const target = addUnit(state, 1, "infantry", 10, 10);
    const closeVictim = addUnit(state, 1, "infantry", 10, 11); // 1 tile away
    const edgeVictim = addUnit(state, 1, "infantry", 10, 12); // 2 tiles away

    // A unit behind a high cliff wall
    const shelteredVictim = addUnit(state, 1, "infantry", 10, 8);
    // Wall of height 3 in between target at (10, 10) and shelteredVictim at (10, 8)
    state.heights[10 * state.width + 10] = 1;
    state.heights[9 * state.width + 10] = 3; // Intermediate blocking cliff
    state.heights[8 * state.width + 10] = 1;

    const stats = { ...statsFor(attacker), splashRadius: 2.5 };
    const rng = rngFromState(state.rngState);
    const grid = buildGrid(state);

    const initialCloseHp = closeVictim.hp;
    const initialEdgeHp = edgeVictim.hp;
    const initialShelteredHp = shelteredVictim.hp;

    strike(state, attacker, target, stats, rng, undefined, undefined, grid);

    // Target took direct hit
    expect(target.hp).toBeLessThan(target.maxHp);

    // Both splash victims took damage, but closer victim took more damage due to falloff
    const closeDamage = initialCloseHp - closeVictim.hp;
    const edgeDamage = initialEdgeHp - edgeVictim.hp;
    expect(closeDamage).toBeGreaterThan(0);
    expect(edgeDamage).toBeGreaterThan(0);
    expect(closeDamage).toBeGreaterThan(edgeDamage);

    // Sheltered victim behind cliff wall took zero splash damage due to line-of-sight occlusion
    expect(shelteredVictim.hp).toBe(initialShelteredHp);
  });
});
