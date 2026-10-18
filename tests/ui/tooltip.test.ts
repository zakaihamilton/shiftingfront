import { describe, expect, it } from "vitest";
import { EDGE_PAN_BAND, EDGE_PAN_DELAY_MS, panDirFromPointer } from "../../lib/render/camera";
import { parseTooltipPos, placeTooltip, TOOLTIP_PAD, tooltipMaxBox } from "../../lib/ui/tooltip";

describe("edge pan from pointer", () => {
  it("waits 250ms before activating edge scroll", () => {
    expect(EDGE_PAN_DELAY_MS).toBe(250);
  });

  it("returns null away from the rim so map clicks stay selectable", () => {
    expect(panDirFromPointer(200, 200, 800, 600)).toBeNull();
    expect(panDirFromPointer(EDGE_PAN_BAND + 1, 200, 800, 600)).toBeNull();
  });

  it("picks the nearest edge inside the hover band", () => {
    expect(panDirFromPointer(4, 200, 800, 600)).toBe("left");
    expect(panDirFromPointer(796, 200, 800, 600)).toBe("right");
    expect(panDirFromPointer(400, 3, 800, 600)).toBe("up");
    expect(panDirFromPointer(400, 597, 800, 600)).toBe("down");
  });

  it("scrolls diagonally from the three map corners", () => {
    expect(panDirFromPointer(2, 10, 800, 600)).toBe("up-left");
    expect(panDirFromPointer(10, 598, 800, 600)).toBe("down-left");
    expect(panDirFromPointer(798, 598, 800, 600)).toBe("down-right");
  });

  it("keeps the top-right corner free for the mission directive", () => {
    expect(panDirFromPointer(798, 10, 800, 600)).toBeNull();
  });

  it("skips unavailable directions", () => {
    expect(panDirFromPointer(4, 200, 800, 600, EDGE_PAN_BAND, {
      left: false,
      right: true,
      up: true,
      down: true,
    })).toBeNull();
  });

  it("checks diagonal availability directly at battlefield corners", () => {
    const cardinalAvailability = { left: false, right: true, up: true, down: true };
    expect(panDirFromPointer(10, 598, 800, 600, EDGE_PAN_BAND, cardinalAvailability, (dir) => dir === "down-left"))
      .toBe("down-left");
    expect(panDirFromPointer(10, 598, 800, 600, EDGE_PAN_BAND, cardinalAvailability, () => false))
      .toBe("down");
  });
});

describe("floating tooltips", () => {
  it("parses placement attributes", () => {
    expect(parseTooltipPos("below")).toBe("below");
    expect(parseTooltipPos("left")).toBe("left");
    expect(parseTooltipPos(null)).toBe("above");
  });

  it("parses right and inset positions", () => {
    expect(parseTooltipPos("right")).toBe("right");
    expect(parseTooltipPos("inset")).toBe("inset");
  });

  it("parses explicit above string", () => {
    expect(parseTooltipPos("above")).toBe("above");
  });

  it("returns above for undefined input", () => {
    expect(parseTooltipPos(undefined)).toBe("above");
  });

  it("returns above for unrecognized strings", () => {
    expect(parseTooltipPos("random")).toBe("above");
  });

  it("caps tooltip size to the padded viewport so copy can wrap instead of clipping", () => {
    expect(tooltipMaxBox({ width: 400, height: 300 })).toEqual({
      width: 400 - TOOLTIP_PAD * 2,
      height: 300 - TOOLTIP_PAD * 2,
    });
  });

  it("respects custom pad in tooltipMaxBox", () => {
    expect(tooltipMaxBox({ width: 400, height: 300 }, 16)).toEqual({
      width: 368,
      height: 268,
    });
  });

  it("stays inside the viewport when the anchor is scrolled near a clip edge", () => {
    const placed = placeTooltip(
      { top: 8, left: 20, width: 80, height: 40 },
      { width: 140, height: 28 },
      "above",
      { width: 400, height: 300 },
    );
    expect(placed.top).toBeGreaterThanOrEqual(8);
    expect(placed.left).toBeGreaterThanOrEqual(8);
    expect(placed.top + 28).toBeLessThanOrEqual(300 - 8);
    expect(placed.left + 140).toBeLessThanOrEqual(400 - 8);
  });

  it("flips a left tooltip to the right when it would overflow", () => {
    const placed = placeTooltip(
      { top: 80, left: 10, width: 40, height: 20 },
      { width: 120, height: 24 },
      "left",
      { width: 400, height: 300 },
    );
    expect(placed.left).toBeGreaterThan(50);
  });

  it("flips a right tooltip to the left when it would overflow", () => {
    const placed = placeTooltip(
      { top: 80, left: 380, width: 40, height: 20 },
      { width: 120, height: 24 },
      "right",
      { width: 400, height: 300 },
    );
    expect(placed.left).toBeLessThan(300);
  });

  it("positions below the anchor and flips up when near the bottom", () => {
    const placed = placeTooltip(
      { top: 280, left: 200, width: 40, height: 20 },
      { width: 100, height: 30 },
      "below",
      { width: 400, height: 320 },
    );
    expect(placed.top).toBeLessThan(280);
  });

  it("positions below without flipping when there is room", () => {
    const placed = placeTooltip(
      { top: 50, left: 200, width: 40, height: 20 },
      { width: 100, height: 30 },
      "below",
      { width: 400, height: 400 },
    );
    expect(placed.top).toBeGreaterThanOrEqual(50 + 20 + 6);
  });

  it("centers an inset tooltip on the anchor", () => {
    const placed = placeTooltip(
      { top: 100, left: 200, width: 40, height: 20 },
      { width: 100, height: 30 },
      "inset",
      { width: 400, height: 400 },
    );
    expect(placed.top).toBe(110 - 15);
    expect(placed.left).toBe(220 - 50);
  });

  it("flips above tooltip down when near the top", () => {
    const placed = placeTooltip(
      { top: 5, left: 200, width: 40, height: 20 },
      { width: 100, height: 30 },
      "above",
      { width: 400, height: 400 },
    );
    expect(placed.top).toBeGreaterThan(5 + 20);
  });

  it("uses custom gap and pad parameters", () => {
    const placed = placeTooltip(
      { top: 100, left: 200, width: 40, height: 20 },
      { width: 80, height: 24 },
      "above",
      { width: 400, height: 400 },
      12,
      16,
    );
    expect(placed.top).toBeGreaterThanOrEqual(16);
    expect(placed.left).toBeGreaterThanOrEqual(16);
  });

  it("keeps a wide tooltip inside the viewport near a right edge", () => {
    const size = { width: 280, height: 36 };
    const view = { width: 400, height: 300 };
    const placed = placeTooltip(
      { top: 80, left: 350, width: 40, height: 20 },
      size,
      "above",
      view,
    );
    expect(placed.left).toBeGreaterThanOrEqual(TOOLTIP_PAD);
    expect(placed.left + size.width).toBeLessThanOrEqual(view.width - TOOLTIP_PAD);
    expect(placed.top).toBeGreaterThanOrEqual(TOOLTIP_PAD);
    expect(placed.top + size.height).toBeLessThanOrEqual(view.height - TOOLTIP_PAD);
  });
});
