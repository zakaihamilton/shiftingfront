import { describe, expect, it } from "vitest";
import { APP_ISSUES_URL, APP_VERSION } from "../../lib/site";
import { crashIssueUrl, feedbackIssueUrl } from "../../lib/ui/issueReport";

describe("issue report URLs", () => {
  it("opens the bug form for Options and Credits feedback", () => {
    expect(feedbackIssueUrl()).toBe(`${APP_ISSUES_URL}/new?template=bug.yml`);
  });

  it("prefills a crash issue with seed, mission, version, and diagnostics", () => {
    const href = crashIssueUrl({
      message: "reactor breach",
      stack: "Error: reactor breach\n    at MaybeBoom",
      href: "https://www.shiftingfront.com/play?seed=0421&mission=2",
      userAgent: "vitest",
      timestamp: "2026-09-17T00:00:00.000Z",
    });
    const url = new URL(href);

    expect(url.origin + url.pathname).toBe(`${APP_ISSUES_URL}/new`);
    expect(url.searchParams.get("template")).toBe("crash.md");
    expect(url.searchParams.get("title")).toBe("[Crash] reactor breach");
    const body = url.searchParams.get("body") ?? "";
    expect(body).toContain("0421");
    expect(body).toContain("2");
    expect(body).toContain(APP_VERSION);
    expect(body).toContain("reactor breach");
    expect(body).toContain("/play?seed=0421&mission=2");
  });
});
