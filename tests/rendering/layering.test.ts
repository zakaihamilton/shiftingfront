import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "lib");
const LAYERS = ["gen", "sim"] as const;
const IMPORT_RE = /(?:from|import)\s*["']([^"']+)["']/g;
const FORBIDDEN_PREFIXES = [
  "../render",
  "../audio",
  "../game",
  "../ui",
  "../../components",
  "@/lib/render",
  "@/lib/audio",
  "@/lib/game",
  "@/components",
  "react",
  "react-dom",
  "next",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

function isForbidden(specifier: string): boolean {
  return FORBIDDEN_PREFIXES.some(
    (prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`),
  );
}

describe("headless layering", () => {
  it("keeps lib/gen and lib/sim free of renderer, HUD, and framework imports", () => {
    const leaks: string[] = [];
    for (const layer of LAYERS) {
      for (const file of sourceFiles(join(ROOT, layer))) {
        const source = readFileSync(file, "utf8");
        for (const match of source.matchAll(IMPORT_RE)) {
          const specifier = match[1]!;
          if (!isForbidden(specifier)) continue;
          leaks.push(`${file.slice(ROOT.length + 1)} → ${specifier}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
