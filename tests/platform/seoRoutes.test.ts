import { describe, expect, it } from "vitest";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";
import { SITE_URL } from "../../lib/site";

describe("robots.txt configuration", () => {
  it("allows crawling root and references sitemap", () => {
    const config = robots();
    expect(config.rules).toBeDefined();
    expect(config.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe("sitemap.xml configuration", () => {
  it("includes all primary public routes with valid priorities", () => {
    const entries = sitemap();
    expect(entries.length).toBeGreaterThanOrEqual(8);

    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain(SITE_URL);
    expect(urls).toContain(`${SITE_URL}/tutorial`);
    expect(urls).toContain(`${SITE_URL}/campaign`);
    expect(urls).toContain(`${SITE_URL}/load`);
    expect(urls).toContain(`${SITE_URL}/assets`);
    expect(urls).toContain(`${SITE_URL}/portraits`);
    expect(urls).toContain(`${SITE_URL}/privacy`);
    expect(urls).toContain(`${SITE_URL}/terms`);

    for (const entry of entries) {
      expect(entry.priority).toBeGreaterThan(0);
      expect(entry.priority).toBeLessThanOrEqual(1.0);
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });
});
