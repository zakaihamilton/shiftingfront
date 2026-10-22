// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderPixelRatio } from "../../components/game/renderDimensions";
import { canvasPointerPos } from "../../components/game/hooks/canvasPointer";
import { createCamera, TILE_H, tileToScreen } from "../../lib/iso";
import { makeFixture } from "../../lib/sim/fixtures";
import { cameraPanBounds, focusCameraAtTile } from "../../lib/render/camera";
import { pickTile } from "../../lib/render/renderPicking";
import {
  canvasViewport, drawRenderCanvas, prepareRenderContext, resizeRenderCanvas, transformedCanvasPoint,
} from "../../lib/render/canvasViewport";

describe("display density and logical game coordinates", () => {
  it.each([0.5, 1, 1.5, 2])("preserves camera focus and tile picking at %s× density", density => {
    const canvas = document.createElement("canvas");
    const viewport = { width: 800, height: 600 };
    resizeRenderCanvas(canvas, viewport, density);
    const rect = { left: 20, top: 40, width: 800, height: 600 } as DOMRect;
    canvas.getBoundingClientRect = () => rect;
    const state = makeFixture({ width: 40, height: 40, win: { kind: "annihilate" } });
    state.heights.fill(0);
    const camera = createCamera();
    const logical = canvasViewport(canvas);
    const bounds = cameraPanBounds(state.width, state.height, logical.width, logical.height);
    focusCameraAtTile(camera, 20, 20, bounds);
    const tile = tileToScreen(20, 20, camera, 0);
    const point = canvasPointerPos({
      currentTarget: canvas,
      clientX: rect.left + tile.x,
      clientY: rect.top + tile.y + TILE_H * camera.zoom / 2,
    });
    expect(point.x).toBeCloseTo(400);
    expect(pickTile(state, point.x, point.y, camera)).toEqual({ x: 20, y: 20 });
    expect(canvas.width).toBe(Math.round(800 * density));
  });

  it("keeps transformed muzzle sockets in logical space at high density", () => {
    const canvas = document.createElement("canvas");
    resizeRenderCanvas(canvas, { width: 800, height: 600 }, 2);
    const ctx = {
      canvas,
      setTransform: vi.fn(),
      // 2× backing scale, plus a local 10px/5px body translation.
      getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 20, f: 10 }),
    } as unknown as CanvasRenderingContext2D;
    prepareRenderContext(ctx);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(transformedCanvasPoint(ctx, 100, 80)).toEqual({ x: 110, y: 85 });
  });

  it("composites dense cached terrain without doubling its screen size", () => {
    const layer = document.createElement("canvas");
    resizeRenderCanvas(layer, { width: 1100, height: 900 }, 2);
    const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    drawRenderCanvas(ctx, layer, -150, -150);
    expect(ctx.drawImage).toHaveBeenCalledWith(layer, -150, -150, 1100, 900);
  });

  it("caps backing-store work on Retina and large touch displays", () => {
    expect(renderPixelRatio({ width: 800, height: 600 }, 3, false)).toBe(2);
    expect(renderPixelRatio({ width: 800, height: 600 }, 3, true)).toBe(1.5);
    expect(renderPixelRatio({ width: 800, height: 600 }, 2, false, 160)).toBe(1.5);
    expect(renderPixelRatio({ width: 800, height: 600 }, 2, false, 300)).toBe(1);
    for (const touch of [false, true]) {
      const viewport = { width: 3840, height: 2160 };
      const ratio = renderPixelRatio(viewport, 3, touch);
      expect(viewport.width * viewport.height * ratio ** 2).toBeLessThanOrEqual((touch ? 1_500_000 : 4_000_000) + 1);
    }
    expect(renderPixelRatio({ width: 800, height: 600 }, NaN, false)).toBe(1);
  });
});
