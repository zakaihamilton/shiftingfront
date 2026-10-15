import { spawnSync } from "node:child_process";

type Severity = "info" | "low" | "moderate" | "high" | "critical";

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

type AuditAdvisory = {
  id: number;
  title: string;
  module_name: string;
  severity: Severity;
  url: string;
  recommendation: string;
  patched_versions: string;
  cves: string[];
};

type PnpmAdvisory = AuditAdvisory & {
  findings?: Array<{ version: string; paths: string[] }>;
};

type PnpmAuditReport = {
  advisories?: Record<string, PnpmAdvisory>;
  metadata?: {
    vulnerabilities?: Record<Severity, number>;
    totalDependencies?: number;
  };
};

function parseArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === `--${name}` && i + 1 < process.argv.length) {
      return process.argv[i + 1]!;
    }
    if (arg && arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
  }
  return fallback;
}

const levelArg = parseArg("level", "high").toLowerCase() as Severity;
if (!(levelArg in SEVERITY_RANK)) {
  console.error(`Invalid --level: "${levelArg}". Supported levels: ${Object.keys(SEVERITY_RANK).join(", ")}`);
  process.exit(1);
}

const asJson = process.argv.includes("--json");

function runAudit(): { stdout: string; stderr: string; exitCode: number | null; error?: Error } {
  const result = spawnSync("pnpm", ["audit", "--json", "--prod"], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status,
    error: result.error,
  };
}

export function evaluateAuditOutput(stdout: string, threshold: Severity) {
  const thresholdRank = SEVERITY_RANK[threshold];
  let report: PnpmAuditReport;
  try {
    report = JSON.parse(stdout) as PnpmAuditReport;
  } catch {
    return { advisories: [], failingAdvisories: [], summary: null, totalDependencies: 0 };
  }

  const advisories = Object.values(report.advisories ?? {}).flatMap((item) =>
    (item.findings ?? []).flatMap((finding) =>
      finding.paths.map((path) => ({
        advisory: {
          id: item.id,
          title: item.title,
          module_name: item.module_name,
          severity: item.severity,
          url: item.url,
          recommendation: item.recommendation ?? "",
          patched_versions: item.patched_versions ?? "",
          cves: item.cves ?? [],
        },
        path,
        dev: false,
      })),
    ),
  );

  const summary = report.metadata?.vulnerabilities ?? null;
  const totalDependencies = report.metadata?.totalDependencies ?? 0;
  const failingAdvisories = advisories.filter(
    (item) => SEVERITY_RANK[item.advisory.severity] >= thresholdRank,
  );

  return { advisories, failingAdvisories, summary, totalDependencies };
}

function main() {
  const audit = runAudit();
  const { stdout } = audit;

  if (audit.error || audit.exitCode === null || !stdout.trim()) {
    console.error("pnpm audit could not complete; treating the dependency check as failed.");
    if (audit.error) console.error(audit.error.message);
    if (audit.stderr.trim()) console.error(audit.stderr.trim());
    process.exit(1);
  }

  const result = evaluateAuditOutput(stdout, levelArg);
  if (!result.summary) {
    console.error("pnpm audit output did not include a summary; treating the dependency check as failed.");
    if (audit.stderr.trim()) console.error(audit.stderr.trim());
    process.exit(1);
  }

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    if (result.failingAdvisories.length > 0) process.exit(1);
    process.exit(0);
  }

  console.log(`[audit] Scanned ${result.totalDependencies} dependencies with threshold level: ${levelArg.toUpperCase()}`);
  console.log(
    `[audit] Summary: ${result.summary.critical} critical, ${result.summary.high} high, ${result.summary.moderate} moderate, ${result.summary.low} low, ${result.summary.info} info`,
  );

  if (result.failingAdvisories.length > 0) {
    console.error(`\nFound ${result.failingAdvisories.length} advisory(ies) at or above ${levelArg.toUpperCase()} severity:\n`);
    for (const item of result.failingAdvisories) {
      const { advisory, path } = item;
      console.error(`- [${advisory.severity.toUpperCase()}] ${advisory.module_name} (${path})`);
      console.error(`  Title: ${advisory.title}`);
      console.error(`  Recommendation: ${advisory.recommendation}`);
      console.error(`  Advisory URL: ${advisory.url}`);
      if (advisory.cves.length > 0) {
        console.error(`  CVEs: ${advisory.cves.join(", ")}`);
      }
      console.error("");
    }
    process.exit(1);
  }

  console.log(`✓ Dependency audit passed: 0 vulnerabilities found at or above ${levelArg.toUpperCase()} threshold.`);
  process.exit(0);
}

if (process.env.NODE_ENV !== "test") {
  main();
}
