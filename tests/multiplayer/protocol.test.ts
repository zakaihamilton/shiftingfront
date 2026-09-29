import { describe, expect, it } from "vitest";
import { BUILDING_KINDS, UNIT_KINDS } from "@/lib/catalog";
import { isSimSnapshot } from "@/lib/multiplayer/protocol";
import { createSkirmish } from "@/lib/sim/api";
import { sanitizeCommand } from "@/lib/multiplayer/session";

// Wire recognition deliberately includes scenario units. The simulation owns
// production availability, ownership, and costs after a command is accepted.
describe("catalog-backed multiplayer commands", () => {
  it.each(UNIT_KINDS)("recognizes %s for production and cancellation", (unit) => {
    expect(sanitizeCommand({ type: "produce", fromId: 1, unit })).toEqual({ type: "produce", fromId: 1, unit });
    expect(sanitizeCommand({ type: "cancelProduce", unit })).toEqual({ type: "cancelProduce", unit });
  });

  it.each(BUILDING_KINDS)("preserves command eligibility for %s", (building) => {
    const allowed = building !== "constructionYard" && building !== "objective";
    const build = { type: "build", building, x: 10, y: 20 };
    const cancel = { type: "cancelBuild", building };
    expect(sanitizeCommand(build)).toEqual(allowed ? build : null);
    expect(sanitizeCommand(cancel)).toEqual(allowed ? cancel : null);
  });

  it.each([
    null, [], {},
    { type: "produce", fromId: 1, unit: "unknown" },
    { type: "cancelProduce", unit: "unknown" },
    { type: "build", building: "unknown", x: 10, y: 20 },
    { type: "cancelBuild", building: "unknown" },
    { type: "produce", fromId: 0, unit: "infantry" },
    { type: "move", unitIds: [1], x: NaN, y: 10 },
    { type: "move", unitIds: [1], x: 301, y: 10 },
    { type: "move", unitIds: [1], x: -3, y: 10 },
    { type: "move", unitIds: Array(257).fill(1), x: 0, y: 0 },
    { type: "stop", unitIds: [-1] },
    { type: "stop", unitIds: [1], owner: 0 },
  ])("rejects malformed or unknown input %j", (input) => {
    expect(sanitizeCommand(input)).toBeNull();
  });

  it("preserves owner and coordinate limits", () => {
    const command = { type: "move", unitIds: Array(256).fill(1), x: -2, y: 300, owner: 3 };
    expect(sanitizeCommand(command, true)).toEqual(command);
    expect(sanitizeCommand({ ...command, owner: 4 }, true)).toBeNull();
    expect(sanitizeCommand({ type: "stop", unitIds: [1] }, true)).toBeNull();
  });
});


describe("catalog-backed multiplayer snapshot contacts", () => {
  it.each([
    ...UNIT_KINDS.map((kind) => ({ class: "unit", kind })),
    ...BUILDING_KINDS.map((kind) => ({ class: "building", kind })),
  ])("recognizes $class $kind in AI memory", (entity) => {
    const state = createSkirmish(421, 0, [0, 1], [1]).state;
    state.multiplayerAiMemory = { 1: { contacts: { 1: {
      ...entity, id: 1, owner: 0, x: 5, y: 5, lastSeenTick: 0,
    } } } } as typeof state.multiplayerAiMemory;
    expect(isSimSnapshot(state, 421, [0, 1], [1])).toBe(true);
    state.multiplayerAiMemory![1]!.contacts![1]!.kind = "unknown" as never;
    expect(isSimSnapshot(state, 421, [0, 1], [1])).toBe(false);
  });
});
