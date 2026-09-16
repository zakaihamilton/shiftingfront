import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Service Worker", () => {
  it("ships a valid sw.js file in public/", () => {
    const swPath = resolve(process.cwd(), "public/sw.js");
    expect(existsSync(swPath)).toBe(true);

    const content = readFileSync(swPath, "utf-8");
    expect(content).toContain("CACHE_NAME");
    expect(content).toContain("PRECACHE_URLS");
    expect(content).toContain("addEventListener(\"install\"");
    expect(content).toContain("addEventListener(\"activate\"");
    expect(content).toContain("addEventListener(\"fetch\"");
  });

  it("precaches existing static assets", () => {
    const swPath = resolve(process.cwd(), "public/sw.js");
    const content = readFileSync(swPath, "utf-8");

    const match = content.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();

    const urls = match![1]
      .split("\n")
      .map((line) => line.trim().replace(/^["']|["'],?$/g, ""))
      .filter((line) => line.length > 0 && !line.startsWith("//"));

    expect(urls).toContain("/");
    expect(urls).toContain("/manifest.webmanifest");
    expect(urls).toContain("/tutorial");
    expect(urls).toContain("/briefing");
    expect(urls).toContain("/campaign");
    expect(urls).toContain("/play");
    expect(urls).toContain("/campaign-complete");
    expect(urls).toContain("/load");
    expect(urls).toContain("/icons/pwa-192.png");
    expect(urls).toContain("/icons/pwa-512.png");

    for (const url of urls) {
      if (url === "/" || url === "/manifest.webmanifest") continue;
      const relative = url.replace(/^\//, "");
      const publicPath = resolve(process.cwd(), "public", relative);
      const appPath = resolve(process.cwd(), "app", relative);
      const exists = existsSync(publicPath) || existsSync(appPath);
      expect(exists, `Precache asset should exist on disk: ${url}`).toBe(true);
    }
  });

  it("precaches all visual art assets under public/art", () => {
    const swPath = resolve(process.cwd(), "public/sw.js");
    const content = readFileSync(swPath, "utf-8");
    const match = content.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();

    const urls = new Set(
      match![1]
        .split("\n")
        .map((line) => line.trim().replace(/^["']|["'],?$/g, ""))
        .filter((line) => line.length > 0 && !line.startsWith("//")),
    );

    function collectFiles(dir: string, baseDir: string): string[] {
      let results: string[] = [];
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(collectFiles(full, baseDir));
        } else {
          results.push("/" + relative(baseDir, full).replace(/\\/g, "/"));
        }
      }
      return results;
    }

    const artFiles = collectFiles(resolve(process.cwd(), "public/art"), resolve(process.cwd(), "public"));
    expect(artFiles.length).toBeGreaterThanOrEqual(100);

    for (const artFile of artFiles) {
      expect(urls.has(artFile), `Missing art file in PRECACHE_URLS: ${artFile}`).toBe(true);
    }
  });

  it("supports offline navigation with query parameters and dynamic subresource discovery", () => {
    const swPath = resolve(process.cwd(), "public/sw.js");
    const content = readFileSync(swPath, "utf-8");

    // Must use ignoreSearch to allow offline navigation to ?seed=...&mission=...
    expect(content).toContain("ignoreSearch: true");

    // Must dynamically discover and cache Next.js static bundles from HTML pages
    expect(content).toContain("_next/static/");
    expect(content).toContain("matchAll");
  });
});
