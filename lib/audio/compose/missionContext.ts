import { generateWorld } from "../../gen/world";
import { pickMissionKinds } from "../../gen/missionOrder";
import type { BiomeName, MissionKind } from "../../types";
import { createRng, type Rng } from "../../seed/rng";
import type {
  MusicArrangementName,
  MusicCue,
  MusicStyleName,
  MusicStyleProfile,
} from "./types";
import { TUTORIAL_MUSIC_MISSION } from "./types";

export type MusicMissionContext = {
  biome?: BiomeName;
  missionKind?: MissionKind;
};

const BIOME_STYLES: Record<BiomeName, readonly MusicStyleName[]> = {
  "ash plains": ["foundry-stomp", "industrial-march", "cinematic-tension", "tape-static", "break-wire", "disco-command"],
  "volcanic shelf": ["foundry-stomp", "night-raid", "acid-grid"],
  "rust canyons": ["industrial-march", "chrome-fanfare", "signal-chase", "tape-static", "resonant-coil", "disco-command"],
  "crystal flats": ["glass-chime", "neon-arpeggio", "chrome-fanfare", "bit-garrison", "choir-vector"],
  "glass desert": ["acid-grid", "glass-chime", "signal-chase", "dune-cipher", "resonant-coil"],
  "tundra grid": ["ice-protocol", "low-orbit", "cinematic-tension"],
  "jungle wreckage": ["night-raid", "orbital-drift", "neon-arpeggio", "bit-garrison", "break-wire"],
  "salt marshes": ["orbital-drift", "low-orbit", "ice-protocol", "relay-dub", "dune-cipher"],
};

const BIOME_STYLES_SECONDARY: Record<BiomeName, readonly MusicStyleName[]> = {
  "ash plains": ["chrome-fanfare", "signal-chase", "night-raid", "resonant-coil"],
  "volcanic shelf": ["industrial-march", "cinematic-tension", "foundry-stomp", "tape-static", "resonant-coil"],
  "rust canyons": ["foundry-stomp", "cinematic-tension", "acid-grid", "break-wire"],
  "crystal flats": ["acid-grid", "orbital-drift", "signal-chase", "disco-command"],
  "glass desert": ["neon-arpeggio", "night-raid", "chrome-fanfare", "tape-static"],
  "tundra grid": ["orbital-drift", "glass-chime", "cinematic-tension", "choir-vector", "relay-dub"],
  "jungle wreckage": ["low-orbit", "acid-grid", "signal-chase", "tape-static"],
  "salt marshes": ["night-raid", "cinematic-tension", "glass-chime", "choir-vector"],
};

const KIND_STYLES: Partial<Record<MissionKind, readonly MusicStyleName[]>> = {
  harvestQuota: ["chrome-fanfare", "neon-arpeggio", "orbital-drift", "signal-chase", "disco-command"],
  forceQuota: ["chrome-fanfare", "neon-arpeggio", "signal-chase", "disco-command", "bit-garrison"],
  structureQuota: ["industrial-march", "chrome-fanfare", "cinematic-tension", "choir-vector"],
  holdTheLine: ["cinematic-tension", "industrial-march", "foundry-stomp", "choir-vector"],
  sabotage: ["acid-grid", "signal-chase", "night-raid", "break-wire", "tape-static"],
  destroyMarked: ["signal-chase", "acid-grid", "night-raid", "break-wire"],
  razeAll: ["foundry-stomp", "industrial-march", "signal-chase", "resonant-coil"],
  annihilate: ["foundry-stomp", "signal-chase", "night-raid", "break-wire"],
  decapitate: ["industrial-march", "cinematic-tension", "foundry-stomp", "tape-static"],
  escort: ["neon-arpeggio", "signal-chase", "chrome-fanfare", "disco-command"],
  rescue: ["neon-arpeggio", "night-raid", "orbital-drift", "relay-dub"],
  extraction: ["signal-chase", "neon-arpeggio", "glass-chime", "dune-cipher", "relay-dub"],
};

const KIND_ARRANGEMENTS: Partial<Record<MissionKind, readonly MusicArrangementName[]>> = {
  harvestQuota: ["forward-drive", "wide-open", "command-theme", "half-time-break"],
  forceQuota: ["forward-drive", "command-theme", "wide-open", "anthem-lift"],
  structureQuota: ["command-theme", "forward-drive", "wide-open", "inverted-hold"],
  holdTheLine: ["bass-siege", "command-theme", "anthem-lift", "half-time-break"],
  sabotage: ["syncopated-strike", "call-and-echo", "echo-canon", "drums-out"],
  destroyMarked: ["syncopated-strike", "forward-drive", "melody-late", "call-and-echo"],
  razeAll: ["panic-run", "bass-siege", "double-drop", "forward-drive"],
  annihilate: ["panic-run", "double-drop", "bass-siege", "drums-out"],
  decapitate: ["bass-siege", "panic-run", "anthem-lift", "double-drop"],
  escort: ["command-theme", "forward-drive", "wide-open", "call-and-echo"],
  rescue: ["forward-drive", "command-theme", "echo-canon", "wide-open"],
  extraction: ["command-theme", "forward-drive", "melody-late", "anthem-lift"],
};

export function musicMissionContext(seed: number, missionIndex: number): MusicMissionContext {
  const biome = generateWorld(seed).biome;
  const kinds = pickMissionKinds(seed);
  if (missionIndex === TUTORIAL_MUSIC_MISSION || missionIndex < 0) {
    return { biome };
  }
  return {
    biome,
    missionKind: kinds[missionIndex],
  };
}

export function campaignMusicContexts(seed: number): MusicMissionContext[] {
  const biome = generateWorld(seed).biome;
  const kinds = pickMissionKinds(seed);
  return kinds.map((missionKind) => ({ biome, missionKind }));
}

export function styleAffinityScore(name: MusicStyleName, ctx: MusicMissionContext): number {
  let score = 0;
  if (ctx.biome && BIOME_STYLES[ctx.biome]?.includes(name)) score += 6;
  if (ctx.biome && BIOME_STYLES_SECONDARY[ctx.biome]?.includes(name)) score += 2;
  if (ctx.missionKind && KIND_STYLES[ctx.missionKind]?.includes(name)) score += 3;
  return score;
}

export function arrangementAffinityScore(name: MusicArrangementName, ctx: MusicMissionContext): number {
  if (ctx.missionKind && KIND_ARRANGEMENTS[ctx.missionKind]?.includes(name)) return 3;
  return 0;
}

export function pickBestByScore<T>(
  candidates: readonly T[],
  scoreOf: (item: T) => number,
  rng: Rng,
): T {
  if (candidates.length === 0) throw new Error("pickBestByScore requires candidates");
  const shuffled = rng.shuffle(candidates);
  let best = shuffled[0] as T;
  let bestScore = scoreOf(best);
  for (const candidate of shuffled) {
    const score = scoreOf(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function assignCampaignItems<T>(
  items: readonly T[],
  contexts: readonly MusicMissionContext[],
  scoreOf: (item: T, ctx: MusicMissionContext) => number,
  rng: Rng,
): T[] {
  const remaining = [...items];
  const pending = contexts.map((_, index) => index);
  const slots: (T | undefined)[] = contexts.map(() => undefined);
  while (pending.length > 0) {
    let target = pending[0]!;
    let fewestPrimary = Infinity;
    for (const index of pending) {
      const ctx = contexts[index]!;
      const primaryCount = remaining.filter((item) => scoreOf(item, ctx) >= 6).length;
      if (primaryCount < fewestPrimary || (primaryCount === fewestPrimary && index < target)) {
        fewestPrimary = primaryCount;
        target = index;
      }
    }
    const ctx = contexts[target]!;
    const pick = pickBestByScore(remaining, (item) => scoreOf(item, ctx), rng.fork(String(target)));
    slots[target] = pick;
    remaining.splice(remaining.indexOf(pick), 1);
    pending.splice(pending.indexOf(target), 1);
  }
  return slots as T[];
}

export function pickAssignedItem<T>(
  items: readonly T[],
  contexts: readonly MusicMissionContext[],
  missionIndex: number,
  scoreOf: (item: T, ctx: MusicMissionContext) => number,
  rng: Rng,
  fallbackCtx: MusicMissionContext,
): T {
  const assigned = assignCampaignItems(items, contexts, scoreOf, rng);
  if (missionIndex >= 0 && missionIndex < assigned.length) return assigned[missionIndex]!;
  const used = new Set(assigned);
  const leftover = items.filter((item) => !used.has(item));
  if (leftover.length === 0) {
    return pickBestByScore(items, (item) => scoreOf(item, fallbackCtx), rng.fork(String(missionIndex)));
  }
  const orderedLeftover = rng.fork("leftover-order").shuffle(leftover);
  const offset = missionIndex - assigned.length;
  return orderedLeftover[offset % orderedLeftover.length]!;
}

export function applyMissionTints(style: MusicStyleProfile, ctx: MusicMissionContext): MusicStyleProfile {
  const next: MusicStyleProfile = { ...style, drum: { ...style.drum } };
  const biome = ctx.biome;
  const kind = ctx.missionKind;
  if (biome === "ash plains" || biome === "volcanic shelf" || biome === "rust canyons") {
    next.drum.kickStart += 12;
    next.drum.kickTail = Math.max(0.1, next.drum.kickTail - 0.03);
    next.reverbSeconds *= 0.88;
    next.cutoffMin *= 0.92;
    next.cutoffMax *= 0.92;
  } else if (biome === "crystal flats" || biome === "glass desert") {
    next.delayWet = Math.min(0.5, next.delayWet + 0.06);
    next.cutoffMin *= 1.08;
    next.cutoffMax *= 1.1;
  } else if (biome === "tundra grid") {
    next.reverbSeconds *= 1.1;
    next.reverbWet = Math.min(0.46, next.reverbWet + 0.04);
    next.drumDensity *= 0.94;
  } else if (biome === "jungle wreckage" || biome === "salt marshes") {
    next.delayFeedback = Math.min(0.55, next.delayFeedback + 0.06);
    next.delayWet = Math.min(0.5, next.delayWet + 0.05);
  }

  if (kind === "harvestQuota" || kind === "forceQuota" || kind === "structureQuota") {
    next.drumDensity *= 0.92;
    next.tempoBias -= 1;
  } else if (kind === "holdTheLine") {
    next.drumDensity *= 0.98;
  } else if (kind === "sabotage" || kind === "destroyMarked") {
    next.tempoBias += 2;
    next.drumDensity = Math.min(1, next.drumDensity * 1.06);
  } else if (kind === "razeAll" || kind === "annihilate" || kind === "decapitate") {
    next.tempoBias += 3;
    next.drumDensity = Math.min(1, next.drumDensity * 1.12);
  } else if (kind === "escort" || kind === "rescue" || kind === "extraction") {
    next.drumDensity *= 0.96;
    next.reverbWet = Math.min(0.46, next.reverbWet + 0.03);
    next.counterChance = Math.min(1, next.counterChance + 0.08);
  }
  return next;
}

export function assignmentRng(seed: number, cue: MusicCue, label: string): Rng {
  return createRng(seed, `${label}:${cue}`);
}
