import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
});
