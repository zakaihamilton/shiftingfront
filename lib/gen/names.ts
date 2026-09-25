import type { BiomeName, MissionKind, MissionProfile } from "../types";
import type { Rng } from "../seed/rng";
import { profileContractFor } from "./profile";

const FIRST_FEM = [
  "Elena", "Irene", "Nadia", "Claire", "Helena", "Mara", "Lydia", "Kara", "Nina", "Ruth",
];
const FIRST_MASC = [
  "Marcus", "Jonas", "Victor", "Dorian", "Felix", "Tomas", "Owen", "Adrian", "Caleb", "Hugo",
];
const LAST_NAMES = [
  "Hale", "Voss", "Reed", "Cole", "Marsh", "Beck", "Nash", "Ward",
  "Cross", "Frost", "Drake", "Shaw", "Pike", "Vance", "Holt", "Rook",
  "Steele", "Ashford", "Crowe", "Graves",
];
export const NEUTRAL_FACTION_ADJ = [
  "Iron", "Solar", "Northern", "Crimson", "United", "Free",
  "Eastern", "Western", "Outer", "Steel", "Amber",
] as const;

export const BIOME_FACTION_ADJ: Record<BiomeName, readonly string[]> = {
  "ash plains": ["Ashen", "Cinder", "Soot"],
  "crystal flats": ["Crystal", "Prism", "Shard"],
  "rust canyons": ["Rust", "Iron", "Red"],
  "salt marshes": ["Tidal", "Marsh", "Brine"],
  "glass desert": ["Dune", "Glass", "Solar"],
  "tundra grid": ["Frost", "Polar", "Glacier"],
  "jungle wreckage": ["Verdant", "Canopy", "Wild"],
  "volcanic shelf": ["Magma", "Basalt", "Ashen"],
};

const FACTION_ADJ = [
  ...NEUTRAL_FACTION_ADJ,
  "Ashen",
];

const FACTION_END = [
  "Directorate", "Concord", "Legion", "Syndicate", "Mandate", "Pact",
  "Circle", "Union", "Order", "Front", "Republic", "Coalition",
];

export const NEUTRAL_PLACE_ADJ = [
  "Iron", "Dust", "Red", "Black", "Amber", "Copper", "Stone",
] as const;

export const BIOME_PLACE_ADJ: Record<BiomeName, readonly string[]> = {
  "ash plains": ["Ash", "Soot", "Cinder", "Char", "Basalt"],
  "crystal flats": ["Crystal", "Prism", "Shard", "Quartz", "Glass"],
  "rust canyons": ["Rust", "Iron", "Red", "Ochre", "Copper"],
  "salt marshes": ["Salt", "Silt", "Brine", "Marsh", "Tidal"],
  "glass desert": ["Glass", "Dune", "Silica", "Scorched", "Barren"],
  "tundra grid": ["Frost", "Rime", "Glacier", "Ice", "Boreal"],
  "jungle wreckage": ["Verdant", "Canopy", "Overgrowth", "Wild", "Tangled"],
  "volcanic shelf": ["Volcanic", "Magma", "Basalt", "Crag", "Smolder"],
};

const PLACE_ADJ = [
  ...NEUTRAL_PLACE_ADJ,
  "Ash", "Frost", "Glass", "Salt", "Rust",
];
const PLACE = [
  "Rift", "Expanse", "Wastes", "Basin", "Reach", "Marches", "Spires",
  "Hollow", "Delta", "Ridge", "Flats", "Coast",
];
const TONE = [
  "grim", "cold", "war-weary", "fanatic", "pragmatic", "doctrinal",
  "desperate", "calculated",
];
const CONFLICT = [
  "a resource war", "a broken ceasefire", "a succession crisis",
  "an orbital blockade", "a terraforming collapse", "a border annexation",
  "a relic excavation", "a civil split",
];
const ERA = [
  "Late Reconstruction", "the Second Expansion", "the Collapse Years",
  "Open War", "the Ceasefire", "the Long Winter",
];
export const BIOMES: BiomeName[] = [
  "ash plains", "crystal flats", "rust canyons", "salt marshes", "glass desert",
  "tundra grid", "jungle wreckage", "volcanic shelf",
];
export const BIOME_LABELS: Record<BiomeName, string> = {
  "ash plains": "Ash Plains",
  "crystal flats": "Crystal Flats",
  "rust canyons": "Rust Canyons",
  "salt marshes": "Salt Marshes",
  "glass desert": "Glass Desert",
  "tundra grid": "Frozen Tundra",
  "jungle wreckage": "Ruined Jungle",
  "volcanic shelf": "Volcanic Shelf",
};
const RANK = ["Commander", "Marshal", "Director", "Captain", "Overseer", "Warden"];
const ADVISOR = ["Strategist", "Attaché", "Quartermaster", "Analyst", "Herald"];
const ENEMY_TITLE = ["Warlord", "Prefect", "Autarch", "General", "Executor"];

function uniqueAdjectives(neutral: readonly string[], biome?: BiomeName): string[] {
  const specific = biome ? BIOME_FACTION_ADJ[biome] : undefined;
  return [...new Set(specific ? [...neutral, ...specific] : neutral)];
}

export type FactionArchetype = "directorate" | "concord" | "legion" | "syndicate";

export function factionArchetype(name: string): FactionArchetype {
  if (/Directorate|Mandate|Order/i.test(name)) return "directorate";
  if (/Concord|Coalition|Union|Pact|Republic/i.test(name)) return "concord";
  if (/Syndicate|Circle/i.test(name)) return "syndicate";
  return "legion";
}

export const FACTION_DOCTRINES: Record<FactionArchetype, {
  doctrine: string;
  motto: string;
  dialectTerms: readonly string[];
  rationale: (op: string) => string;
}> = {
  directorate: {
    doctrine: "Centralized Administrative Hegemony",
    motto: "Order through absolute compliance",
    dialectTerms: ["protocol", "authorization", "compliance", "standard directive", "logistics priority"],
    rationale: (op) => `Authorized by Central Command: ${op} to enforce administrative compliance.`,
  },
  concord: {
    doctrine: "Mutual Defense & Collective Sovereignty",
    motto: "Divided we fall, united we endure",
    dialectTerms: ["coalition", "mutual defense", "collective security", "solidarity", "assembly resolution"],
    rationale: (op) => `Sanctioned by the Council: ${op} to safeguard our coalition border.`,
  },
  syndicate: {
    doctrine: "High-Margin Contract Enforcement",
    motto: "Every asset has its price",
    dialectTerms: ["contract clause", "asset risk", "margin liability", "audit", "liquidation protocol"],
    rationale: (op) => `Contract stipulation: execute ${op} to secure high-value equity.`,
  },
  legion: {
    doctrine: "Frontline Breakthrough Supremacy",
    motto: "Victory written in steel",
    dialectTerms: ["vanguard", "iron discipline", "breachhead", "hammer strike", "assault wedge"],
    rationale: (op) => `Tactical necessity: smash forward and execute ${op}.`,
  },
};

const MISSION_TITLES: Record<MissionKind, string[]> = {
  harvestQuota: ["The Harvest", "Claim the Fields", "Strip the Veins", "Take the Ore"],
  forceQuota: ["Build Forces", "Train Up", "Get Numbers", "Combat Ready"],
  structureQuota: ["Raise the Fort", "Lay Foundations", "Build the Line", "Fortify"],
  destroyMarked: ["Cut the Spine", "Strike the Marks", "High Value", "Break Their Holds"],
  razeAll: ["Scorched Earth", "Leave Nothing", "Burn the Camp", "Raze the Field"],
  decapitate: ["Cut Off the Head", "Storm the HQ", "Kill the Heart", "Break Command"],
  annihilate: ["No Quarter", "Wipe Them Out", "Total War", "End Them"],
  holdTheLine: ["Hold the Line", "Stand Fast", "Last Watch", "Do Not Yield"],
  escort: ["The Long Route", "Convoy Run", "Through the Fire", "Guided Passage"],
  sabotage: ["Cut the Grid", "Silent Charges", "System Failure", "Break the Line"],
  rescue: ["Bring Them Home", "Stranded", "Recovery Zone", "The Missing"],
  extraction: ["Get Out Alive", "Final Lift", "Extraction Window", "Cargo Run"],
};

export function biomeLabel(biome: BiomeName): string {
  return BIOME_LABELS[biome];
}

export function genPerson(rng: Rng): { name: string; feminine: boolean } {
  const feminine = rng.chance(0.5);
  const first = rng.pick(feminine ? FIRST_FEM : FIRST_MASC);
  return { name: `${first} ${rng.pick(LAST_NAMES)}`, feminine };
}

export function genName(rng: Rng): string {
  return genPerson(rng).name;
}

export function characterLabel(who: { title: string; name: string }): string {
  return `${who.title} ${who.name}`;
}

export function genFactionName(rng: Rng, biome?: BiomeName): string {
  const adjectives = biome ? uniqueAdjectives(NEUTRAL_FACTION_ADJ, biome) : FACTION_ADJ;
  return `${rng.pick(adjectives)} ${rng.pick(FACTION_END)}`;
}

export function genFactionPair(rng: Rng, biome?: BiomeName): [string, string] {
  const adjectives = biome ? uniqueAdjectives(NEUTRAL_FACTION_ADJ, biome) : FACTION_ADJ;
  const adj = rng.shuffle(adjectives);
  const end = rng.shuffle(FACTION_END);
  return [`${adj[0]} ${end[0]}`, `${adj[1]} ${end[1]}`];
}

export function genPlace(rng: Rng, biome?: BiomeName): string {
  const adjectives = biome && BIOME_PLACE_ADJ[biome]
    ? [...new Set([...NEUTRAL_PLACE_ADJ, ...BIOME_PLACE_ADJ[biome]])]
    : PLACE_ADJ;
  return `${rng.pick(adjectives)} ${rng.pick(PLACE)}`;
}

export function genTone(rng: Rng): string {
  return rng.pick(TONE);
}

export function genConflict(rng: Rng): string {
  return rng.pick(CONFLICT);
}

export function genEra(rng: Rng): string {
  return rng.pick(ERA);
}

export function genBiome(rng: Rng): BiomeName {
  return rng.pick(BIOMES);
}

export function genRank(rng: Rng): string {
  return rng.pick(RANK);
}

export function genAdvisorTitle(rng: Rng): string {
  return rng.pick(ADVISOR);
}

export function genEnemyTitle(rng: Rng): string {
  return rng.pick(ENEMY_TITLE);
}

export function genMissionTitle(rng: Rng, kind: MissionKind, profile?: MissionProfile): string {
  const titles = MISSION_TITLES[kind];
  if (!profile) return rng.pick(titles);
  const profileBias = profileContractFor(profile).label.length % titles.length;
  return titles[(rng.int(titles.length) + profileBias) % titles.length]!;
}
