import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldLoadVercelAnalytics } from "../../lib/site";

describe("Vercel Analytics loading", () => {
  it("loads only when the Vercel platform injects /_vercel/insights", () => {
    expect(shouldLoadVercelAnalytics({})).toBe(false);
    expect(shouldLoadVercelAnalytics({ NODE_ENV: "production" })).toBe(false);
    expect(shouldLoadVercelAnalytics({ VERCEL: "1" })).toBe(true);
  });

  it("keeps the root layout behind that gate", () => {
    const layout = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf-8");
    expect(layout).toContain("shouldLoadVercelAnalytics()");
    expect(layout).not.toMatch(/<Analytics\s*\/>\s*\n\s*<\/body>/);
  });
});
