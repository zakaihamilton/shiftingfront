import { createRng, type Rng } from "../../../seed/rng";
import type { MusicCue, MusicStyleProfile } from "../types";
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
  return STYLE_BLUEPRINTS;
}

export function selectStyleBlueprint(cue: MusicCue, seed: number, missionIndex: number): StyleBlueprint {
  const pool = stylePoolFor(cue);
  const tieRng = assignmentRng(seed, cue, "music-style-order");
  const ctx = musicMissionContext(seed, Math.max(0, missionIndex));
  if (cue !== "mission" || missionIndex < 0) {
    return pickBestByScore(pool, (item) => styleAffinityScore(item.name, ctx), tieRng.fork(String(missionIndex)));
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
  return applyMissionTints(profile, context);
}

export function styleRng(seed: number, cue: MusicCue, missionIndex: number): Rng {
  return createRng(seed, `music-style:${cue}:${missionIndex}`);
}
