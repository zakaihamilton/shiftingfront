import { describe, expect, it } from "vitest";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { addEntity, assertUniqueEntityIds, entitiesFor, entityFor, livingEntitiesFor, removeEntities } from "../../lib/sim/entities";
import { byId, unitAt, unitOccupancyFor } from "../../lib/sim/world";

describe("canonical entity storage", () => {
  it("uses the mission entity array for queries and live entity references", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const infantry = addUnit(state, 0, "infantry", 2, 2);
    const yard = addBuilding(state, 0, "constructionYard", 5, 5);

    expect(entitiesFor(state)).toBe(state.entities);
    expect(entityFor(state, infantry.id)).toBe(infantry);
    expect(livingEntitiesFor(state)).toEqual([infantry, yard]);

    infantry.x = 4;
    expect(state.entities[0]?.x).toBe(4);
    assertUniqueEntityIds(state);
  });

  it("rejects duplicate ids when adding entities", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const infantry = addUnit(state, 0, "infantry", 2, 2);

    expect(() => addEntity(state, { ...infantry })).toThrow(`Entity ${infantry.id} already exists`);
    expect(state.entities).toHaveLength(1);
    expect(() => assertUniqueEntityIds({ ...state, entities: [infantry, { ...infantry }] })).toThrow(`Duplicate entity id: ${infantry.id}`);
  });

  it("refreshes derived lookups after structural changes", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const occupancy = unitOccupancyFor(state);
    expect(byId(state, 1)).toBeUndefined();
    expect(unitAt(state, 2, 2)).toBeUndefined();
    expect(occupancy[2 * state.width + 2]).toBe(0);

    const infantry = addUnit(state, 0, "infantry", 2, 2);
    const x = Math.round(infantry.x);
    const y = Math.round(infantry.y);
    expect(byId(state, infantry.id)).toBe(infantry);
    expect(unitAt(state, x, y)).toBe(infantry);
    expect(unitOccupancyFor(state)[y * state.width + x]).toBe(1);

    removeEntities(state, [infantry.id]);
    expect(byId(state, infantry.id)).toBeUndefined();
    expect(unitAt(state, x, y)).toBeUndefined();
    expect(unitOccupancyFor(state)[y * state.width + x]).toBe(0);
  });

  it("clears references on removal and tracks building navigation changes", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const attacker = addUnit(state, 0, "infantry", 2, 2);
    const target = addUnit(state, 1, "tank", 5, 5);
    const yard = addBuilding(state, 0, "constructionYard", 8, 8);
    attacker.attackTarget = target.id;
    attacker.supportTargetId = target.id;
    attacker.supportMode = "assigned";
    const revisionAfterBuild = state.navigationRevision;

    expect(removeEntities(state, [target.id])).toEqual([target]);
    expect(state.entities).toEqual([attacker, yard]);
    expect(attacker.attackTarget).toBeUndefined();
    expect(attacker.supportTargetId).toBeUndefined();
    expect(attacker.supportMode).toBe("auto");
    expect(state.navigationRevision).toBe(revisionAfterBuild);

    removeEntities(state, [yard.id]);
    expect(state.navigationRevision).toBe(revisionAfterBuild + 1);
    expect(state.entities).toEqual([attacker]);
    assertUniqueEntityIds(state);
  });

  it("leaves navigation revision management to callers that already handled it", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const yard = addBuilding(state, 0, "constructionYard", 5, 5);
    const revision = state.navigationRevision;

    removeEntities(state, [yard.id], new Set([yard.id]));

    expect(state.navigationRevision).toBe(revision);
    expect(state.entities).toEqual([]);
  });
});
