import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VISITORING_SITE_KEY } from "../../lib/site";

describe("Visitoring Analytics integration", () => {
  it("provides the configured tracking key", () => {
    expect(VISITORING_SITE_KEY).toBe("vk_Zp_7kjAOxdkBW4N3QKeXSc1gIiibCloq");
  });

  it("wraps the app with VisitoringProvider in RootLayout", () => {
    const layout = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf-8");
    expect(layout).toContain("VisitoringProvider");
    expect(layout).toContain("siteKey={VISITORING_SITE_KEY}");
  });

  it("includes Visitoring origins in Content Security Policy", () => {
    const nextConfig = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf-8");
    expect(nextConfig).toContain("https://visitoring.vercel.app");
  });
});
