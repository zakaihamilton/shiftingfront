import { createRng } from "../seed/rng";
import type { CampaignVisualProfile, FactionVisualProfile, Owner } from "../types";

const LIGHTS = ["cyan", "amber", "red"] as const;
const FAMILY_MATERIALS = [
  ["brushed", "armored"],
  ["armored", "industrial"],
  ["industrial", "brushed"],
] as const;
const TERRAIN_TREATMENTS = ["modular", "armored", "expeditionary"] as const;

const CAMPAIGN_PROFILE_CACHE_LIMIT = 64;
const FACTION_PROFILE_CACHE_LIMIT = 128;
const campaignCache = new Map<number, CampaignVisualProfile>();
const profileCache = new Map<string, FactionVisualProfile>();

function retain<T>(
  cache: Map<string | number, T>,
  key: string | number,
  value: T,
  limit: number,
): void {
  if (!cache.has(key) && cache.size >= limit) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.delete(key);
  cache.set(key, value);
}

function computeCampaignVisualProfile(seed: number): CampaignVisualProfile {
  const rng = createRng(seed, "campaign-visual-profile");
  const family = rng.int(3) as CampaignVisualProfile["family"];
  return {
    family,
    terrainTreatment: TERRAIN_TREATMENTS[family],
    terrainAccent: LIGHTS[(family + rng.int(3)) % LIGHTS.length]!,
  };
}

function computeVisualProfile(seed: number, owner: Owner): FactionVisualProfile {
  const rng = createRng(seed, `visual-profile:${owner}`);
  const campaign = generateCampaignVisualProfile(seed);
  const designFamily = campaign.family;
  return {
    designFamily,
    material: FAMILY_MATERIALS[designFamily][(owner + rng.int(2)) % 2]!,
    trimPattern: rng.int(4) as FactionVisualProfile["trimPattern"],
    insignia: rng.int(5) as FactionVisualProfile["insignia"],
    weathering: rng.int(4) as FactionVisualProfile["weathering"],
    lightRig: LIGHTS[(owner + rng.int(2)) % LIGHTS.length]!,
  };
}

export function generateCampaignVisualProfile(seed: number): CampaignVisualProfile {
  const hit = campaignCache.get(seed);
  if (hit) {
    retain(campaignCache, seed, hit, CAMPAIGN_PROFILE_CACHE_LIMIT);
    return hit;
  }
  const profile = computeCampaignVisualProfile(seed);
  retain(campaignCache, seed, profile, CAMPAIGN_PROFILE_CACHE_LIMIT);
  return profile;
}

export function generateVisualProfile(seed: number, owner: Owner): FactionVisualProfile {
  const key = `${seed}:${owner}`;
  const hit = profileCache.get(key);
  if (hit) {
    retain(profileCache, key, hit, FACTION_PROFILE_CACHE_LIMIT);
    return hit;
  }
  const profile = computeVisualProfile(seed, owner);
  retain(profileCache, key, profile, FACTION_PROFILE_CACHE_LIMIT);
  return profile;
}

export function clearVisualProfileCache(): void {
  campaignCache.clear();
  profileCache.clear();
}

export function visualProfileCacheSize(): { campaigns: number; profiles: number } {
  return { campaigns: campaignCache.size, profiles: profileCache.size };
}

export function profileKey(profile: FactionVisualProfile): string {
  return `${profile.designFamily}:${profile.material}:${profile.trimPattern}:${profile.insignia}:${profile.weathering}:${profile.lightRig}`;
}

export function campaignProfileKey(profile: CampaignVisualProfile): string {
  return `${profile.family}:${profile.terrainTreatment}:${profile.terrainAccent}`;
}
