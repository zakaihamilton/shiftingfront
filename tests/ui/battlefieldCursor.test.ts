import { describe, expect, it } from "vitest";
import { battlefieldCursor } from "../../lib/ui/battlefieldCursor";
import { addBuilding, addUnit, makeFixture, setTile, TILE_RESOURCE, TILE_WATER } from "../../lib/sim/fixtures";
import { canPlaceBuilding } from "../../lib/sim/world";

function cursorOpts(state: ReturnType<typeof makeFixture>, overrides: Partial<Parameters<typeof battlefieldCursor>[0]> = {}) {
  return {
    state,
    hoverTile: null as { x: number; y: number } | null,
    hoverEntity: undefined,
    selectedIds: [] as number[],
    placeKind: null,
    repairMode: false,
    sellMode: false,
    ...overrides,
  };
}

describe("battlefieldCursor", () => {
  it("uses cell or not-allowed while placing", () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    addBuilding(state, 0, "constructionYard", 2, 2);
    setTile(state, 10, 10, TILE_WATER);
    let valid: { x: number; y: number } | null = null;
    for (let y = 0; y < state.height && !valid; y++) {
      for (let x = 0; x < state.width; x++) {
        if (canPlaceBuilding(state, "power", x, y)) {
          valid = { x, y };
          break;
        }
      }
    }
    expect(valid).not.toBeNull();

    expect(battlefieldCursor(cursorOpts(state, { placeKind: "power", hoverTile: valid }))).toBe("cell");
    expect(battlefieldCursor(cursorOpts(state, { placeKind: "power", hoverTile: { x: 10, y: 10 } }))).toBe("not-allowed");
  });

  it("uses pointer or not-allowed in repair and sell modes", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const power = addBuilding(state, 0, "power", 4, 2);
    const yard = addBuilding(state, 0, "constructionYard", 2, 2);
    const enemy = addBuilding(state, 1, "power", 8, 8);
    power.hp = power.maxHp - 10;

    expect(battlefieldCursor(cursorOpts(state, { repairMode: true, hoverEntity: power }))).toBe("pointer");
    expect(battlefieldCursor(cursorOpts(state, { repairMode: true, hoverEntity: enemy }))).toBe("not-allowed");
    expect(battlefieldCursor(cursorOpts(state, { sellMode: true, hoverEntity: power }))).toBe("pointer");
    expect(battlefieldCursor(cursorOpts(state, { sellMode: true, hoverEntity: yard }))).toBe("not-allowed");
  });

  it("points at friendlies, keeps a crosshair on enemies with combat selected, and cells ore for harvesters", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const infantry = addUnit(state, 0, "infantry", 2, 2);
    const harvester = addUnit(state, 0, "harvester", 3, 2);
    const enemy = addUnit(state, 1, "infantry", 6, 6);
    setTile(state, 5, 5, TILE_RESOURCE, 80);

    expect(battlefieldCursor(cursorOpts(state, { hoverEntity: infantry }))).toBe("pointer");
    expect(battlefieldCursor(cursorOpts(state, { hoverEntity: enemy, selectedIds: [infantry.id] }))).toBe("crosshair");
    expect(battlefieldCursor(cursorOpts(state, { hoverEntity: enemy }))).toBe("not-allowed");
    expect(battlefieldCursor(cursorOpts(state, { hoverEntity: enemy, selectedIds: [harvester.id] }))).toBe("not-allowed");
    expect(battlefieldCursor(cursorOpts(state, {
      hoverTile: { x: 5, y: 5 },
      selectedIds: [harvester.id],
    }))).toBe("cell");
    const neutral = addUnit(state, 1, "infantry", 7, 7);
    neutral.neutral = true;
    expect(battlefieldCursor(cursorOpts(state, { hoverEntity: neutral, selectedIds: [infantry.id] }))).toBe("crosshair");
    expect(battlefieldCursor(cursorOpts(state, { hoverEntity: neutral, selectedIds: [harvester.id] }))).toBe("crosshair");
    expect(battlefieldCursor(cursorOpts(state))).toBe("crosshair");
  });
});
