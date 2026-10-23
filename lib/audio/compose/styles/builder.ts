import { createRng, type Rng } from "../../../seed/rng";
import type { MusicCue, MusicStyleName, MusicStyleProfile, MusicVoiceType } from "../types";
import {
  applyMissionTints,
  assignmentRng,
  campaignMusicContexts,
  musicMissionContext,
  pickAssignedItem,
  pickBestByScore,
  styleAffinityScore,
} from "../missionContext";
import type { Range, StyleBlueprint } from "./types";
import { STYLE_BLUEPRINTS } from "./blueprints";
import { arrangementFor } from "./arrangements";

const CINEMATIC_MISSION_STYLES = new Set<MusicStyleName>([
  "neon-arpeggio",
  "industrial-march",
  "cinematic-tension",
  "signal-chase",
  "chrome-fanfare",
  "low-orbit",
  "foundry-stomp",
  "night-raid",
  "ice-protocol",
  "orbital-drift",
  "glass-chime",
  "dune-cipher",
  "choir-vector",
  "break-wire",
]);

function rangeValue(rng: Rng, range: Range): number {
  return range[0] + rng.next() * (range[1] - range[0]);
}

function integerValue(rng: Rng, range: Range): number {
  return Math.round(rangeValue(rng, range));
}

function stylePoolFor(cue: MusicCue): readonly StyleBlueprint[] {
  const menuStyles = [
    "cinematic-tension",
    "industrial-march",
    "foundry-stomp",
    "low-orbit",
    "ice-protocol",
    "choir-vector",
    "orbital-drift",
    "glass-chime",
    "dune-cipher",
    "relay-dub",
    "chrome-fanfare",
    "signal-chase",
    "disco-command",
    "neon-arpeggio",
  ];
  if (cue === "defeat") {
    return STYLE_BLUEPRINTS.filter((style) => ["industrial-march", "cinematic-tension", "low-orbit", "ice-protocol", "foundry-stomp", "choir-vector", "relay-dub"].includes(style.name));
  }
  if (cue === "victory") {
    return STYLE_BLUEPRINTS.filter((style) => ["neon-arpeggio", "orbital-drift", "signal-chase", "chrome-fanfare", "glass-chime", "disco-command", "choir-vector"].includes(style.name));
  }
  if (cue === "briefing") {
    return STYLE_BLUEPRINTS.filter((style) => ["orbital-drift", "cinematic-tension", "low-orbit", "ice-protocol", "glass-chime", "choir-vector", "relay-dub", "dune-cipher"].includes(style.name));
  }
  if (cue === "menu") {
    return STYLE_BLUEPRINTS.filter((style) => menuStyles.includes(style.name));
  }
  if (cue === "mission") {
    return STYLE_BLUEPRINTS.filter((style) => CINEMATIC_MISSION_STYLES.has(style.name));
  }
  return STYLE_BLUEPRINTS;
}

function roundVoiceType(type: MusicVoiceType): MusicVoiceType {
  return type === "square" ? "triangle" : type;
}

function refineCinematicSound(profile: MusicStyleProfile, cue: MusicCue): MusicStyleProfile {
  const mission = cue === "mission";
  const softenedDetune = profile.padDetune.map((cents) => Math.max(-16, Math.min(16, Math.round(cents * 0.8)))) as [number, number, number, number];
  return {
    ...profile,
    bassType: roundVoiceType(profile.bassType),
    pulseType: roundVoiceType(profile.pulseType),
    melodyType: roundVoiceType(profile.melodyType),
    counterType: roundVoiceType(profile.counterType),
    padType: roundVoiceType(profile.padType),
    padDetune: softenedDetune,
    padLfoDepth: Math.min(profile.padLfoDepth, 320),
    padQ: Math.min(profile.padQ, 2.2),
    delayWet: Math.min(profile.delayWet, mission ? 0.18 : 0.22),
    delayFeedback: Math.min(profile.delayFeedback, 0.46),
    reverbSeconds: Math.min(2.4, Math.max(0.7, profile.reverbSeconds)),
    reverbDecay: Math.min(3.4, Math.max(2.1, profile.reverbDecay)),
    reverbSend: Math.min(mission ? 0.2 : 0.24, Math.max(0.08, profile.reverbSend)),
    reverbWet: Math.min(mission ? 0.18 : 0.22, Math.max(0.05, profile.reverbWet)),
    cutoffMin: Math.min(profile.cutoffMin, mission ? 980 : 1_100),
    cutoffMax: Math.min(profile.cutoffMax, mission ? 1_600 : 1_800),
    voiceEngine: "cinematic",
    drumKit: profile.drumKit === "chip-noise" ? "gated" : profile.drumKit,
    drumDensity: profile.drumDensity * (mission ? 0.96 : 0.98),
    saturationAmount: Math.min(profile.saturationAmount, 0.1),
    drum: colorRhythmSection({
      ...profile.drum,
      snareNoise: Math.min(profile.drum.snareNoise, 2_100),
      hatFrequency: Math.min(profile.drum.hatFrequency, 6_500),
      openHatFrequency: Math.min(profile.drum.openHatFrequency, 3_400),
    }, profile.name),
  };
}

function colorRhythmSection(drum: MusicStyleProfile["drum"], name: MusicStyleProfile["name"]): MusicStyleProfile["drum"] {
  const next = { ...drum };
  if (name === "foundry-stomp" || name === "industrial-march") {
    next.kickStart = Math.min(next.kickStart, 168);
    next.kickEnd = Math.min(next.kickEnd, 30);
    next.kickTail = Math.max(next.kickTail, 0.3);
    next.hatFrequency = Math.min(next.hatFrequency, 4_200);
    next.snareBody = Math.min(next.snareBody, 140);
  }
  if (name === "ice-protocol" || name === "glass-chime" || name === "low-orbit") {
    next.hatFrequency = Math.max(next.hatFrequency, 6_200);
    next.openHatFrequency = Math.max(next.openHatFrequency, 3_100);
    next.kickTail = Math.min(next.kickTail, 0.18);
    next.kickEnd = Math.max(next.kickEnd, 48);
  }
  return next;
}

export function selectStyleBlueprint(cue: MusicCue, seed: number, missionIndex: number): StyleBlueprint {
  const pool = stylePoolFor(cue);
  const tieRng = assignmentRng(seed, cue, "music-style-order");
  const ctx = musicMissionContext(seed, Math.max(0, missionIndex));
  if (cue !== "mission" || missionIndex < 0) {
    const avoid = new Set<string>();
    if (cue !== "mission") {
      avoid.add(selectStyleBlueprint("mission", seed, Math.max(0, missionIndex)).name);
      if (cue === "briefing" || cue === "victory" || cue === "defeat") {
        avoid.add(selectStyleBlueprint("menu", seed, missionIndex).name);
      }
      if (cue === "victory" || cue === "defeat") {
        avoid.add(selectStyleBlueprint("briefing", seed, missionIndex).name);
      }
      if (cue === "defeat") avoid.add(selectStyleBlueprint("victory", seed, missionIndex).name);
    }
    const narrowed = pool.filter((item) => !avoid.has(item.name));
    return pickBestByScore(narrowed.length > 0 ? narrowed : pool, (item) => styleAffinityScore(item.name, ctx), tieRng.fork(String(missionIndex)));
  }
  return pickAssignedItem(
    pool,
    campaignMusicContexts(seed),
    missionIndex,
    (item, mission) => styleAffinityScore(item.name, mission),
    tieRng,
    ctx,
  );
}

export function createMusicStyle(cue: MusicCue, rng: Rng, seed = 0, missionIndex = 0): MusicStyleProfile {
  const textureRng = rng.fork("texture");
  const blueprint = selectStyleBlueprint(cue, seed, missionIndex);
  const context = musicMissionContext(seed, missionIndex);
  const profile: MusicStyleProfile = {
    name: blueprint.name,
    scalePool: blueprint.scales,
    groove: textureRng.pick(blueprint.grooves),
    grooveVariant: textureRng.pick(blueprint.grooveVariants),
    progressionVariant: textureRng.pick(blueprint.progressionVariants),
    bassRiffFamily: blueprint.bassRiffFamily,
    arrangement: arrangementFor(cue, seed, missionIndex),
    tempoBias: integerValue(textureRng, blueprint.tempoBias),
    swing: rangeValue(textureRng, blueprint.swing),
    bassType: textureRng.pick(blueprint.bassTypes),
    pulseType: textureRng.pick(blueprint.pulseTypes),
    melodyType: textureRng.pick(blueprint.melodyTypes),
    counterType: textureRng.pick(blueprint.counterTypes),
    padType: textureRng.pick(blueprint.padTypes),
    padDetune: textureRng.pick(blueprint.padDetunes) as [number, number, number, number],
    padLfoRate: rangeValue(textureRng, blueprint.padLfoRate),
    padLfoDepth: rangeValue(textureRng, blueprint.padLfoDepth),
    padQ: rangeValue(textureRng, blueprint.padQ),
    delayBeats: textureRng.pick(blueprint.delayBeats),
    delayFeedback: rangeValue(textureRng, blueprint.delayFeedback),
    delayWet: rangeValue(textureRng, blueprint.delayWet),
    reverbSeconds: rangeValue(textureRng, blueprint.reverbSeconds),
    reverbDecay: rangeValue(textureRng, blueprint.reverbDecay),
    reverbSend: rangeValue(textureRng, blueprint.reverbSend),
    reverbWet: rangeValue(textureRng, blueprint.reverbWet),
    cutoffMin: blueprint.cutoff[0],
    cutoffMax: blueprint.cutoff[1],
    bassStride: textureRng.pick(blueprint.bassStrides),
    pulseStride: textureRng.pick(blueprint.pulseStrides),
    melodyOctave: textureRng.pick(blueprint.melodyOctaves),
    rhythmShift: textureRng.pick(blueprint.rhythmShifts),
    counterChance: rangeValue(textureRng, blueprint.counterChance),
    drumDensity: rangeValue(textureRng, blueprint.drumDensity),
    voiceEngine: blueprint.voiceEngine,
    drumKit: blueprint.drumKit,
    pulseRole: blueprint.pulseRole,
    saturationAmount: Math.min(0.2, rangeValue(textureRng, blueprint.saturation) * 0.58),
    drum: { ...blueprint.drum },
  };
  const tinted = applyMissionTints(profile, context);
  return refineCinematicSound(tinted, cue);
}

export function styleRng(seed: number, cue: MusicCue, missionIndex: number): Rng {
  return createRng(seed, `music-style:${cue}:${missionIndex}`);
}
