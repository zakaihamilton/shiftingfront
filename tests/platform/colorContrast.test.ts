import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    return {
      r: Number.parseInt(clean[0] + clean[0], 16),
      g: Number.parseInt(clean[1] + clean[1], 16),
      b: Number.parseInt(clean[2] + clean[2], 16),
    };
  }
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexColor(hex);
  const sR = r / 255;
  const sG = g / 255;
  const sB = b / 255;

  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  return 0.2126 * toLinear(sR) + 0.7152 * toLinear(sG) + 0.0722 * toLinear(sB);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("WCAG 2.1 Color Contrast and Legibility Matrix", () => {
  const rootCss = readFileSync(resolve(process.cwd(), "app/layout.module.css"), "utf-8");

  function getTokenHex(name: string): string {
    const match = rootCss.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,6})`));
    if (!match) throw new Error(`Could not find hex color for token: ${name}`);
    return match[1];
  }

  const voidBg = getTokenHex("--chrome-void");
  const baseBg = getTokenHex("--chrome-bg");
  const steelDeep = getTokenHex("--chrome-steel-deep");
  const steelLo = getTokenHex("--chrome-steel-lo");
  const steel = getTokenHex("--chrome-steel");
  const steelMid = getTokenHex("--chrome-steel-mid");

  const textColor = getTokenHex("--chrome-text");
  const bodyColor = getTokenHex("--chrome-body");
  const mutedColor = getTokenHex("--chrome-muted");
  const cyanColor = getTokenHex("--chrome-cyan");
  const goldColor = getTokenHex("--chrome-gold");
  const alertColor = getTokenHex("--chrome-alert");
  const focusColor = getTokenHex("--chrome-focus");
  const successColor = getTokenHex("--chrome-success");
  const warningColor = getTokenHex("--chrome-warning");

  it("satisfies WCAG AAA (>= 7:1) for primary chrome text on dark background surfaces", () => {
    const surfaces = [voidBg, baseBg, steelDeep, steelLo, steel, steelMid];

    for (const surface of surfaces) {
      const ratio = contrastRatio(textColor, surface);
      expect(ratio, `Primary text on ${surface} must meet WCAG AAA (7:1)`).toBeGreaterThanOrEqual(7.0);
    }
  });

  it("satisfies WCAG AA (>= 4.5:1) for body copy text on interactive surfaces", () => {
    const surfaces = [voidBg, baseBg, steelDeep, steelLo, steel];

    for (const surface of surfaces) {
      const ratio = contrastRatio(bodyColor, surface);
      expect(ratio, `Body text on ${surface} must meet WCAG AA (4.5:1)`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("satisfies WCAG AA (>= 4.5:1) for secondary muted captions on dark backgrounds", () => {
    const darkSurfaces = [voidBg, baseBg, steelDeep, steelLo];

    for (const surface of darkSurfaces) {
      const ratio = contrastRatio(mutedColor, surface);
      expect(ratio, `Muted caption text on ${surface} must meet WCAG AA (4.5:1)`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("satisfies WCAG AAA (>= 7:1) for cyan and gold accent text on dark background surfaces", () => {
    const darkSurfaces = [voidBg, baseBg, steelDeep, steelLo];

    for (const surface of darkSurfaces) {
      const cyanRatio = contrastRatio(cyanColor, surface);
      expect(cyanRatio, `Cyan accent on ${surface} must meet WCAG AAA (7:1)`).toBeGreaterThanOrEqual(7.0);

      const goldRatio = contrastRatio(goldColor, surface);
      expect(goldRatio, `Gold accent on ${surface} must meet WCAG AAA (7:1)`).toBeGreaterThanOrEqual(7.0);
    }
  });

  it("satisfies WCAG 2.1 Non-Text Contrast (>= 3:1) for focus indicator rings", () => {
    const surfaces = [voidBg, baseBg, steelDeep, steelLo, steel, steelMid];

    for (const surface of surfaces) {
      const ratio = contrastRatio(focusColor, surface);
      expect(ratio, `Focus ring on ${surface} must meet non-text contrast (3:1)`).toBeGreaterThanOrEqual(3.0);
    }
  });

  it("guarantees status indicators (success, warning, alert) maintain distinct legible contrast", () => {
    const successRatio = contrastRatio(successColor, baseBg);
    const warningRatio = contrastRatio(warningColor, baseBg);
    const alertRatio = contrastRatio(alertColor, baseBg);

    expect(successRatio).toBeGreaterThanOrEqual(4.5);
    expect(warningRatio).toBeGreaterThanOrEqual(4.5);
    expect(alertRatio).toBeGreaterThanOrEqual(4.5);
  });
});
