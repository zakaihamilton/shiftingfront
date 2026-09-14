import { describe, expect, it, vi } from "vitest";
import { cliffFaces } from "../../lib/gen/tilePalette";
import { drawElevationFaces, fillElevationPoly, fillElevationRamp } from "../../lib/render/terrainPaint/cliffs";

function createMockCtx(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() } as unknown as CanvasGradient;
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    createLinearGradient: vi.fn(() => gradient),
  } as unknown as CanvasRenderingContext2D;
}

describe("cliff canvas painting", () => {
  it("skips polygons with fewer than three points", () => {
    const ctx = createMockCtx();
    fillElevationPoly(ctx, 10, 20, [0, 0, 4, 4]);
    expect(ctx.beginPath).not.toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it("draws and optionally strokes a translated polygon", () => {
    const ctx = createMockCtx();
    fillElevationPoly(ctx, 10, 20, [0, 0, 4, 0, 4, 4], "#123456", true);

    expect(ctx.moveTo).toHaveBeenCalledWith(10, 20);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 14, 20);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 14, 24);
    expect(ctx.closePath).toHaveBeenCalledOnce();
    expect(ctx.fill).toHaveBeenCalledOnce();
    expect(ctx.stroke).toHaveBeenCalledOnce();
    expect(ctx.fillStyle).toBe("#123456");
  });

  it("paints both cliff faces and their corner wedge", () => {
    const ctx = createMockCtx();
    drawElevationFaces(ctx, 100, 50, 64, 32, 16, 2, 2, 421, cliffFaces("ash plains", 3), 4, 7);

    expect(ctx.fill).toHaveBeenCalledTimes(10);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalled();
  });

  it("softens one-level faces without hard cliff decoration", () => {
    const ctx = createMockCtx();
    drawElevationFaces(ctx, 100, 50, 64, 32, 16, 1, 1, 421, cliffFaces("ash plains", 2), 4, 7);

    expect(ctx.fill).toHaveBeenCalledTimes(3);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("keeps the deeper side hard in a mixed-elevation corner", () => {
    const ctx = createMockCtx();
    drawElevationFaces(ctx, 100, 50, 64, 32, 16, 2, 1, 421, cliffFaces("ash plains", 3), 4, 7);

    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("fills a ramp with a blended elevation gradient", () => {
    const ctx = createMockCtx();
    fillElevationRamp(ctx, [0, 0, 8, 0, 8, 8], { x: 2, y: 3 }, { x: 6, y: 11 }, "#7f8f78", "#59675a");

    const gradient = (ctx.createLinearGradient as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value as { addColorStop: ReturnType<typeof vi.fn> };
    expect(ctx.createLinearGradient).toHaveBeenCalledWith(2, 3, 6, 11);
    expect(gradient.addColorStop).toHaveBeenNthCalledWith(1, 0, "#7f8f78");
    expect(gradient.addColorStop).toHaveBeenNthCalledWith(2, 1, "#59675a");
  });
});
