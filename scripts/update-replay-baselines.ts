import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runReplay } from "../lib/sim/replay";

const FIXTURES = [
  { kind: "annihilate", seed: 1, missionIndex: 2 },
  { kind: "decapitate", seed: 1, missionIndex: 4 },
  { kind: "destroyMarked", seed: 0, missionIndex: 3 },
  { kind: "escort", seed: 0, missionIndex: 2, comment: "Escort includes the expanded completion buffer and convoy unblocking path." },
  { kind: "extraction", seed: 0, missionIndex: 1 },
  { kind: "forceQuota", seed: 0, missionIndex: 4 },
  { kind: "harvestQuota", seed: 7, missionIndex: 3 },
  { kind: "holdTheLine", seed: 0, missionIndex: 5 },
  { kind: "razeAll", seed: 3, missionIndex: 2 },
  { kind: "rescue", seed: 0, missionIndex: 0, comment: "Rescue corridors now join the map route-repair pass used by extraction." },
  { kind: "sabotage", seed: 1, missionIndex: 0 },
  { kind: "structureQuota", seed: 2, missionIndex: 0 },
] as const;

const shouldWrite = process.argv.includes("--write");
const results: { kind: string; seed: number; missionIndex: number; digest: string; comment?: string }[] = [];

console.log("Computing replay baseline digests...\n");

for (const fixture of FIXTURES) {
  const replay = runReplay({ seed: fixture.seed, missionIndex: fixture.missionIndex, maxTicks: 120 });
  const digest = createHash("sha256").update(replay.fingerprint).digest("hex");
  results.push({ ...fixture, digest });
  console.log(`  ${fixture.kind.padEnd(16)} (seed ${fixture.seed}, mission ${fixture.missionIndex}): ${digest}`);
}

if (shouldWrite) {
  const testPath = join(__dirname, "../tests/simulation/replayCompatibility.test.ts");
  const lines: string[] = [
    'import { createHash } from "node:crypto";',
    'import { describe, expect, it } from "vitest";',
    'import { runReplay } from "../../lib/sim/replay";',
    "",
    "const BASELINES = [",
  ];

  for (const r of results) {
    if (r.comment) lines.push(`  // ${r.comment}`);
    lines.push(`  { kind: "${r.kind}", seed: ${r.seed}, missionIndex: ${r.missionIndex}, digest: "${r.digest}" },`);
  }

  lines.push(
    "] as const;",
    "",
    'describe("replay compatibility baselines", () => {',
    '  it("keeps representative fingerprints stable across every mission kind", () => {',
    "    for (const baseline of BASELINES) {",
    "      const replay = runReplay({ seed: baseline.seed, missionIndex: baseline.missionIndex, maxTicks: 120 });",
    '      const digest = createHash("sha256").update(replay.fingerprint).digest("hex");',
    "      expect({ kind: replay.state.win.kind, tick: replay.state.tick, result: replay.terminalResult, digest }).toEqual({",
    "        kind: baseline.kind,",
    "        tick: 120,",
    '        result: "playing",',
    "        digest: baseline.digest,",
    "      });",
    "    }",
    "  });",
    "});",
    "",
  );

  writeFileSync(testPath, lines.join("\n"), "utf8");
  console.log(`\nUpdated ${testPath}`);
} else {
  console.log("\nRun with --write to apply computed digests to replayCompatibility.test.ts");
}
