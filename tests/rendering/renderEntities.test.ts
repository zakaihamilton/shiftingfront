import { describe, expect, it } from "vitest";
import { toFacing } from "../../lib/render/anim";
import { facingFor } from "../../lib/render/renderEntities";
import { sortEntitiesForRender } from "../../lib/render/renderer/world/entities";
import { addUnit, makeFixture } from "../../lib/sim/fixtures";

describe("facingFor", () => {
  it("maps a zero delta to east, which must not overwrite an existing facing", () => {
    expect(toFacing(0, 0)).toBe(0);
  });

  it("keeps the last facing when the next waypoint is the current cell", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 4, 4);
    unit.facing = 6;
    unit.path = [{ x: 4, y: 4 }];
    const entityById = new Map(state.entities.map((entity) => [entity.id, entity]));

    expect(facingFor(state, unit, entityById)).toBe(6);
    expect(unit.facing).toBe(6);
  });

  it("keeps the last facing when interpolating onto the waypoint", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 4, 4);
    unit.facing = 6;
    unit.path = [{ x: 4, y: 3 }];
    const entityById = new Map(state.entities.map((entity) => [entity.id, entity]));

    expect(facingFor(state, unit, entityById, { x: 4, y: 3.05 })).toBe(6);
    expect(unit.facing).toBe(6);
  });

  it("faces toward a distant waypoint using correct screen-isometric perspective", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 4, 4);
    unit.facing = 0;
    // Moving along tile +Y moves south-west on screen (Facing 3)
    unit.path = [{ x: 4, y: 8 }];
    const entityById = new Map(state.entities.map((entity) => [entity.id, entity]));

    expect(facingFor(state, unit, entityById)).toBe(3);
    expect(unit.facing).toBe(0);

    // Moving along tile (+4, +4) moves straight south on screen (Facing 2)
    unit.path = [{ x: 8, y: 8 }];
    expect(facingFor(state, unit, entityById)).toBe(2);
    expect(unit.facing).toBe(0);

    // Moving along tile (+4, -4) moves straight east on screen (Facing 0)
    unit.path = [{ x: 8, y: 0 }];
    expect(facingFor(state, unit, entityById)).toBe(0);
    expect(unit.facing).toBe(0);
  });
});

describe("render entity ordering", () => {
  it("keeps a near-depth group stable regardless of sort comparison order", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const first = addUnit(state, 0, "infantry", 2, 2);
    const second = addUnit(state, 0, "infantry", 3, 3);
    const third = addUnit(state, 0, "infantry", 4, 4);
    const depths = new Map([
      [first.id, 0],
      [second.id, 0.7],
      [third.id, 1.4],
    ]);
    const previousOrder = new Map([
      [third.id, 0],
      [second.id, 1],
      [first.id, 2],
    ]);

    const one = [first, second, third];
    sortEntitiesForRender(one, depths, previousOrder);

    // The middle unit crosses the third unit while all three remain a
    // connected near-depth group. A pairwise comparator can become
    // non-transitive here and flip the painter order from one frame to the
    // next.
    const nextDepths = new Map([
      [first.id, 0],
      [second.id, 1.4],
      [third.id, 0.7],
    ]);
    sortEntitiesForRender(one, nextDepths, previousOrder);

    expect(one.map((entity) => entity.id)).toEqual([third.id, second.id, first.id]);
  });
});
