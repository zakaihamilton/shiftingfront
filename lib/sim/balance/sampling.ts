import { availableParallelism } from "node:os";
import { createCampaign } from "../../gen/campaign";
import { formatSeed } from "../../seed/rng";
import { resolveMissionProfile } from "../../gen/profile";
import type { BalanceRunOptions, BalanceScenario, PlaytestManifestEntry } from "./types";

export function defaultBalanceJobs(scenarioCount: number): number {
  const available = Math.max(1, availableParallelism());
  return Math.max(1, Math.min(available, 10, scenarioCount || 1));
}

export function balanceScenarios(options: BalanceRunOptions): Array<{ seed: number; mission: number }> {
  const missions = [...new Set(options.missions)]
    .filter((mission) => Number.isInteger(mission) && mission >= 0 && mission < 6)
    .sort((a, b) => a - b);
  const from = Math.max(0, Math.min(9999, Math.floor(options.from)));
  const to = Math.max(0, Math.min(9999, Math.floor(options.to)));
  const scenarios: Array<{ seed: number; mission: number }> = [];
  if (to < from) return scenarios;
  for (let seed = from; seed <= to; seed++) {
    for (const mission of missions) scenarios.push({ seed, mission });
  }
  return scenarios;
}

/** Selects a stable minimum sample for every generated mission kind. */
export function stratifiedBalanceScenarios(
  from = 0,
  to = 39,
  minSamplesPerKind = 8,
): BalanceScenario[] {
  const counts = new Map<string, number>();
  const scenarios: BalanceScenario[] = [];
  const start = Math.max(0, Math.min(9999, Math.floor(from)));
  const end = Math.max(0, Math.min(9999, Math.floor(to)));
  for (let seed = start; seed <= end; seed++) {
    const campaign = createCampaign(seed);
    for (const mission of campaign.missions) {
      const count = counts.get(mission.win.kind) ?? 0;
      if (count >= minSamplesPerKind) continue;
      scenarios.push({ seed, mission: mission.index });
      counts.set(mission.win.kind, count + 1);
    }
  }
  const missing = [
    "harvestQuota", "forceQuota", "structureQuota", "destroyMarked", "razeAll", "decapitate",
    "annihilate", "holdTheLine", "escort", "sabotage", "rescue", "extraction",
  ].filter((kind) => (counts.get(kind) ?? 0) < minSamplesPerKind);
  if (missing.length) throw new Error(`Unable to collect stratified balance samples for: ${missing.join(", ")}`);
  return scenarios.sort((a, b) => a.seed - b.seed || a.mission - b.mission);
}

/** Selects the first stable pair of missions for each profile variant. */
export function representativePlaytestManifest(
  from = 0,
  to = 39,
  perVariant = 2,
): PlaytestManifestEntry[] {
  const counts = new Map<string, number>();
  const entries: PlaytestManifestEntry[] = [];
  const start = Math.max(0, Math.min(9999, Math.floor(from)));
  const end = Math.max(0, Math.min(9999, Math.floor(to)));
  for (let seed = start; seed <= end; seed++) {
    const campaign = createCampaign(seed);
    for (const mission of campaign.missions) {
      const profile = resolveMissionProfile(seed, mission.index, mission.win.kind, mission.profile);
      const count = counts.get(profile.variant) ?? 0;
      if (count >= perVariant) continue;
      entries.push({
        seed,
        seedLabel: formatSeed(seed),
        mission: mission.index,
        kind: mission.win.kind,
        family: profile.family,
        variant: profile.variant,
        name: mission.name,
      });
      counts.set(profile.variant, count + 1);
    }
  }
  const variants = [
    "resourceRace", "forwardIndustry", "surgicalStrike", "siege",
    "concentratedWaves", "crossfire", "directRoute", "contestedRoute",
  ];
  const missing = variants.filter((variant) => (counts.get(variant) ?? 0) < perVariant);
  if (missing.length) throw new Error(`Unable to collect playtest scenarios for: ${missing.join(", ")}`);
  return entries.sort((a, b) => a.seed - b.seed || a.mission - b.mission);
}
