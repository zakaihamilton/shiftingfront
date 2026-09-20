// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCamera } from "../../lib/iso";
import { makeFixture } from "../../lib/sim/fixtures";
import {
  clearTerrainAtmosphereCache,
  paintTerrainAtmosphere,
} from "../../lib/render/terrainAtmosphere";
import { paintTerrainWeather } from "../../lib/render/terrainWeather";
import { terrainAtmosphereFrame } from "../../lib/render/terrainLighting";

function createContext(width: number, height: number) {
  const gradient = { addColorStop: vi.fn() };
  const stack: number[] = [];
  let alpha = 1;
  const ctx = {
    canvas: { width, height },
    get globalAlpha() { return alpha; },
    set globalAlpha(value: number) { alpha = value; },
    globalCompositeOperation: "source-over",
    fillStyle: "",
    save() { stack.push(alpha); },
    restore() { alpha = stack.pop() ?? 1; },
    setTransform: vi.fn(),
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    createLinearGradient: vi.fn(() => gradient),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fill: ctx.fill as unknown as ReturnType<typeof vi.fn> };
}

describe("terrain atmosphere", () => {
  beforeEach(() => {
    clearTerrainAtmosphereCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("animates deterministically while reduced motion freezes the phase", () => {
    const a = terrainAtmosphereFrame(832, 1200);
    expect(terrainAtmosphereFrame(832, 1200)).toEqual(a);
    expect(terrainAtmosphereFrame(832, 7200)).not.toEqual(a);
    expect(terrainAtmosphereFrame(832, 1200, true)).toEqual(terrainAtmosphereFrame(832, 7200, true));
    expect(a.glowAlpha).toBeLessThanOrEqual(0.06);
    expect(a.hazeAlpha).toBeLessThanOrEqual(0.024);
  });

  it("masks atmospheric lighting out of unexplored terrain", () => {
    const context = createContext(640, 480);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => context.ctx as unknown as CanvasRenderingContext2D,
    );
    const hidden = makeFixture({ width: 12, height: 12, seed: 832, win: { kind: "annihilate" } });
    hidden.fog.fill(0);
    paintTerrainAtmosphere(context.ctx, hidden, createCamera(), 1200);
    const hiddenFills = context.fill.mock.calls.length;

    clearTerrainAtmosphereCache();
    const visible = makeFixture({ width: 12, height: 12, seed: 832, win: { kind: "annihilate" } });
    visible.fog.fill(2);
    paintTerrainAtmosphere(context.ctx, visible, createCamera(), 1200);
    expect(context.fill.mock.calls.length).toBeGreaterThan(hiddenFills);
    expect((context.ctx.drawImage as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it("disables moving weather when reduced motion is enabled", () => {
    const state = makeFixture({ width: 12, height: 12, seed: 832, win: { kind: "annihilate" } });
    const save = vi.fn();
    const ctx = { canvas: { width: 640, height: 480 }, save } as unknown as CanvasRenderingContext2D;
    paintTerrainWeather(ctx, state, createCamera(), 1200, true);
    expect(save).not.toHaveBeenCalled();
  });
});
