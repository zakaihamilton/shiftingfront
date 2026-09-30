import { describe, expect, it, vi } from "vitest";
import {
  GROUND_DUST_FILL,
  UNIT_SHADOW_FILL,
  UNIT_SHADOW_OFFSET_X,
  UNIT_SHADOW_OFFSET_Y,
  drawUnitShadow,
  movementDustFill,
  paintUnitMovementFx,
  unitShadowRadii,
} from "../../lib/render/unitMotion";
import type { UnitKind } from "../../lib/types";

const TREAD_TICK_FILL = "#b7d6d7";

describe("unit shadows", () => {
  it("keeps a 2:1 isometric ellipse for every unit kind", () => {
    const kinds: UnitKind[] = ["infantry", "antiArmor", "tank", "harvester"];
    for (const kind of kinds) {
      const { radX, radY } = unitShadowRadii(kind, 2);
      expect(radX / radY).toBe(2);
    }
    expect(unitShadowRadii("infantry", 1).radX).toBeLessThan(unitShadowRadii("antiArmor", 1).radX);
    expect(unitShadowRadii("antiArmor", 1).radX).toBeLessThan(unitShadowRadii("harvester", 1).radX);
    expect(unitShadowRadii("harvester", 1).radX).toBeLessThan(unitShadowRadii("tank", 1).radX);
  });

  it("centers a contact ellipse directly beneath ground units", () => {
    const ellipse = vi.fn();
    const translate = vi.fn();
    const fills: string[] = [];
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      translate,
      ellipse,
      globalAlpha: 1,
      set fillStyle(value: string | CanvasGradient | CanvasPattern) {
        fills.push(String(value));
      },
    } as unknown as CanvasRenderingContext2D;

    drawUnitShadow(ctx, "infantry", 40, 80, 1, 1, false);

    expect(ellipse).toHaveBeenCalledTimes(1);
    expect(ellipse).toHaveBeenCalledWith(40, 80, 10, 5, 0, 0, Math.PI * 2);
    expect(translate).toHaveBeenCalledWith(0, 0);
    expect(UNIT_SHADOW_OFFSET_X).toBe(0);
    expect(UNIT_SHADOW_OFFSET_Y).toBe(0);
    expect(fills).toEqual([UNIT_SHADOW_FILL]);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});

describe("unit movement ground dust", () => {
  function createMockCtx() {
    const fills: string[] = [];
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      ellipse: vi.fn(),
      globalAlpha: 1,
      set fillStyle(value: string | CanvasGradient | CanvasPattern) {
        fills.push(String(value));
      },
      get fills() {
        return fills;
      },
    };
    return ctx as typeof ctx & CanvasRenderingContext2D;
  }

  it("puffs walker dust on stride plant and never strokes sprite geometry", () => {
    const planted = createMockCtx();
    paintUnitMovementFx(planted, "infantry", 10, 20, 30, 40, 80, 1, 0, 1, { strideRatio: 0 });
    expect(planted.ellipse).toHaveBeenCalledTimes(2);
    expect(planted.fills).toEqual([GROUND_DUST_FILL]);
    expect(planted.stroke).not.toHaveBeenCalled();
    expect(planted.fillRect).not.toHaveBeenCalled();

    const midStride = createMockCtx();
    paintUnitMovementFx(midStride, "infantry", 10, 20, 30, 40, 80, 1, 0, 1, { strideRatio: 0.5 });
    expect(midStride.ellipse).not.toHaveBeenCalled();
  });

  it("draws a vehicle dust trail without cyan tread ticks", () => {
    const ctx = createMockCtx();
    paintUnitMovementFx(ctx, "tank", 10, 20, 40, 30, 80, 1, 1, 1);

    expect(ctx.ellipse).toHaveBeenCalledTimes(3);
    expect(ctx.fills).toEqual([GROUND_DUST_FILL]);
    expect(ctx.fills).not.toContain(TREAD_TICK_FILL);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("tints dust by biome and removes it for reduced motion", () => {
    expect(movementDustFill("tundra grid")).not.toBe(GROUND_DUST_FILL);
    expect(movementDustFill("ash plains")).toBe(GROUND_DUST_FILL);
    const ctx = createMockCtx();
    paintUnitMovementFx(ctx, "tank", 10, 20, 40, 30, 80, 1, 1, 1, { reducedMotion: true });
    expect(ctx.ellipse).not.toHaveBeenCalled();
  });
});
