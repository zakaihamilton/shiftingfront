import { describe, expect, it, vi } from "vitest";
import { drawSprite } from "../../lib/render/sprites";
import { unitSpriteDrawPosition } from "../../lib/render/renderer/world/entities";
import type { Palette, SpriteSpec } from "../../lib/types";

const palette: Palette = {
  primary: "#4a7",
  secondary: "#253",
  accent: "#fd0",
  outline: "#111",
  light: "#8c8",
  dark: "#131",
};

function createContext() {
  return {
    drawImage: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("sprite drawing", () => {
  it("preserves fractional positions for moving human sprites", () => {
    const moving = unitSpriteDrawPosition({
      screenX: 100.37,
      groundY: 140.61,
      anchorX: 19,
      anchorY: 42,
      bob: -0.2,
      recoilX: 0,
      recoilY: 0,
      smooth: true,
    });
    const staticPosition = unitSpriteDrawPosition({
      screenX: 100.37,
      groundY: 140.61,
      anchorX: 19,
      anchorY: 42,
      bob: -0.2,
      recoilX: 0,
      recoilY: 0,
      smooth: false,
    });

    expect(moving.dx).toBeCloseTo(81.37, 8);
    expect(moving.dy).toBeCloseTo(98.41, 8);
    expect(staticPosition).toEqual({ dx: 81, dy: 98 });
  });

  it("crops to content bounds with smooth raster settings", () => {
    const ctx = createContext();
    const image = {} as CanvasImageSource;
    const spec: SpriteSpec = {
      id: "preview-building",
      kind: "building",
      w: 100,
      h: 80,
      palette,
      shapes: [],
      imageSrc: "/art/preview-building.webp",
    };
    const smoothingAtDraw: boolean[] = [];
    const qualityAtDraw: string[] = [];
    (ctx.drawImage as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      smoothingAtDraw.push(ctx.imageSmoothingEnabled);
      qualityAtDraw.push(ctx.imageSmoothingQuality);
    });

    drawSprite(ctx, spec, image, 11, 22, 138, 69, { minX: 8, minY: 12, width: 40, height: 20 });

    expect(ctx.drawImage).toHaveBeenCalledWith(image, 8, 12, 40, 20, 11, 22, 138, 69);
    expect(smoothingAtDraw).toEqual([true]);
    expect(qualityAtDraw).toEqual(["high"]);
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });
});
