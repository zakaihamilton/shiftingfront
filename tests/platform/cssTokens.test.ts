import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function collectCssModules(dir: string): string[] {
  let results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== ".git") {
        results = results.concat(collectCssModules(full));
      }
    } else if (entry.name.endsWith(".module.css")) {
      results.push(full);
    }
  }
  return results;
}

const RUNTIME_INJECTED_VARS = new Set([
  "--a",
  "--p",
  "--cameo-remain",
  "--ping-x",
  "--ping-y",
  "--scene-art",
  "--mission-art",
  "--result-art",
  "--campaign-art",
  "--dossier-art",
  "--font-barlow",
  "--font-barlow-condensed",
  "--font-ibm-plex-mono",
]);

describe("CSS Tokens and Design System Governance", () => {
  const rootCss = readFileSync(resolve(process.cwd(), "app/layout.module.css"), "utf-8");
  const rootTokens = new Set<string>();
  for (const match of rootCss.matchAll(/--([a-zA-Z0-9_-]+)\s*:/g)) {
    rootTokens.add(`--${match[1]}`);
  }

  const cssFiles = [
    ...collectCssModules(resolve(process.cwd(), "app")),
    ...collectCssModules(resolve(process.cwd(), "components")),
  ];

  it("declares all foundational semantic tokens in layout.module.css", () => {
    const essentialTokens = [
      "--chrome-void",
      "--chrome-bg",
      "--chrome-steel-deep",
      "--chrome-steel-lo",
      "--chrome-steel",
      "--chrome-steel-mid",
      "--chrome-steel-hi",
      "--chrome-bevel",
      "--chrome-inset",
      "--chrome-cyan",
      "--chrome-text",
      "--chrome-body",
      "--chrome-muted",
      "--chrome-gold",
      "--chrome-alert",
      "--chrome-surface",
      "--chrome-focus",
      "--chrome-radius-xs",
      "--chrome-radius-sm",
      "--chrome-radius",
      "--chrome-radius-lg",
      "--font-display",
      "--font-ui",
      "--font-mono",
      "--hud-scale",
      "--space-1",
      "--space-2",
      "--space-3",
      "--space-4",
      "--space-5",
      "--space-6",
      "--text-2xs",
      "--text-xs",
      "--text-sm",
      "--text-base",
      "--text-md",
      "--text-lg",
      "--text-xl",
    ];

    for (const token of essentialTokens) {
      expect(rootTokens.has(token), `Missing essential root design token: ${token}`).toBe(true);
    }
  });

  it("guarantees every var(--token) used across all CSS modules is defined", () => {
    const unknownUsages: Array<{ file: string; variable: string; line: number }> = [];

    for (const file of cssFiles) {
      const content = readFileSync(file, "utf-8");
      const localTokens = new Set<string>();
      for (const match of content.matchAll(/--([a-zA-Z0-9_-]+)\s*:/g)) {
        localTokens.add(`--${match[1]}`);
      }

      const lines = content.split("\n");
      lines.forEach((line, index) => {
        for (const match of line.matchAll(/var\(\s*--([a-zA-Z0-9_-]+)/g)) {
          const varName = `--${match[1]}`;
          const isDefined =
            rootTokens.has(varName) ||
            localTokens.has(varName) ||
            RUNTIME_INJECTED_VARS.has(varName);

          if (!isDefined) {
            unknownUsages.push({
              file: file.replace(process.cwd() + "/", ""),
              variable: varName,
              line: index + 1,
            });
          }
        }
      });
    }

    expect(unknownUsages).toEqual([]);
  });

  it("enforces that font-family declarations only use design system font tokens", () => {
    const invalidFontUsages: Array<{ file: string; line: number; declaration: string }> = [];

    for (const file of cssFiles) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        const fontMatch = line.match(/font-family:\s*([^;]+);/);
        if (fontMatch) {
          const value = fontMatch[1].trim();
          const isValid =
            value === "inherit" ||
            value.includes("var(--font-ui") ||
            value.includes("var(--font-display") ||
            value.includes("var(--font-mono") ||
            value.includes("var(--font-barlow");

          if (!isValid) {
            invalidFontUsages.push({
              file: file.replace(process.cwd() + "/", ""),
              line: index + 1,
              declaration: value,
            });
          }
        }
      });
    }

    expect(invalidFontUsages).toEqual([]);
  });

  it("scales semantic typography tokens with --hud-scale", () => {
    const typographyTokens = [
      "--text-2xs",
      "--text-xs",
      "--text-sm",
      "--text-base",
      "--text-md",
      "--text-lg",
      "--text-xl",
    ];

    for (const token of typographyTokens) {
      const regex = new RegExp(`${token}:\\s*calc\\([^;]*var\\(--hud-scale[^;]*\\);`);
      expect(
        regex.test(rootCss),
        `Typography token ${token} should be wrapped in calc() with var(--hud-scale)`,
      ).toBe(true);
    }
  });

  it("keeps spacing scale on clean 0.25rem (4px) increments", () => {
    const spaceTokens = [
      ["--space-1", "0.25rem"],
      ["--space-2", "0.5rem"],
      ["--space-3", "0.75rem"],
      ["--space-4", "1rem"],
      ["--space-5", "1.25rem"],
      ["--space-6", "1.5rem"],
    ] as const;

    for (const [token, expectedValue] of spaceTokens) {
      const regex = new RegExp(`${token}:\\s*${expectedValue};`);
      expect(regex.test(rootCss), `Spacing token ${token} must equal ${expectedValue}`).toBe(true);
    }
  });
});
