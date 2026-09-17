import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_BALANCE_THRESHOLDS } from "../../lib/sim/balance/evaluation";
import { APP_VERSION } from "../../lib/site";
import { CRASH_ISSUE_TEMPLATE, FEEDBACK_ISSUE_TEMPLATE } from "../../lib/ui/issueReport";

function unreleasedSection(changelog: string): string {
  const start = changelog.indexOf("## [Unreleased]");
  expect(start).toBeGreaterThanOrEqual(0);
  const next = changelog.indexOf("\n## [", start + 1);
  return changelog.slice(start, next === -1 ? undefined : next);
}

describe("docs and process drift", () => {
  it("keeps APP_VERSION aligned with package.json", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8")) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("records the live balance floors in CHANGELOG Unreleased", () => {
    const changelog = readFileSync(resolve(process.cwd(), "CHANGELOG.md"), "utf-8");
    const unreleased = unreleasedSection(changelog);
    const rates = DEFAULT_BALANCE_THRESHOLDS.targetedKindWinRates!;

    expect(unreleased).toContain(`minKindWinRate\` ${DEFAULT_BALANCE_THRESHOLDS.minKindWinRate}`);
    expect(unreleased).toContain(`rescue ${rates.rescue}`);
    expect(unreleased).toContain(`extraction ${rates.extraction}`);
    expect(unreleased).toContain(`destroyMarked\`/\`decapitate\` ${rates.destroyMarked}`);
  });

  it("does not freeze the next release version inside the checklist", () => {
    const checklist = readFileSync(resolve(process.cwd(), "docs/release-checklist.md"), "utf-8");
    expect(checklist).not.toMatch(/"version":\s*"\d+\.\d+\.\d+"/);
    expect(checklist).toContain("APP_VERSION");
    expect(checklist).toContain("package.json");
  });

  it("ships crash and bug issue templates used by the in-game report links", () => {
    const crash = readFileSync(resolve(process.cwd(), ".github/ISSUE_TEMPLATE", CRASH_ISSUE_TEMPLATE), "utf-8");
    const bug = readFileSync(resolve(process.cwd(), ".github/ISSUE_TEMPLATE", FEEDBACK_ISSUE_TEMPLATE), "utf-8");
    expect(crash).toContain("name: Crash");
    expect(bug).toContain("name: Bug or feedback");
  });

  it("keeps the release workflow on Node 24 action runtimes", () => {
    const release = readFileSync(resolve(process.cwd(), ".github/workflows/release.yml"), "utf-8");
    expect(release).toContain("softprops/action-gh-release@v3");
    expect(release).not.toContain("action-gh-release@v2");
  });
});
