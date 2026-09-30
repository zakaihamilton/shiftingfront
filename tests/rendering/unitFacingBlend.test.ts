import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unitSprite } from "../../lib/gen/svgArt";
import { generateFactions } from "../../lib/gen/factions";
import { unitFacingLayers, resetUnitFacingBlends } from "../../lib/render/unitFacingBlend";
import { drawBlendedUnitSprites, resetUnitSpriteBlend } from "../../lib/render/unitSpriteBlend";
import { computeUnitDynamicTransform, resetUnitTransformTracker, updateUnitHistory } from "../../lib/render/gl/unitTransformTracker";
import { clearRendererSessionCache } from "../../lib/render/renderer/cache";
import { addUnit, makeFixture } from "../../lib/sim/fixtures";

beforeEach(() => {
  resetUnitFacingBlends();
  resetUnitSpriteBlend();
});
afterEach(() => vi.unstubAllGlobals());

describe("visible unit turns", () => {
  it.each([90, 140])("blends authored views over %s ms with constant total weight", (duration) => {
    expect(unitFacingLayers(1, 7, 1000, duration, true)).toEqual([{ facing: 7, weight: 1 }]);
    expect(unitFacingLayers(1, 0, 1000, duration, true)).toEqual([{ facing: 7, weight: 1 }]);
    expect(unitFacingLayers(1, 0, 1000 + duration / 2, duration, true)).toEqual([
      { facing: 7, weight: 0.5 }, { facing: 0, weight: 0.5 },
    ]);
    expect(unitFacingLayers(1, 0, 1000 + duration, duration, true)).toEqual([{ facing: 0, weight: 1 }]);
  });

  it("retargets a partially completed turn from the currently visible mix", () => {
    unitFacingLayers(1, 0, 1000, 140, true);
    unitFacingLayers(1, 1, 1000, 140, true);
    const before = unitFacingLayers(1, 1, 1050, 140, true);
    expect(unitFacingLayers(1, 2, 1050, 140, true)).toEqual(before);
    const mid = unitFacingLayers(1, 2, 1120, 140, true);
    expect(mid.find((layer) => layer.facing === 2)?.weight).toBe(0.5);
    expect(mid.reduce((total, layer) => total + layer.weight, 0)).toBeCloseTo(1, 10);
    expect(unitFacingLayers(1, 2, 1190, 140, true)).toEqual([{ facing: 2, weight: 1 }]);
  });

  it("holds ready views until incoming artwork loads, then starts the fade", () => {
    expect(unitFacingLayers(1, 0, 900, 90, false)).toEqual([]);
    unitFacingLayers(1, 0, 1000, 90, true);
    expect(unitFacingLayers(1, 2, 1100, 90, false)).toEqual([{ facing: 0, weight: 1 }]);
    expect(unitFacingLayers(1, 2, 1200, 90, true)).toEqual([{ facing: 0, weight: 1 }]);
    expect(unitFacingLayers(1, 2, 1245, 90, true)).toEqual([
      { facing: 0, weight: 0.5 }, { facing: 2, weight: 0.5 },
    ]);
  });

  it("shows only one ready view under reduced motion", () => {
    unitFacingLayers(1, 0, 1000, 90, true);
    unitFacingLayers(1, 1, 1000, 90, true);
    expect(unitFacingLayers(1, 2, 1050, 90, true, true)).toEqual([{ facing: 2, weight: 1 }]);
    expect(unitFacingLayers(1, 3, 1100, 90, false, true)).toEqual([{ facing: 2, weight: 1 }]);
  });

  it.each(["removed", "tracker reset", "renderer reset"])("clears a turn after %s", (reason) => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 5, 5);
    updateUnitHistory(state, 1000);
    computeUnitDynamicTransform(unit, state, 0, 1000);
    unitFacingLayers(unit.id, 0, 1000, 90, true);
    unitFacingLayers(unit.id, 1, 1000, 90, true);
    if (reason === "removed") {
      unit.hp = 0;
      updateUnitHistory(state, 1020);
    } else if (reason === "tracker reset") resetUnitTransformTracker();
    else clearRendererSessionCache();
    expect(unitFacingLayers(unit.id, 4, 1030, 90, true)).toEqual([{ facing: 4, weight: 1 }]);
  });
});

describe("unit sprite compositing", () => {
  it("mixes facing and walk poses on an additive canvas before painting onto terrain", () => {
    const palette = generateFactions(421)[0].palette;
    const samples: { alpha: number; operation: string }[] = [];
    const scratchCtx = {
      clearRect: vi.fn(), globalAlpha: 1, globalCompositeOperation: "source-over",
      drawImage: vi.fn(() => samples.push({ alpha: scratchCtx.globalAlpha, operation: scratchCtx.globalCompositeOperation })),
    };
    const scratch = { width: 0, height: 0, getContext: () => scratchCtx };
    vi.stubGlobal("document", { createElement: () => scratch });
    const ctx = { drawImage: vi.fn(), globalAlpha: 0.7 } as unknown as CanvasRenderingContext2D;
    const layers = [0, 1, 2, 3].map((frame) => ({
      spec: unitSprite("infantry", palette, { facing: frame < 2 ? 0 : 1, animationFrame: (frame & 1) as 0 | 1, motion: "walk" }),
      img: {} as HTMLCanvasElement,
      weight: 0.25,
    }));
    drawBlendedUnitSprites(ctx, layers, 10.25, 20.5, 38, 42, 0.8);
    expect(samples).toEqual(Array.from({ length: 4 }, () => ({ alpha: 0.25, operation: "lighter" })));
    expect(ctx.drawImage).toHaveBeenCalledExactlyOnceWith(scratch, 10.25, 20.5, 38, 42);
    expect(ctx.globalAlpha).toBe(0.7);
    expect(scratchCtx.globalCompositeOperation).toBe("source-over");
  });

  it("falls back to the highest-weight layer when document is undefined (SSR/headless)", () => {
    vi.stubGlobal("document", undefined);
    const palette = generateFactions(421)[0].palette;
    const ctx = { drawImage: vi.fn(), globalAlpha: 1 } as unknown as CanvasRenderingContext2D;
    const imgA = {} as HTMLCanvasElement;
    const imgB = {} as HTMLCanvasElement;
    const layers = [
      { spec: unitSprite("infantry", palette, { facing: 0 }), img: imgA, weight: 0.3 },
      { spec: unitSprite("infantry", palette, { facing: 1 }), img: imgB, weight: 0.7 },
    ];
    drawBlendedUnitSprites(ctx, layers, 10, 20, 32, 32, 1);
    expect(ctx.drawImage).toHaveBeenCalledExactlyOnceWith(imgB, 10, 20, 32, 32);
  });

  it("avoids double rotation when rendering blended layers with rotation", () => {
    const palette = generateFactions(421)[0].palette;
    const scratchCtx = {
      clearRect: vi.fn(), globalAlpha: 1, globalCompositeOperation: "source-over",
      drawImage: vi.fn(), save: vi.fn(), translate: vi.fn(), rotate: vi.fn(), restore: vi.fn(),
    };
    const scratch = { width: 0, height: 0, getContext: () => scratchCtx };
    vi.stubGlobal("document", { createElement: () => scratch });
    const ctx = {
      drawImage: vi.fn(),
      save: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      restore: vi.fn(),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    const img = {} as HTMLCanvasElement;
    const layers = [
      { spec: { ...unitSprite("infantry", palette, { facing: 0 }), rotation: 0.5 }, img, weight: 0.5 },
      { spec: { ...unitSprite("infantry", palette, { facing: 1 }), rotation: 0.6 }, img, weight: 0.5 },
    ];
    drawBlendedUnitSprites(ctx, layers, 10, 20, 32, 32, 1);
    // ctx itself should not rotate since rotation was already baked into scratch canvas
    expect(ctx.rotate).not.toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledExactlyOnceWith(scratch, 10, 20, 32, 32);
  });
});
