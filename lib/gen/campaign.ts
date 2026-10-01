import { gameplayRulesVersion } from "../gameplayRules";
import type { GameplayRulesVersion, MissionKind } from "../types";
import { assertValidSeed, createRng, formatSeed } from "../seed/rng";
import type { Campaign, MissionDef, ReadonlyCampaign } from "../types";
import { generateCharacters } from "./characters";
import { generateFactions } from "./factions";
import { mapSizeForMission } from "./map";
import { genMissionTitle } from "./names";
import { generateWinCategory, pickMissionKinds } from "./objectives";
import { generateBriefing } from "./story";
import { generateWorld } from "./world";
import { missionProfileFor } from "./profile";

const campaignCache = new Map<string, ReadonlyCampaign>();

function campaignMapSize(index: number, kind: MissionKind, version: GameplayRulesVersion): number {
  const legacySize = mapSizeForMission(index);
  if (version === 1) return legacySize;
  if (kind === "rescue") return 200;
  if (kind === "extraction") return 180;
  if (kind === "escort") return index >= 4 ? 150 : 144;
  if (["annihilate", "razeAll", "decapitate", "destroyMarked", "sabotage"].includes(kind)) return Math.max(104, legacySize);
  return legacySize;
}

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
export function createCampaign(seed: number, rules?: GameplayRulesVersion): ReadonlyCampaign {
  assertValidSeed(seed);
  const version = gameplayRulesVersion(rules);
  const key = `${seed}:${version}`;
  const cached = campaignCache.get(key);
  if (cached) return cached;
  const world = generateWorld(seed);
  const factions = generateFactions(seed, world.biome);
  const characters = generateCharacters(seed);
  const kinds = pickMissionKinds(seed);
  const missions: MissionDef[] = kinds.map((kind, index) => {
    const win = generateWinCategory(seed, index, kind, version);
    const profile = missionProfileFor(seed, index, kind);
    const draft: MissionDef = {
      gameplayRulesVersion: version,
      index,
      name: genMissionTitle(createRng(seed, `mission-title:${index}`), kind, profile),
      briefing: [],
      win,
      mapSize: campaignMapSize(index, kind, version),
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
    gameplayRulesVersion: version,
    seed: formatSeed(seed),
    seedNumber: seed,
    world,
    factions,
    characters,
    missions,
  };
  if (campaignCache.size >= 32) campaignCache.delete(campaignCache.keys().next().value!);
  const frozenCampaign = deepFreeze(campaign) as ReadonlyCampaign;
  campaignCache.set(key, frozenCampaign);
  return frozenCampaign;
}
