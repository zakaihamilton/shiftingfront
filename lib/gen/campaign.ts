import { createRng, formatSeed } from "../seed/rng";
import type { Campaign, MissionDef, ReadonlyCampaign } from "../types";
import { generateCharacters } from "./characters";
import { generateFactions } from "./factions";
import { mapSizeForMission } from "./map";
import { genMissionTitle } from "./names";
import { generateWinCategory, pickMissionKinds } from "./objectives";
import { generateBriefing } from "./story";
import { generateWorld } from "./world";
import { missionProfileFor } from "./profile";

const campaignCache = new Map<number, ReadonlyCampaign>();

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value) as T;
}

/**
 * Campaigns are deterministic per seed, so results are memoized. Callers
 * (menu preview, briefing, runtime, completion screen) frequently request the
 * same seed during a session; regeneration is pure waste.
 */
export function createCampaign(seed: number): ReadonlyCampaign {
  const cached = campaignCache.get(seed);
  if (cached) return cached;
  const world = generateWorld(seed);
  const factions = generateFactions(seed);
  const characters = generateCharacters(seed);
  const kinds = pickMissionKinds(seed);
  const missions: MissionDef[] = kinds.map((kind, index) => {
    const win = generateWinCategory(seed, index, kind);
    const profile = missionProfileFor(seed, index, kind);
    const draft: MissionDef = {
      index,
      name: genMissionTitle(createRng(seed, `mission-title:${index}`), kind, profile),
      briefing: [],
      win,
      mapSize: mapSizeForMission(index),
      biome: world.biome,
      kind: win.kind,
      profile,
    };
    return {
      ...draft,
      briefing: generateBriefing({ world, factions, characters, seedNumber: seed }, draft),
    };
  });

  const campaign: Campaign = {
    seed: formatSeed(seed),
    seedNumber: seed,
    world,
    factions,
    characters,
    missions,
  };
  if (campaignCache.size >= 32) campaignCache.delete(campaignCache.keys().next().value!);
  const frozenCampaign = deepFreeze(campaign) as ReadonlyCampaign;
  campaignCache.set(seed, frozenCampaign);
  return frozenCampaign;
}
