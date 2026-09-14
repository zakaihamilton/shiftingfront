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
const FACTION_ADJ = [
  "Ashen", "Iron", "Solar", "Northern", "Crimson", "United", "Free",
  "Eastern", "Western", "Outer", "Steel", "Amber",
];
const FACTION_END = [
  "Directorate", "Concord", "Legion", "Syndicate", "Mandate", "Pact",
  "Circle", "Union", "Order", "Front", "Republic", "Coalition",
];
const PLACE_ADJ = [
  "Ash", "Iron", "Dust", "Frost", "Red", "Black", "Glass", "Salt",
  "Rust", "Amber", "Copper", "Stone",
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

export function genFactionName(rng: Rng): string {
  return `${rng.pick(FACTION_ADJ)} ${rng.pick(FACTION_END)}`;
}

export function genFactionPair(rng: Rng): [string, string] {
  const adj = rng.shuffle(FACTION_ADJ);
  const end = rng.shuffle(FACTION_END);
  return [`${adj[0]} ${end[0]}`, `${adj[1]} ${end[1]}`];
}

export function genPlace(rng: Rng): string {
  return `${rng.pick(PLACE_ADJ)} ${rng.pick(PLACE)}`;
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
