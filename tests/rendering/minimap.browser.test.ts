// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fogIndex } from "../../lib/sim/fog";
import { makeFixture } from "../../lib/sim/fixtures";
import { invalidateTerrainAtlas } from "../../lib/render/terrainAtlas";
import { invalidateMinimap, renderMinimap } from "../../lib/render/minimap";

function createContext(width: number, height: number, drawCalls: unknown[][]): CanvasRenderingContext2D {
  const context = {
    canvas: { width, height },
    createImageData: (imageWidth: number, imageHeight: number) => ({
      data: new Uint8ClampedArray(imageWidth * imageHeight * 4),
    }),
    getImageData: (_x: number, _y: number, imageWidth: number, imageHeight: number) => ({
      data: new Uint8ClampedArray(imageWidth * imageHeight * 4),
    }),
    putImageData: vi.fn(),
    clearRect: vi.fn(),
    drawImage: (...args: unknown[]) => drawCalls.push(args),
    save: vi.fn(),
    restore: vi.fn(),
  };
  return new Proxy(context, {
    get(target, property, receiver) {
      if (property in target) return Reflect.get(target, property, receiver);
      return vi.fn();
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe("browser minimap terrain cache", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => createContext(1, 1, []) as unknown as RenderingContext,
    );
    invalidateTerrainAtlas();
    invalidateMinimap();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the browser detail layer and avoids redrawing unchanged visible tiles", () => {
    const drawCalls: unknown[][] = [];
    const context = createContext(64, 64, drawCalls);
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(
      () => context as unknown as RenderingContext,
    );
    const state = makeFixture({ width: 4, height: 4, seed: 832, win: { kind: "annihilate" } });
    state.entities = [];

    renderMinimap(context, state, []);
    const initialDraws = drawCalls.length;
    expect(initialDraws).toBeGreaterThan(state.width * state.height);

    state.tick = 16;
    renderMinimap(context, state, []);
    expect(drawCalls.length - initialDraws).toBe(1);

    const fogCell = fogIndex(state, 0, 0);
    expect(fogCell).not.toBeNull();
    state.fog[fogCell!] = 0;
    state.tick = 32;
    renderMinimap(context, state, []);
    expect(drawCalls.length - initialDraws).toBe(4);
  });
});
