import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentsRoot = join(process.cwd(), "components");
const featureRoots = ["menu", "game", "campaign", "briefing", "portraits", "assets"];
const sharedRoots = ["ui", "shared", "settings", "save", "audio"];
const importPattern = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

function componentPath(importer: string, specifier: string): string | null {
  if (specifier.startsWith("@/components/")) return resolve(componentsRoot, specifier.slice("@/components/".length));
  if (specifier.startsWith(".")) {
    const candidate = resolve(dirname(importer), specifier);
    return candidate.startsWith(`${componentsRoot}/`) ? candidate : null;
  }
  return null;
}

describe("component import boundaries", () => {
  it("keeps feature folders from importing unrelated feature folders", () => {
    const violations: string[] = [];
    for (const feature of featureRoots) {
      const root = join(componentsRoot, feature);
      for (const file of sourceFiles(root)) {
        const source = readFileSync(file, "utf8");
        for (const match of source.matchAll(importPattern)) {
          const target = componentPath(file, match[1]);
          if (!target) continue;
          const targetRelative = relative(componentsRoot, target);
          const targetRoot = targetRelative.split(/[\\/]/)[0];
          if (targetRoot === feature || sharedRoots.includes(targetRoot)) continue;
          if (featureRoots.includes(targetRoot)) violations.push(`${relative(process.cwd(), file)} -> ${targetRelative}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
