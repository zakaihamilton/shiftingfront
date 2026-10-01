import { readFileSync } from "node:fs";
import { completionTiming } from "../lib/sim/balance/evaluation/aggregation";
import { advancedDominance } from "../lib/sim/balance/evaluation/advanced";
import type { BalanceRecord } from "../lib/sim/balance/evaluation/types";

function argument(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
}
type Report = { records: BalanceRecord[]; acceptance?: { passed: boolean; failures: string[] } };
function read(path: string): Report {
  const text = readFileSync(path, "utf8");
  // Yarn can wrap stdout with its banner and completion line.
  const report = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Report;
  if (!Array.isArray(report.records)) throw new Error("Use balance --details true to generate input reports");
  return report;
}
const baselinePath = argument("baseline");
const currentPath = argument("current");
if (!baselinePath || !currentPath) throw new Error("Provide --baseline and --current balance JSON paths");
const baseline = read(baselinePath);
const current = read(currentPath);
const validationPath = argument("validation");
const advancedPath = argument("advanced");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const minutes = (ticks: number | null) => ticks === null ? "—" : (ticks / 720).toFixed(2);
function row(name: string, report: Report) {
  const records = report.records;
  const timing = completionTiming(records);
  const wins = records.filter(r => r.result === "won").length;
  return `| ${name} | ${records.length} | ${wins} | ${records.filter(r => r.result === "lost").length} | ${records.filter(r => r.result === "playing").length} | ${minutes(timing.median)} | ${minutes(timing.p90)} | ${pct(timing.inTargetWindowRate)} |`;
}
console.log("# Gameplay balance report\n\nAutomated commander outcomes; these are not human playtest timings. Successful completion percentiles exclude losses and unfinished runs.\n");
console.log("The commander prioritizes primary objectives and does not deliberately pursue bonus challenges. Human timings that include those challenges are not measured by this sweep.\n");
console.log("| Rules / sample | Runs | Wins | Losses | Unfinished | Median min | P90 min | Wins in 5–12 min |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
console.log(row("Legacy, seeds 0000–0039", baseline));
console.log(row("Current, seeds 0000–0039", current));
if (validationPath) console.log(row("Current, seeds 0040–0079", read(validationPath)));
console.log("\n## Acceptance\n");
console.log(`Existing balance gates: ${current.acceptance?.passed ? "pass" : "fail or not supplied"}.`);
for (const failure of current.acceptance?.failures ?? []) console.log(`- ${failure}`);
if (validationPath) {
  const validation = read(validationPath);
  console.log(`\nHeld-out balance gates: ${validation.acceptance?.passed ? "pass" : "fail or not supplied"}.`);
  for (const failure of validation.acceptance?.failures ?? []) console.log(`- ${failure}`);
}
const timing = completionTiming(current.records);
console.log(`\nTiming target (70% of successful runs in 5–12 minutes): ${timing.inTargetWindowRate >= 0.7 ? "met" : "not met"} (${pct(timing.inTargetWindowRate)}). No minimum completion time or new defeat timer was added.`);
console.log("\n## Mission timing\n\n| Mission | Legacy median min | Current median min | Current P90 min |\n| --- | ---: | ---: | ---: |");
for (const kind of [...new Set(current.records.map(r => r.kind))].sort()) {
  const before = completionTiming(baseline.records.filter(r => r.kind === kind));
  const after = completionTiming(current.records.filter(r => r.kind === kind));
  console.log(`| ${kind} | ${minutes(before.median)} | ${minutes(after.median)} | ${minutes(after.p90)} |`);
}
if (advancedPath) {
  const report = read(advancedPath);
  console.log("\n## Advanced armies\n\n| Strategy | Runs | Win rate | Produced defining units |\n| --- | ---: | ---: | ---: |");
  for (const strategy of ["competent", "behemoths", "aircraft", "support"]) {
    const records = report.records.filter(r => r.strategy === strategy);
    const kinds = strategy === "behemoths" ? ["behemoth"] : strategy === "aircraft" ? ["strikePlane"] : ["medic", "repairTruck"];
    const produced = records.reduce((sum,r) => sum + kinds.reduce((n,k) => n + (r.unitsProducedByRole?.[k as keyof NonNullable<BalanceRecord["unitsProducedByRole"]>] ?? 0), 0), 0);
    console.log(`| ${strategy} | ${records.length} | ${pct(records.length ? records.filter(r => r.result === "won").length / records.length : 0)} | ${produced} |`);
  }
  const dominance = advancedDominance(report.records);
  console.log(`\nDominance criterion: above 90% wins and at least 10 percentage points ahead of competent combined arms in matching families with at least eight samples. ${dominance.length ? JSON.stringify(dominance) : "No strategy meets the criterion; unit stats remain unchanged."}`);
}
