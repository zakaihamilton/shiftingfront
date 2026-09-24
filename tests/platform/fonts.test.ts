import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WOFF2_MAGIC = Buffer.from([0x77, 0x4f, 0x46, 0x32]); // "wOF2"

describe("Font Asset Integrity and Layout Shift Prevention", () => {
  const fontsDir = resolve(process.cwd(), "app/fonts");
  const layoutSource = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf-8");
  const layoutCss = readFileSync(resolve(process.cwd(), "app/layout.module.css"), "utf-8");

  it("ships all local font files referenced by app/layout.tsx", () => {
    const fontMatches = Array.from(layoutSource.matchAll(/path:\s*"\.\/fonts\/([^"]+)"/g)).map((m) => m[1]);
    expect(fontMatches.length).toBeGreaterThanOrEqual(9);

    for (const fontFile of fontMatches) {
      const fullPath = resolve(fontsDir, fontFile);
      expect(existsSync(fullPath), `Font file must exist: ${fontFile}`).toBe(true);
    }
  });

  it("verifies all font assets are valid WOFF2 binaries with wOF2 magic header", () => {
    const fontFiles = readdirSync(fontsDir).filter((file) => file.endsWith(".woff2"));
    expect(fontFiles.length).toBeGreaterThanOrEqual(9);

    for (const fontFile of fontFiles) {
      const fullPath = resolve(fontsDir, fontFile);
      const buffer = readFileSync(fullPath);

      // Must be at least header size (48 bytes)
      expect(buffer.length).toBeGreaterThanOrEqual(48);

      // Magic bytes check
      const magic = buffer.subarray(0, 4);
      expect(magic.equals(WOFF2_MAGIC), `Font file ${fontFile} must be a valid WOFF2 binary`).toBe(true);
    }
  });

  it("keeps font file budgets under 25KB each for instant low-latency loading", () => {
    const fontFiles = readdirSync(fontsDir).filter((file) => file.endsWith(".woff2"));

    for (const fontFile of fontFiles) {
      const stats = statSync(resolve(fontsDir, fontFile));
      // Subsetting should keep each woff2 font lean (< 25,000 bytes)
      expect(stats.size, `Font file ${fontFile} is ${stats.size} bytes (budget: 25KB)`).toBeLessThan(25_000);
      expect(stats.size, `Font file ${fontFile} is suspiciously small (< 5KB)`).toBeGreaterThan(5_000);
    }
  });

  it("configures display: 'swap' across all font declarations to eliminate FOIT", () => {
    // In next/font/local, display: "swap" ensures text is visible immediately with system fallbacks
    const swapOccurrences = (layoutSource.match(/display:\s*"swap"/g) || []).length;
    // We have 3 font families (barlowCondensed, barlow, ibmPlexMono)
    expect(swapOccurrences).toBeGreaterThanOrEqual(3);
  });

  it("provides metric-compatible system fallbacks in CSS font variables to minimize CLS", () => {
    // --font-display should fall back to Arial Narrow / sans-serif
    expect(layoutCss).toMatch(/--font-display:\s*var\([^)]+\),\s*"Arial Narrow",\s*sans-serif/);

    // --font-ui should fall back to system-ui / sans-serif
    expect(layoutCss).toMatch(/--font-ui:\s*var\([^)]+\),\s*system-ui,\s*sans-serif/);

    // --font-mono should fall back to ui-monospace / monospace
    expect(layoutCss).toMatch(/--font-mono:\s*var\([^)]+\),\s*ui-monospace,\s*monospace/);
  });
});
