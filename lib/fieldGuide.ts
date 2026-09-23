import type { BiomeName, MissionKind } from "./types";
import { biomeLabel } from "./gen/names";

export type FieldGuideScenario = "campaign" | "escort" | "sabotage" | "rescue" | "extraction";
export type FieldGuideTopic = `scenario:${FieldGuideScenario}` | `biome:${BiomeName}`;

export const FIELD_GUIDE_SCENARIOS: readonly FieldGuideScenario[] = ["campaign", "escort", "sabotage", "rescue", "extraction"];
export const FIELD_GUIDE_BIOMES: readonly BiomeName[] = [
  "ash plains", "crystal flats", "rust canyons", "salt marshes", "glass desert", "tundra grid", "jungle wreckage", "volcanic shelf",
];
export const FIELD_GUIDE_TOPICS: readonly FieldGuideTopic[] = [
  ...FIELD_GUIDE_SCENARIOS.map((scenario) => `scenario:${scenario}` as const),
  ...FIELD_GUIDE_BIOMES.map((biome) => `biome:${biome}` as const),
];

export type FieldGuideEntry = { id: FieldGuideTopic; category: "Scenario" | "Biome"; title: string; text: string };

const SCENARIO_GUIDE: Record<FieldGuideScenario, string> = {
  campaign: "Standard operations turn on the objective shown in the command panel. Scout early, then build an economy and force that fit the pressure on this map.",
  escort: "The convoy follows its own route. Keep a screen near the slow vehicles and clear threats ahead so the column can keep moving.",
  sabotage: "Enemy systems are guarded across the map. Scout approaches, strike in sequence, and keep a withdrawal route open once the alarm spreads.",
  rescue: "Contact stranded units to bring them under your control. Protect the return journey; reaching them is only half the operation.",
  extraction: "Assets must cross exposed ground before time runs out. Scout the corridor and keep mobile escorts between cargo and enemy patrols.",
};

export const BIOME_RULE_TEXT: Record<BiomeName, string> = {
  "ash plains": "Ground units have 1 tile less sight inside active feature regions.",
  "crystal flats": "Ground units have 1 tile more sight inside active feature regions.",
  "rust canyons": "Units inside active feature regions take 15% less damage.",
  "salt marshes": "Ground vehicles spend 20% more movement in active feature regions.",
  "glass desert": "Ground direct-fire weapons gain 0.5 range when firing from active feature regions.",
  "tundra grid": "Ground vehicles spend 15% less movement in active feature regions.",
  "jungle wreckage": "Infantry inside active feature regions take 15% less damage.",
  "volcanic shelf": "Ground units firing downhill from active feature regions deal 1.25× height damage (normally 1.15×).",
};

export function scenarioGuideFor(kind: MissionKind): FieldGuideScenario {
  if (kind === "escort" || kind === "sabotage" || kind === "rescue" || kind === "extraction") return kind;
  return "campaign";
}

export function fieldGuideEntry(topic: FieldGuideTopic): FieldGuideEntry {
  if (topic.startsWith("scenario:")) {
    const scenario = topic.slice("scenario:".length) as FieldGuideScenario;
    const titles: Record<FieldGuideScenario, string> = {
      campaign: "Campaign operations", escort: "Escort operations", sabotage: "Sabotage operations", rescue: "Rescue operations", extraction: "Extraction operations",
    };
    return { id: topic, category: "Scenario", title: titles[scenario], text: SCENARIO_GUIDE[scenario] };
  }
  const biome = topic.slice("biome:".length) as BiomeName;
  return { id: topic, category: "Biome", title: biomeLabel(biome), text: BIOME_RULE_TEXT[biome] };
}

export function isFieldGuideTopic(value: unknown): value is FieldGuideTopic {
  return typeof value === "string" && FIELD_GUIDE_TOPICS.includes(value as FieldGuideTopic);
}

export function firstEncounterTopics(kind: MissionKind, biome: BiomeName): [FieldGuideTopic, FieldGuideTopic] {
  return [`scenario:${scenarioGuideFor(kind)}`, `biome:${biome}`];
}
