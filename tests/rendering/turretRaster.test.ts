import { afterEach, describe, expect, it } from "vitest";
import { buildTurretHeadModel } from "../../lib/render/gl/modelLoader";
import {
  clearTurretRasterCache,
  drawCachedTurretModel,
  turretRasterCacheSize,
  turretRasterKey,
  TURRET_YAW_STEPS,
} from "../../lib/render/gl/turretRaster";
import type { Palette } from "../../lib/types";

const palette: Palette = {
  primary: "#4a7c59",
  secondary: "#2b4a33",
  accent: "#f5d76e",
  outline: "#111111",
  light: "#8cbf9a",
  dark: "#132016",
};

function fakeCtx(calls: string[]): CanvasRenderingContext2D {
  return {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("beginPath"),
    closePath: () => calls.push("closePath"),
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke"),
    drawImage: () => calls.push("drawImage"),
    set lineWidth(_val: number) {},
    set lineJoin(_val: CanvasLineJoin) {},
    set shadowColor(_val: string) {},
    set shadowBlur(_val: number) {},
    set fillStyle(_val: string | CanvasGradient | CanvasPattern) {},
    set strokeStyle(_val: string | CanvasGradient | CanvasPattern) {},
  } as unknown as CanvasRenderingContext2D;
}

describe("turret raster cache", () => {
  afterEach(() => {
    clearTurretRasterCache();
    Reflect.deleteProperty(globalThis, "document");
  });

  it("quantizes nearby yaw angles onto the same cache key", () => {
    const a = turretRasterKey(palette, 0.01, 0.04, 1);
    const b = turretRasterKey(palette, 0.08, 0.1, 1.05);
    const opposite = turretRasterKey(palette, Math.PI, 0, 1);
    expect(a).toBe(b);
    expect(opposite).not.toBe(a);
    expect(TURRET_YAW_STEPS).toBe(32);
  });

  it("keeps normal and anti-air heads in separate raster cache namespaces", () => {
    expect(turretRasterKey(palette, 0.2, 0.1, 1, "turret"))
      .not.toBe(turretRasterKey(palette, 0.2, 0.1, 1, "antiAirTurret"));
  });

  it("reuses one offscreen raster for matching quantized poses", () => {
    const created: unknown[] = [];
    const offscreenCalls: string[] = [];
    const worldCalls: string[] = [];
    const offscreen = fakeCtx(offscreenCalls);
    (globalThis as { document?: unknown }).document = {
      createElement(tag: string) {
        if (tag !== "canvas") throw new Error(`unexpected element ${tag}`);
        const canvas = {
          width: 0,
          height: 0,
          getContext() {
            return offscreen;
          },
        };
        created.push(canvas);
        return canvas;
      },
    };
    const model = buildTurretHeadModel();
    const world = fakeCtx(worldCalls);
    drawCachedTurretModel(world, model, 40, 40, 1, 0.02, palette, 0.05);
    drawCachedTurretModel(world, model, 80, 80, 1, 0.06, palette, 0.08);
    expect(created.length).toBe(1);
    expect(turretRasterCacheSize()).toBe(1);
    expect(offscreenCalls).toContain("fill");
    expect(worldCalls.filter((call) => call === "drawImage")).toEqual(["drawImage", "drawImage"]);
  });
});
