import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("security headers", () => {
  it("ships a real CSP that still allows portal embeds and Vercel Analytics", () => {
    const source = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf-8");

    expect(source).toContain("default-src 'self'");
    expect(source).toContain("script-src 'self' 'unsafe-inline'");
    expect(source).toContain("https://va.vercel-scripts.com");
    expect(source).toContain("https://vitals.vercel-insights.com");
    expect(source).toContain("object-src 'none'");
    expect(source).toContain("frame-ancestors 'self' https://*.itch.io https://itch.io https://*.newgrounds.com https://*.crazygames.com");
  });
});
