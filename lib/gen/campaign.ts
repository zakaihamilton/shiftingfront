import { createRng, formatSeed } from "../seed/rng";
import type { Campaign, MissionDef } from "../types";
import { generateCharacters } from "./characters";
import { generateFactions } from "./factions";
import { mapSizeForMission } from "./map";
import { genMissionTitle } from "./names";
import { generateWinCategory, pickMissionKinds } from "./objectives";
import { generateBriefing } from "./story";
import { generateWorld } from "./world";
import { missionProfileFor } from "./profile";

const campaignCache = new Map<number, Campaign>();

/**
 * Campaigns are deterministic per seed, so results are memoized. Callers
 * (menu preview, briefing, runtime, completion screen) frequently request the
 * same seed during a session; regeneration is pure waste.
 */
export function createCampaign(seed: number): Campaign {
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
    draft.briefing = generateBriefing({ world, factions, characters, seedNumber: seed }, draft);
    return draft;
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
  campaignCache.set(seed, campaign);
  return campaign;
}
