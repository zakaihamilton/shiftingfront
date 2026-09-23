import { createRng } from "../seed/rng";
import type { MissionFamily, MissionKind, MissionProfile, MissionProfileVariant, UnitKind } from "../types";

export type MissionProfileContract = {
  label: string;
  emphasis: string;
  openingOrder: string;
  fallback: string;
  routeHint: string;
  alert: string;
  pressureRatio: number;
  pressureFloor: number;
  pressureLimitOffset: number;
  assaultEveryOffset: number;
  finaleRatio: number;
  reinforcements: readonly UnitKind[];
  reinforcementLimit: number;
  maxRecoveryDelay: number;
};

export type MissionObjectiveContract = {
  targetLabel: string;
  pressureAlert: string;
  repairPolicy: "nonTarget" | "none";
  assaultDelay: number;
  /** Enemy production cadence multiplier; values above one space out production. */
  productionScale: number;
  startingSupport: boolean;
};

const OBJECTIVE_CONTRACTS: Partial<Record<MissionKind, MissionObjectiveContract>> = {
  destroyMarked: {
    targetLabel: "the marked targets",
    pressureAlert: "Enemy reserves are regrouping around the marked targets.",
    repairPolicy: "nonTarget",
    assaultDelay: 240,
    productionScale: 1.0,
    startingSupport: true,
  },
  sabotage: {
    targetLabel: "the remaining systems",
    pressureAlert: "Enemy response is tightening around the remaining systems.",
    repairPolicy: "nonTarget",
    assaultDelay: 720,
    productionScale: 1.3,
    startingSupport: true,
  },
  decapitate: {
    targetLabel: "the enemy Command HQ",
    pressureAlert: "Enemy command is exposed — expect a counterattack.",
    repairPolicy: "none",
    assaultDelay: 840,
    productionScale: 1.8,
    startingSupport: false,
  },
  razeAll: {
    targetLabel: "the remaining enemy structures",
    pressureAlert: "The defensive ring is tightening around the remaining structures.",
    repairPolicy: "none",
    assaultDelay: 960,
    productionScale: 1.7,
    startingSupport: true,
  },
  annihilate: {
    targetLabel: "the last hostiles",
    pressureAlert: "Final enemy resistance is forming around the last hostiles.",
    repairPolicy: "none",
    assaultDelay: 600,
    productionScale: 1.4,
    startingSupport: true,
  },
};

export function missionFamilyFor(kind: MissionKind): MissionFamily {
  if (kind === "harvestQuota" || kind === "forceQuota" || kind === "structureQuota") return "economy";
  if (kind === "destroyMarked" || kind === "razeAll" || kind === "decapitate" || kind === "annihilate") return "assault";
  if (kind === "holdTheLine") return "defense";
  return "operation";
}

const PROFILE_VARIANTS: Record<MissionFamily, readonly [MissionProfileVariant, MissionProfileVariant]> = {
  economy: ["resourceRace", "forwardIndustry"],
  assault: ["surgicalStrike", "siege"],
  defense: ["concentratedWaves", "crossfire"],
  operation: ["directRoute", "contestedRoute"],
};

const missionProfileCache = new Map<string, MissionProfile>();
const MISSION_PROFILE_CACHE_LIMIT = 64;

const PROFILE_CONTRACTS: Record<MissionProfileVariant, MissionProfileContract> = {
  resourceRace: {
    label: "Resource Race",
    emphasis: "Contest the exposed high-value ore lane early.",
    openingOrder: "Secure the forward ore lane before the enemy can tax it.",
    fallback: "The starting field remains viable if you keep the refinery screened.",
    routeHint: "A central seam rewards a guarded forward move.",
    alert: "The resource lanes are contested.",
    pressureRatio: 0.24,
    pressureFloor: 240,
    pressureLimitOffset: 0,
    assaultEveryOffset: -60,
    finaleRatio: 0.74,
    reinforcements: ["infantry", "antiArmor"],
    reinforcementLimit: 2,
    maxRecoveryDelay: 180,
  },
  forwardIndustry: {
    label: "Forward Industry",
    emphasis: "Extend power and production toward the middle ground.",
    openingOrder: "Build a working industrial spine before committing the main force.",
    fallback: "Base-area economy remains viable if the forward site is too exposed.",
    routeHint: "The forward resource pocket is valuable, but never mandatory.",
    alert: "The industrial spine is under pressure.",
    pressureRatio: 0.28,
    pressureFloor: 240,
    pressureLimitOffset: 0,
    assaultEveryOffset: 0,
    finaleRatio: 0.75,
    reinforcements: ["infantry", "tank"],
    reinforcementLimit: 2,
    maxRecoveryDelay: 180,
  },
  surgicalStrike: {
    label: "Surgical Strike",
    emphasis: "Use a concentrated force to exploit a narrow breach.",
    openingOrder: "Find the breach, keep the strike force together, and leave before the line closes.",
    fallback: "A slower flank remains open for regrouping and support.",
    routeHint: "The direct lane is fastest; the flank is safer when the breach closes.",
    alert: "The breach is closing.",
    pressureRatio: 0.25,
    pressureFloor: 240,
    pressureLimitOffset: 0,
    assaultEveryOffset: -120,
    finaleRatio: 0.72,
    reinforcements: ["tank", "antiArmor"],
    reinforcementLimit: 2,
    maxRecoveryDelay: 180,
  },
  siege: {
    label: "Siege",
    emphasis: "Prepare counters and support before breaking layered defenses.",
    openingOrder: "Bring counters and support before you commit to the defensive ring.",
    fallback: "One defensible approach remains open for a patient advance.",
    routeHint: "The longer lane gives damaged units room to regroup.",
    alert: "The defensive ring is tightening.",
    pressureRatio: 0.32,
    pressureFloor: 300,
    pressureLimitOffset: 120,
    assaultEveryOffset: 120,
    finaleRatio: 0.78,
    reinforcements: ["tank", "antiArmor", "infantry"],
    reinforcementLimit: 3,
    maxRecoveryDelay: 180,
  },
  concentratedWaves: {
    label: "Concentrated Waves",
    emphasis: "Anchor one strong defensive line against the main push.",
    openingOrder: "Anchor the defense on one strong line and rotate damaged units back.",
    fallback: "A fallback position prevents a broken line from becoming an instant loss.",
    routeHint: "The main approach is clear; the second lane gives the line somewhere to fall back.",
    alert: "The main line is taking the pressure.",
    pressureRatio: 0.34,
    pressureFloor: 360,
    pressureLimitOffset: 120,
    assaultEveryOffset: 0,
    finaleRatio: 0.82,
    reinforcements: ["infantry", "infantry", "antiArmor"],
    reinforcementLimit: 3,
    maxRecoveryDelay: 180,
  },
  crossfire: {
    label: "Crossfire",
    emphasis: "Split coverage between two approach lanes without abandoning either.",
    openingOrder: "Watch both approaches and refuse to let one flank become a free route.",
    fallback: "Both lanes remain reachable, so one guard can withdraw while the other holds.",
    routeHint: "Two approach lanes create a choice between concentration and coverage.",
    alert: "Watch both approaches.",
    pressureRatio: 0.22,
    pressureFloor: 180,
    pressureLimitOffset: 0,
    assaultEveryOffset: -120,
    finaleRatio: 0.68,
    reinforcements: ["infantry", "antiArmor"],
    reinforcementLimit: 2,
    maxRecoveryDelay: 180,
  },
  directRoute: {
    label: "Direct Route",
    emphasis: "Exploit the shortest route before the alarm closes it.",
    openingOrder: "Move with purpose while the direct route remains available.",
    fallback: "A slower route remains available if the first push meets resistance.",
    routeHint: "The shortest lane favors an early move; the alternate lane favors patience.",
    alert: "The direct route is still open.",
    pressureRatio: 0.24,
    pressureFloor: 240,
    pressureLimitOffset: 0,
    assaultEveryOffset: 0,
    finaleRatio: 0.75,
    reinforcements: ["infantry", "tank"],
    reinforcementLimit: 2,
    maxRecoveryDelay: 180,
  },
  contestedRoute: {
    label: "Contested Route",
    emphasis: "Screen movement and choose when to cross exposed ground.",
    openingOrder: "Screen every movement and expect contact before the objective is in sight.",
    fallback: "One lower-risk lane avoids an unavoidable ambush and buys time to regroup.",
    routeHint: "The exposed lane is faster; the safer lane costs distance, not certainty.",
    alert: "Contact is expected along both flanks.",
    pressureRatio: 0.26,
    pressureFloor: 240,
    pressureLimitOffset: 0,
    assaultEveryOffset: 0,
    finaleRatio: 0.75,
    reinforcements: ["infantry", "antiArmor"],
    reinforcementLimit: 2,
    maxRecoveryDelay: 180,
  },
};

export function missionProfileFor(seed: number, missionIndex: number, kind: MissionKind): MissionProfile {
  const key = `${seed}:${missionIndex}:${kind}`;
  const cached = missionProfileCache.get(key);
  if (cached) return cached;
  const family = missionFamilyFor(kind);
  const variants = PROFILE_VARIANTS[family];
  const rng = createRng(seed, `mission-profile:${missionIndex}:${kind}`);
  const profile = { family, variant: variants[rng.int(variants.length)]! };
  if (!missionProfileCache.has(key) && missionProfileCache.size >= MISSION_PROFILE_CACHE_LIMIT) {
    const oldest = missionProfileCache.keys().next().value;
    if (oldest !== undefined) missionProfileCache.delete(oldest);
  }
  missionProfileCache.set(key, profile);
  return profile;
}

export function profileContractFor(profile: MissionProfile): MissionProfileContract {
  return PROFILE_CONTRACTS[profile.variant];
}

export function objectiveContractFor(kind: MissionKind): MissionObjectiveContract | undefined {
  return OBJECTIVE_CONTRACTS[kind];
}

export function resolveMissionProfile(
  seed: number,
  missionIndex: number,
  kind: MissionKind,
  profile?: MissionProfile,
): MissionProfile {
  return profile ?? missionProfileFor(seed, missionIndex, kind);
}
