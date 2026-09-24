import { describe, expect, it } from "vitest";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { AI_CONTACT_TTL_TICKS, enemyKnownPlayerEntities, nearestKnownPlayer, updateAiContacts } from "../../lib/sim/ai/visibility";

describe("enemy visibility and contact memory", () => {
  it("keeps an unseen player harvester out of live enemy targeting", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    addBuilding(state, 1, "constructionYard", 2, 2);
    const yard = addBuilding(state, 0, "constructionYard", 20, 20);
    const harvester = addUnit(state, 0, "harvester", 18, 18);

    const known = enemyKnownPlayerEntities(state);

    expect(known.some((entity) => entity.id === yard.id)).toBe(true);
    expect(known.some((entity) => entity.id === harvester.id)).toBe(false);
  });

  it("records a visible contact and retains it until the contact expires", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    state.biome = "crystal flats";
    addBuilding(state, 1, "constructionYard", 2, 2);
    const sensor = addUnit(state, 1, "infantry", 14, 14);
    const harvester = addUnit(state, 0, "harvester", 18, 18);

    updateAiContacts(state);
    expect(state.aiContacts?.[String(harvester.id)]).toMatchObject({
      id: harvester.id,
      class: "unit",
      kind: "harvester",
      lastSeenTick: 0,
    });

    sensor.x = 2;
    sensor.y = 2;
    state.tick = 1;
    expect(nearestKnownPlayer(state, { x: 2, y: 2 }, (entity) => entity.id === harvester.id)).toBeUndefined();

    state.tick = AI_CONTACT_TTL_TICKS;
    expect(enemyKnownPlayerEntities(state).some((entity) => entity.id === harvester.id)).toBe(true);

    state.tick += 1;
    expect(enemyKnownPlayerEntities(state).some((entity) => entity.id === harvester.id)).toBe(false);
  });

  it("reveals a player attack target as mission contact information", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    addBuilding(state, 1, "constructionYard", 2, 2);
    const enemy = addBuilding(state, 1, "turret", 5, 5);
    const attacker = addUnit(state, 0, "tank", 18, 18);
    attacker.attackTarget = enemy.id;

    expect(enemyKnownPlayerEntities(state).some((entity) => entity.id === attacker.id)).toBe(true);
  });
});
