import { describe, expect, it, vi } from "vitest";
import { cameraViewQuad, createCamera } from "../../lib/iso";
import {
  cameraPanBounds,
  focusCameraAtTile,
  panCamera,
  panInputForDirection,
} from "../../lib/render/camera";
import {
  entityColor,
  MINIMAP_OVERLAY_TICK_SHIFT,
  minimapCacheKeys,
  minimapEntityVisible,
  minimapRegionForCell,
  minimapViewRect,
  renderMinimap,
  terrainColors,
} from "../../lib/render/minimap";
import { addBuilding, addUnit, makeFixture, setTile } from "../../lib/sim/fixtures";
import { fogIndex } from "../../lib/sim/fog";
import {
  SURFACE_CONCRETE,
  SURFACE_ROAD,
  TILE_BLOCKED,
  TILE_CLEAR,
  TILE_RESOURCE,
  TILE_WATER,
} from "../../lib/types";

describe("minimap classification", () => {
  it("moves the isometric viewport window along the corresponding screen direction", () => {
    const bounds = cameraPanBounds(48, 48, 640, 480);
    const cam = createCamera();
    focusCameraAtTile(cam, 24, 24, bounds);
    const viewRect = () => minimapViewRect(cameraViewQuad(cam, 640, 480), 224, 160, 48, 48)!;
    const before = viewRect();
    expect(before.width / before.height).toBeCloseTo(640 / 480, 5);

    panCamera(cam, panInputForDirection("right", 40, cam.zoom), bounds);

    const after = viewRect();
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeLessThan(before.y);
    expect(after.width).toBeCloseTo(before.width);
    expect(after.height).toBeCloseTo(before.height);
  });

  it("renders terrain from solid tile samples instead of the atlas grid", () => {
    const state = makeFixture({ width: 4, height: 4, win: { kind: "annihilate" } });
    state.entities = [];
    const fillRect = vi.fn();
    const drawImage = vi.fn();
    const ctx = new Proxy(
      {
        canvas: { width: 32, height: 32 },
        fillRect,
        drawImage,
      } as unknown as CanvasRenderingContext2D,
      {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          return value ?? vi.fn();
        },
      },
    );

    renderMinimap(ctx, state, []);

    expect(drawImage).not.toHaveBeenCalled();
    expect(fillRect).toHaveBeenCalledTimes(1 + state.width * state.height);
  });

  it("uses one faction color for all unmarked minimap entities", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(state, 0, "power", 1, 1);
    addBuilding(state, 0, "turret", 3, 1);
    addUnit(state, 0, "infantry", 1, 3);
    addBuilding(state, 1, "power", 8, 8);
    addBuilding(state, 1, "objective", 10, 8);
    addUnit(state, 1, "tank", 8, 10);
    const friendly = state.entities.filter((entity) => entity.owner === 0 && !entity.marked);
    const hostile = state.entities.filter((entity) => entity.owner === 1 && !entity.marked);

    expect(new Set(friendly.map((entity) => entityColor(entity, state))).size).toBe(1);
    expect(new Set(hostile.map((entity) => entityColor(entity, state))).size).toBe(1);

    const marked = friendly[0]!;
    marked.marked = true;
    expect(entityColor(marked, state)).toBe("#ffe066");
  });

  it("keeps minimap region classification and palette semantics coordinated", () => {
    const state = makeFixture({ width: 10, height: 10, win: { kind: "annihilate" } });
    setTile(state, 1, 1, TILE_WATER);
    setTile(state, 2, 2, TILE_RESOURCE);
    setTile(state, 3, 3, TILE_BLOCKED);
    state.heights[4 * state.width + 4] = 2;
    state.heights[5 * state.width + 5] = 3;
    state.surfaces[6 * state.width + 6] = SURFACE_ROAD;
    state.surfaces[7 * state.width + 7] = SURFACE_CONCRETE;

    expect(minimapRegionForCell(state, 1, 1)).toBe("water");
    expect(minimapRegionForCell(state, 2, 2)).toBe("resource");
    expect(minimapRegionForCell(state, 3, 3)).toBe("blocked");
    expect(minimapRegionForCell(state, 4, 4)).toBe("elevation-mid");
    expect(minimapRegionForCell(state, 5, 5)).toBe("elevation-high");
    expect(minimapRegionForCell(state, 6, 6)).toBe("road");
    expect(minimapRegionForCell(state, 7, 7)).toBe("concrete");
    expect(minimapRegionForCell(state, 0, 0)).toBe("ground");
    setTile(state, 0, 0, TILE_CLEAR);

    const colors = terrainColors("tundra grid");
    expect(colors.low).not.toBe(colors.mid);
    expect(colors.mid).not.toBe(colors.high);
    expect(colors.water).not.toBe(colors.road);
  });

  it("throttles overlay cache keys to every other sim tick", () => {
    const state = makeFixture({ width: 10, height: 10, win: { kind: "annihilate" }, seed: 832 });
    const view = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    state.tick = 2;
    const even = minimapCacheKeys(state, view, 96, 96);
    state.tick = 3;
    const odd = minimapCacheKeys(state, view, 96, 96);
    state.tick = 4;
    const next = minimapCacheKeys(state, view, 96, 96);
    expect(MINIMAP_OVERLAY_TICK_SHIFT).toBe(1);
    expect(odd.overlayKey).toBe(even.overlayKey);
    expect(next.overlayKey).not.toBe(even.overlayKey);

    const selected = minimapCacheKeys(state, view, 96, 96, new Set([1, 3]));
    expect(selected.overlayKey).not.toBe(next.overlayKey);
  });

  it("hides stranded minimap contacts until their tile is discovered", () => {
    const state = makeFixture({
      width: 12,
      height: 12,
      win: { kind: "rescue", targetCount: 1, ticks: 100 },
    });
    const stranded = addUnit(state, 0, "infantry", 8, 8);
    stranded.neutral = true;
    stranded.scenarioRole = "stranded";
    state.fog.fill(0);

    expect(minimapEntityVisible(state, stranded)).toBe(false);
    const index = fogIndex(state, stranded.x, stranded.y);
    expect(index).not.toBeNull();
    state.fog[index!] = 2;
    expect(minimapEntityVisible(state, stranded)).toBe(true);
  });
});
