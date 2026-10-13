import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VISITORING_SITE_KEY, shouldLoadVisitoring } from "../../lib/site";

describe("Visitoring Analytics integration", () => {
  it("provides the configured tracking key", () => {
    expect(VISITORING_SITE_KEY).toBe("vk_Zp_7kjAOxdkBW4N3QKeXSc1gIiibCloq");
  });

  it("gates visitoring loading based on environment", () => {
    expect(shouldLoadVisitoring({ NEXT_PUBLIC_DISABLE_ANALYTICS: "1" })).toBe(false);
    expect(shouldLoadVisitoring({ PLAYWRIGHT_PORT: "3100" })).toBe(false);
    expect(shouldLoadVisitoring({ VERCEL: "1", NODE_ENV: "production" })).toBe(true);
    expect(shouldLoadVisitoring({ NODE_ENV: "production" })).toBe(false);
    expect(shouldLoadVisitoring({ NODE_ENV: "development" })).toBe(false);
    expect(shouldLoadVisitoring({ NODE_ENV: "test" })).toBe(false);
    expect(shouldLoadVisitoring({ NODE_ENV: "test", NEXT_PUBLIC_VISITORING_SITE_KEY: "vk_test" })).toBe(true);
  });

  it("wraps the app with VisitoringProvider behind shouldLoadVisitoring in RootLayout", () => {
    const layout = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf-8");
    expect(layout).toContain("shouldLoadVisitoring()");
    expect(layout).toContain("VisitoringProvider");
    expect(layout).toContain("siteKey={VISITORING_SITE_KEY}");
  });

  it("includes Visitoring origins in Content Security Policy", () => {
    const nextConfig = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf-8");
    expect(nextConfig).toContain("https://visitoring.vercel.app");
  });
});
