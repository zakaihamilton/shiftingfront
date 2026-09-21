// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFixture, setHeight, setTile, TILE_WATER } from "../../lib/sim/fixtures";
import { SURFACE_CONCRETE } from "../../lib/types";
import { createCamera } from "../../lib/iso";
import { clearTerrainPaintCache, paintTerrainSurface } from "../../lib/render/terrainPaint/world";
import { invalidateTerrainAtlas } from "../../lib/render/terrainAtlas";

type DrawCall = unknown[];

function createContext(width: number, height: number, drawCalls: DrawCall[] = []): CanvasRenderingContext2D {
  const target = {
    canvas: { width, height },
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    createImageData: (imageWidth: number, imageHeight: number) => ({
      data: new Uint8ClampedArray(imageWidth * imageHeight * 4),
    }),
    getImageData: (_x: number, _y: number, imageWidth: number, imageHeight: number) => ({
      data: new Uint8ClampedArray(imageWidth * imageHeight * 4),
    }),
    putImageData: vi.fn(),
    drawImage: (...args: unknown[]) => drawCalls.push(args),
  };
  return new Proxy(target, {
    get(object, property, receiver) {
      if (property in object) return Reflect.get(object, property, receiver);
      return vi.fn();
    },
  }) as unknown as CanvasRenderingContext2D;
}

function paintAndCountAtlasDraws(state: ReturnType<typeof makeFixture>): number {
  const drawCalls: DrawCall[] = [];
  paintTerrainSurface(createContext(640, 480, drawCalls), state, createCamera());
  return drawCalls.length;
}

describe("live terrain surface renderer", () => {
  beforeEach(() => {
    const atlasContext = createContext(1, 1);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => atlasContext as unknown as CanvasRenderingContext2D,
    );
    clearTerrainPaintCache();
    invalidateTerrainAtlas();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the continuous atlas for concrete terrain transitions", () => {
    const clearState = makeFixture({ width: 8, height: 8, seed: 832, win: { kind: "annihilate" } });
    const concreteState = makeFixture({ width: 8, height: 8, seed: 832, win: { kind: "annihilate" } });
    const concreteIndex = 2 * concreteState.width + 2;
    concreteState.surfaces[concreteIndex] = SURFACE_CONCRETE;

    const clearDraws = paintAndCountAtlasDraws(clearState);
    clearTerrainPaintCache();
    invalidateTerrainAtlas();
    const concreteDraws = paintAndCountAtlasDraws(concreteState);

    expect(clearDraws).toBeGreaterThan(0);
    expect(concreteDraws).toBe(clearDraws);
  });

  it("renders water before a neighboring elevated tile", () => {
    const state = makeFixture({ width: 8, height: 8, seed: 832, win: { kind: "annihilate" } });
    setTile(state, 3, 3, TILE_WATER);
    setHeight(state, 3, 3, 0);
    setHeight(state, 4, 3, 1);
    setHeight(state, 3, 2, 1);
    const drawCalls: DrawCall[] = [];

    paintTerrainSurface(createContext(640, 480, drawCalls), state, createCamera());

    const waterDraw = drawCalls.findIndex((call) => call[1] === 17 * 8 - 1 && call[2] === 17 * 8 - 1);
    const elevatedLandDraw = drawCalls.findIndex((call) => call[1] === 18 * 8 - 1 && call[2] === 17 * 8 - 1);
    const elevatedNorthLandDraw = drawCalls.findIndex((call) => call[1] === 17 * 8 - 1 && call[2] === 16 * 8 - 1);
    expect(waterDraw).toBeGreaterThanOrEqual(0);
    expect(elevatedLandDraw).toBeGreaterThanOrEqual(0);
    expect(elevatedNorthLandDraw).toBeGreaterThanOrEqual(0);
    expect(waterDraw).toBeLessThan(elevatedLandDraw);
    expect(waterDraw).toBeLessThan(elevatedNorthLandDraw);
  });
});
