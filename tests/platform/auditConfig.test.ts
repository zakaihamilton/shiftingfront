import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateAuditOutput } from "../../scripts/audit";

describe("vulnerability audit configuration", () => {
  it("ships a valid dependabot configuration with weekly npm checks", () => {
    const dependabotPath = resolve(process.cwd(), ".github/dependabot.yml");
    expect(existsSync(dependabotPath)).toBe(true);

    const content = readFileSync(dependabotPath, "utf-8");
    expect(content).toContain('package-ecosystem: "npm"');
    expect(content).toContain('interval: "weekly"');
    expect(content).toContain('directory: "/"');
  });

  it("defines health:audit in package.json", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["health:audit"]).toBeDefined();
    expect(pkg.scripts["health:audit"]).toContain("scripts/audit.ts");
  });

  it("parses yarn audit output and applies severity thresholds", () => {
    const mockOutput = [
      JSON.stringify({
        type: "auditAdvisory",
        data: {
          resolution: { path: "sample-pkg", dev: false },
          advisory: {
            id: 1,
            title: "Sample Low Risk",
            module_name: "sample-pkg",
            severity: "low",
            url: "https://example.com/advisory",
            recommendation: "Upgrade",
            patched_versions: ">=1.0.1",
            cves: [],
          },
        },
      }),
      JSON.stringify({
        type: "auditAdvisory",
        data: {
          resolution: { path: "critical-pkg", dev: false },
          advisory: {
            id: 2,
            title: "Sample Critical RCE",
            module_name: "critical-pkg",
            severity: "critical",
            url: "https://example.com/advisory/critical",
            recommendation: "Upgrade immediately",
            patched_versions: ">=2.0.0",
            cves: ["CVE-2026-0001"],
          },
        },
      }),
      JSON.stringify({
        type: "auditSummary",
        data: {
          vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 1 },
          totalDependencies: 25,
        },
      }),
    ].join("\n");

    const criticalEval = evaluateAuditOutput(mockOutput, "critical");
    expect(criticalEval.advisories.length).toBe(2);
    expect(criticalEval.failingAdvisories.length).toBe(1);
    expect(criticalEval.failingAdvisories[0].advisory.module_name).toBe("critical-pkg");

    const lowEval = evaluateAuditOutput(mockOutput, "low");
    expect(lowEval.failingAdvisories.length).toBe(2);

    const highEval = evaluateAuditOutput(mockOutput, "high");
    expect(highEval.failingAdvisories.length).toBe(1);
  });
});
