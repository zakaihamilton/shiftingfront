import { describe, expect, it } from "vitest";
import { makeFixture, addUnit } from "../../lib/sim/fixtures";
import {
  corridorWalkableWidth,
  trySidestep,
  stepBlockerAside,
} from "../../lib/sim/navigation/avoidance";
import { unitOccupancyFor } from "../../lib/sim/world";

describe("predictive steering and navigation", () => {
  it("computes walkable corridor width accurately", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
    // In open flat ground, a central tile has all 8 walkable neighbors
    expect(corridorWalkableWidth(state, 10, 10)).toBe(8);

    // Near the map edge, neighbors outside the bounds are excluded
    expect(corridorWalkableWidth(state, 0, 0)).toBe(3);
  });

  it("applies right-hand passing bias when dodging obstacles on equal rank", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
    const u1 = addUnit(state, 0, "tank", 10, 10);
    u1.path = [{ x: 10, y: 12 }, { x: 10, y: 15 }];
    u1.orderDestination = { x: 10, y: 15 };

    const occupancy = unitOccupancyFor(state);
    const reserved = new Map<number, number>();

    // Facing downwards (dx=0, dy=1), right-hand passing lateral is to the west (x=9)
    const sidestepped = trySidestep(
      state,
      occupancy,
      reserved,
      u1,
      10, // blockedX directly ahead
      11, // blockedY directly ahead
    );

    expect(sidestepped).toBe(true);
    expect(u1.path[0]).toBeDefined();
    // The unit should have selected a valid sidestep tile
    expect(u1.path[0]!.x).toBe(9);
  });

  it("selects the optimal blocker sidestep closest to destination", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "annihilate" } });
    const blocker = addUnit(state, 0, "tank", 10, 10);
    blocker.orderDestination = { x: 12, y: 10 }; // Destination to the right (east)
    blocker.path = [{ x: 12, y: 10 }];

    const occupancy = unitOccupancyFor(state);
    const reserved = new Map<number, number>();

    const moved = stepBlockerAside(
      state,
      occupancy,
      reserved,
      blocker,
      true,
    );

    expect(moved).toBe(true);
    expect(blocker.path[0]).toBeDefined();
    // Blocker sidestep should select the neighbor that minimizes distance to its destination (11, 10)
    expect(blocker.path[0]!.x).toBe(11);
    expect(blocker.path[0]!.y).toBe(10);
  });
});
