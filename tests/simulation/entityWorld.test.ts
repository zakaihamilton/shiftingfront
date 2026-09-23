import { describe, expect, it } from "vitest";
import type { Entity } from "../../lib/types";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { assertWorld, rebuildWorld, worldFor } from "../../lib/sim/ecs";

describe("EntityWorld compatibility boundary", () => {
  it("indexes units and buildings in stable projection order", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const infantry = addUnit(state, 0, "infantry", 2, 2);
    const yard = addBuilding(state, 0, "constructionYard", 5, 5);
    const world = worldFor(state);

    expect(world.all().map((entity) => entity.id)).toEqual([infantry.id, yard.id]);
    expect(world.units().map((entity) => entity.id)).toEqual([infantry.id]);
    expect(world.buildings().map((entity) => entity.id)).toEqual([yard.id]);
    expect(world.byOwner(0).map((entity) => entity.id)).toEqual([infantry.id, yard.id]);
    expect(world.validate()).toEqual([]);
  });

  it("keeps typed component records canonical and exposes live field adapters", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const infantry = addUnit(state, 0, "infantry", 2, 2);
    const world = worldFor(state);

    const transform = world.transform.get(infantry.id);
    const vital = world.vital.get(infantry.id);
    expect(transform).toBeDefined();
    expect(vital).toBeDefined();

    transform!.x = 4;
    vital!.hp = vital!.maxHp - 3;

    expect(infantry.x).toBe(4);
    expect(infantry.hp).toBe(infantry.maxHp - 3);
    infantry.x = 7;
    infantry.hp -= 2;
    expect(transform!.x).toBe(7);
    expect(vital!.hp).toBe(vital!.maxHp - 5);
    assertWorld(state);
  });

  it("preserves the flat entity JSON shape while component fields change", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const infantry = addUnit(state, 0, "infantry", 2, 2);
    const before = JSON.parse(JSON.stringify(infantry)) as Entity;
    const world = worldFor(state);

    world.motion.get(infantry.id)!.orderDestination = { x: 8, y: 9 };
    infantry.attackTarget = 999;
    const after = JSON.parse(JSON.stringify(infantry)) as Entity;

    expect(after).toEqual({ ...before, orderDestination: { x: 8, y: 9 }, attackTarget: 999 });
    delete infantry.attackTarget;
    expect(Object.hasOwn(infantry, "attackTarget")).toBe(false);
    expect(world.combat.get(infantry.id)!.attackTarget).toBeUndefined();
  });

  it("rebuilds after a legacy caller replaces the projection", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const first = addUnit(state, 0, "infantry", 2, 2);
    const replacement = { ...first, id: first.id + 100 };
    state.entities = [replacement];

    const indexedReplacement = worldFor(state).get(replacement.id)!;
    expect(indexedReplacement).toMatchObject(replacement);
    expect(indexedReplacement).not.toBe(replacement);
    expect(worldFor(state).get(first.id)).toBeUndefined();
    indexedReplacement.x = 8;
    expect(worldFor(state).transform.get(replacement.id)?.x).toBe(8);
    expect(worldFor(state).validate()).toEqual([]);
  });

  it("keeps structural operations visible to the flat projection", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const first = addUnit(state, 0, "infantry", 2, 2);
    const second = addUnit(state, 0, "tank", 3, 2);
    const world = worldFor(state);
    second.attackTarget = first.id;

    world.remove(first.id);
    expect(state.entities.map((entity) => entity.id)).toEqual([second.id]);
    expect(second.attackTarget).toBeUndefined();
    expect(rebuildWorld(state).all().map((entity) => entity.id)).toEqual([second.id]);
    assertWorld(state);
  });

  it("does not expose mutable structural collections", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    addUnit(state, 0, "infantry", 2, 2);
    const world = worldFor(state);

    expect(Object.isFrozen(world.all())).toBe(true);
    expect(world.identity).not.toHaveProperty("clear");
    expect(() => (world.all() as Entity[]).push({} as Entity)).toThrow();
    expect(world.validate()).toEqual([]);
  });
});
