import { describe, expect, it } from "vitest";
import { tickCombat } from "../../lib/sim/combat";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import {
  POWER_SHORTAGE_TURRET_COOLDOWN_RATE,
  POWER_SHORTAGE_TURRET_RANGE_MULTIPLIER,
  POWER_SHORTAGE_TURRET_SIGHT_MULTIPLIER,
  isDefensiveTurret,
} from "../../lib/catalog";
import { powerFor } from "../../lib/sim/world";
import { fogAt, tileInPlayerVision, tickFog } from "../../lib/sim/fog";
import { turretRange, turretTargetInRange } from "../../lib/render/renderStructures/turret";

describe("Turret power shortage penalties", () => {
  it("identifies defensive turrets and exports penalty constants correctly", () => {
    expect(isDefensiveTurret("turret")).toBe(true);
    expect(isDefensiveTurret("antiAirTurret")).toBe(true);
    expect(isDefensiveTurret("power")).toBe(false);
    expect(isDefensiveTurret("factory")).toBe(false);
    expect(isDefensiveTurret("constructionYard")).toBe(false);
    expect(isDefensiveTurret("tank")).toBe(false);
    expect(POWER_SHORTAGE_TURRET_COOLDOWN_RATE).toBe(0.5);
    expect(POWER_SHORTAGE_TURRET_RANGE_MULTIPLIER).toBe(0.75);
    expect(POWER_SHORTAGE_TURRET_SIGHT_MULTIPLIER).toBe(0.75);
  });

  describe("Rate of fire / cooldown recovery penalty", () => {
    it("decrements turret cooldown only on even ticks when power is negative", () => {
      const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
      const turret = addBuilding(state, 0, "turret", 4, 4);
      turret.constructing = 0;
      turret.cooldown = 10;

      // Without power buildings, power surplus is negative (turret consumes 8)
      expect(powerFor(state, 0)).toBeLessThan(0);

      // Tick 1 (odd tick) -> cooldown should not decrement
      state.tick = 1;
      tickCombat(state);
      expect(turret.cooldown).toBe(10);

      // Tick 2 (even tick) -> cooldown decrements by 1
      state.tick = 2;
      tickCombat(state);
      expect(turret.cooldown).toBe(9);

      // Tick 3 (odd tick) -> cooldown remains unchanged
      state.tick = 3;
      tickCombat(state);
      expect(turret.cooldown).toBe(9);

      // Tick 4 (even tick) -> cooldown decrements by 1
      state.tick = 4;
      tickCombat(state);
      expect(turret.cooldown).toBe(8);
    });

    it("decrements turret cooldown on every tick when power is sufficient", () => {
      const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
      const turret = addBuilding(state, 0, "turret", 4, 4);
      turret.constructing = 0;
      turret.cooldown = 10;

      // Add power plant so power is positive (30 - 8 = +22)
      addBuilding(state, 0, "power", 1, 1);
      expect(powerFor(state, 0)).toBeGreaterThanOrEqual(0);

      // Tick 1 -> decrements
      state.tick = 1;
      tickCombat(state);
      expect(turret.cooldown).toBe(9);

      // Tick 2 -> decrements
      state.tick = 2;
      tickCombat(state);
      expect(turret.cooldown).toBe(8);

      // Tick 3 -> decrements
      state.tick = 3;
      tickCombat(state);
      expect(turret.cooldown).toBe(7);
    });
  });

  describe("Range penalty", () => {
    it("reduces turret effective range by 25% during power shortage", () => {
      // Normal turret range is 5.5, reduced range is 5.5 * 0.75 = 4.125
      const state = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
      const turret = addBuilding(state, 0, "turret", 5, 5);
      turret.constructing = 0;
      turret.cooldown = 0;

      // Place enemy at distance 4.8 (between 4.125 and 5.5)
      // Turret is at (5, 5). Target at (5, 9.8) -> distance = 4.8
      const enemy = addUnit(state, 1, "infantry", 5, 9.8);
      const initialHp = enemy.hp;

      // With power deficit: turret cannot fire at distance 4.8
      expect(powerFor(state, 0)).toBeLessThan(0);
      state.tick = 2;
      tickCombat(state);
      expect(enemy.hp).toBe(initialHp);
      expect(turret.attackTarget).toBeUndefined();

      // Now add a power plant: power is sufficient, turret can fire at distance 4.8 <= 5.5
      addBuilding(state, 0, "power", 1, 1);
      expect(powerFor(state, 0)).toBeGreaterThanOrEqual(0);
      state.tick = 4;
      tickCombat(state);
      expect(enemy.hp).toBeLessThan(initialHp);
      expect(turret.attackTarget).toBe(enemy.id);
    });

    it("allows elevated attackers like tanks (effective range 4.6) to outrange brownout turrets (range 4.125)", () => {
      const state = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
      const turret = addBuilding(state, 0, "turret", 5, 5);
      turret.constructing = 0;
      turret.cooldown = 0;
      const initialTurretHp = turret.hp;

      // Tank has base range 3.6. Place tank on high ground (height 2 vs turret height 1),
      // giving it heightRangeBonus +1 => effective range 4.6.
      // Turret is at (5, 5) with height 1. Tank is at (5, 9.3) -> dist 4.3.
      state.heights[9 * 24 + 5] = 2;
      const enemyTank = addUnit(state, 1, "tank", 5, 9);
      enemyTank.x = 5;
      enemyTank.y = 9.4;
      enemyTank.cooldown = 0;
      const initialTankHp = enemyTank.hp;

      // With power shortage: turret range is 4.125, so elevated tank (range 4.6) can shoot turret at dist 4.4,
      // but turret cannot reach the tank (4.4 > 4.125)
      expect(powerFor(state, 0)).toBeLessThan(0);
      state.tick = 2;
      tickCombat(state);

      // Tank damaged the turret
      expect(turret.hp).toBeLessThan(initialTurretHp);
      // Turret did NOT damage the tank
      expect(enemyTank.hp).toBe(initialTankHp);
    });

    it("applies range and fire rate penalties to anti-air turrets as well", () => {
      // Normal anti-air range is 8.0, reduced range is 8.0 * 0.75 = 6.0
      const state = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
      const aaTurret = addBuilding(state, 0, "antiAirTurret", 5, 5);
      aaTurret.constructing = 0;
      aaTurret.cooldown = 0;

      // Place enemy air unit at distance 7.0 (between 6.0 and 8.0)
      const airUnit = addUnit(state, 1, "strikePlane", 5, 12);
      airUnit.stance = "hold";
      const initialHp = airUnit.hp;

      // Under power shortage: cannot reach air unit at distance 7.0
      expect(powerFor(state, 0)).toBeLessThan(0);
      state.tick = 2;
      tickCombat(state);
      expect(airUnit.hp).toBe(initialHp);

      // Add power plant: now can reach air unit
      addBuilding(state, 0, "power", 1, 1);
      expect(powerFor(state, 0)).toBeGreaterThanOrEqual(0);
      state.tick = 4;
      tickCombat(state);
      expect(airUnit.hp).toBeLessThan(initialHp);
      expect(aaTurret.attackTarget).toBe(airUnit.id);
    });
  });

  describe("Sight / Fog of war penalty", () => {
    it("contracts turret sight by 25% under power shortage in tileInPlayerVision and tickFog", () => {
      const state = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
      // Normal turret sight is 7. Reduced sight is Math.max(3, Math.round(7 * 0.75)) = 5.
      // Place turret at (10, 10). Footprint 1x1, center (10, 10).
      const turret = addBuilding(state, 0, "turret", 10, 10);
      turret.constructing = 0;

      // Under power deficit:
      expect(powerFor(state, 0)).toBeLessThan(0);

      // Distance 6: (10, 16) is within 7 (normal sight), but outside 5 (degraded sight)
      expect(tileInPlayerVision(state, 10, 16)).toBe(false);
      // Distance 4: (10, 14) is within 5 (degraded sight)
      expect(tileInPlayerVision(state, 10, 14)).toBe(true);

      // Now add power:
      addBuilding(state, 0, "power", 1, 1);
      expect(powerFor(state, 0)).toBeGreaterThanOrEqual(0);

      // Distance 6 is now in player vision!
      expect(tileInPlayerVision(state, 10, 16)).toBe(true);

      // Also verify tickFog reflects the sight radius
      state.fog.fill(0);
      tickFog(state);
      expect(fogAt(state, 10, 16)).toBe(2);
    });
  });

  describe("Renderer calculations", () => {
    it("calculates degraded range and target lock with turretRange and turretTargetInRange", () => {
      const state = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
      const turret = addBuilding(state, 0, "turret", 5, 5);
      const enemy = addUnit(state, 1, "tank", 5, 9.8); // dist = 4.8

      // Without power: range is 5.5 * 0.75 = 4.125
      expect(turretRange(turret, state)).toBeCloseTo(5.5 * POWER_SHORTAGE_TURRET_RANGE_MULTIPLIER);
      expect(turretTargetInRange(turret, enemy, state)).toBe(false);

      // Without passing state: returns full nominal range
      expect(turretRange(turret)).toBe(5.5);
      expect(turretTargetInRange(turret, enemy)).toBe(true);

      // With power: returns full nominal range
      addBuilding(state, 0, "power", 1, 1);
      expect(turretRange(turret, state)).toBe(5.5);
      expect(turretTargetInRange(turret, enemy, state)).toBe(true);
    });
  });
});
