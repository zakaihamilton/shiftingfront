import { createRng, type Rng } from "../../seed/rng";
import {
  CINEMATIC_HOOK_CONTOURS,
  CINEMATIC_HOOK_RHYTHMS,
  CINEMATIC_VERSE_CONTOURS,
  CINEMATIC_VERSE_RHYTHMS,
} from "./cinematicMaterial";
import { type ComposeCarry, composeBar } from "./composeBar";
import { cueMotifPhrases } from "./cueThemes";
import {
  bpmFor,
  isSparseCue,
  legacyHits,
  legacyNotes,
  midiToHz,
  musicLabel,
  pickCycle,
  progressionsFor,
  scaleFor,
  sectionEnergy,
} from "./helpers";
import { makeIntensityLayers } from "./intensityLayers";
import { musicMissionContext } from "./missionContext";
import { missionMotifPalette } from "./missionThemes";
import { motifFrom, motifFromPhrases, signatureMotifFrom, transposeMotif } from "./motifs";
import { MELODY_HIGH, MELODY_LOW, REPEATED_SENTENCES, settleMissionMelody } from "./settleMelody";
import { smoothMelodyLine } from "./stems";
import { bassRiffsFor, createMusicStyle, styleRng } from "./styles";
import {
  ARP_FIGURES,
  BARS_PER_SECTION,
  MUSIC_BARS,
  MUSIC_STEPS,
  type MusicCue,
  type MusicDrumEvent,
  type MusicNoteEvent,
  type MusicPattern,
  type MusicSection,
  type MusicStem,
  type MusicTheme,
  OPEN_HAT_FIGURES,
  SECTION_ORDER,
  VERSE_CONTOURS,
  VERSE_RHYTHMS,
} from "./types";

function makeSections(): MusicSection[] {
  return SECTION_ORDER.map((name, index) => ({
    name,
    startBar: index * BARS_PER_SECTION,
    endBar: index * BARS_PER_SECTION + BARS_PER_SECTION,
    energy: sectionEnergy(name),
  }));
}

type PhrasePlan = {
  textureDropBar: number | null;
  miniFillBar: number | null;
  liftBar: 4 | 5;
};

function makePhrasePlans(
  rng: Rng,
  sections: readonly MusicSection[],
  arrangement: MusicPattern["style"]["arrangement"],
  sparse: boolean,
): PhrasePlan[] {
  const plans = Array.from({ length: MUSIC_BARS / 8 }, (_, phraseIndex) => {
    const sectionIndex = Math.floor(phraseIndex / 2);
    const section = sections[sectionIndex]!;
    const intro = section.name === "intro";
    const breakdown = section.name === "breakdown";
    const climax = section.name === "climax";
    const turnaround = section.name === "turnaround";
    const dropEligible = !sparse && !intro && !breakdown && !climax && !turnaround;
    const dropChance = arrangement.holdBass[sectionIndex]
      ? 0.34
      : section.name === "escalation"
        ? 0.18
        : 0.12;
    const textureDropBar = dropEligible && rng.next() < dropChance ? rng.pick([2, 6]) : null;
    const miniFillEligible = !sparse && !intro && !breakdown && !climax && textureDropBar === null;
    const miniFillBar = miniFillEligible && rng.next() < 0.28 ? 3 : null;
    return { textureDropBar, miniFillBar, liftBar: rng.pick([4, 5] as const) };
  });
  const repeated = new Set<string>(REPEATED_SENTENCES);
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const name = sections[sectionIndex]!.name;
    if (!repeated.has(name)) continue;
    plans[sectionIndex * 2 + 1] = { ...plans[sectionIndex * 2]! };
  }
  return plans;
}

export function composeMusic(seed: number, cue: MusicCue, missionIndex = 0): MusicPattern {
  const rng = createRng(seed, musicLabel(cue, missionIndex));
  const style = createMusicStyle(cue, styleRng(seed, cue, missionIndex), seed, missionIndex);
  const harmonyRng = rng.fork("harmony");
  const melodyRng = rng.fork("melody");
  const rhythmRng = rng.fork("rhythm");
  const drumRng = rng.fork("drums");
  const textureRng = rng.fork("texture");
  const formRng = rng.fork("form");
  const scalePick = scaleFor(cue, harmonyRng, style);
  const rootMidi = cue === "defeat" ? harmonyRng.intRange(33, 40) : harmonyRng.intRange(36, 46);
  const groove = style.groove;
  const context = musicMissionContext(seed, missionIndex);
  const missionPalette = cue === "mission" ? missionMotifPalette(context.missionKind) : undefined;
  const progressions = progressionsFor(scalePick.name, style.progressionVariant);
  const [progressionA, progressionB, progressionC, progressionD] = pickCycle(
    harmonyRng,
    progressions,
  );
  const bassRiffs = bassRiffsFor(style.bassRiffFamily);
  const [bassRiffA, bassRiffB, bassRiffC, bassRiffD] = pickCycle(harmonyRng, bassRiffs);
  const cinematicMaterial = style.voiceEngine === "cinematic";
  const verseContours = cinematicMaterial ? CINEMATIC_VERSE_CONTOURS : VERSE_CONTOURS;
  const verseRhythms = cinematicMaterial ? CINEMATIC_VERSE_RHYTHMS : VERSE_RHYTHMS;
  const cueBook = cueMotifPhrases(cue);
  const motif = missionPalette
    ? motifFromPhrases(melodyRng, missionPalette.phrases)
    : cueBook
      ? motifFromPhrases(melodyRng, cueBook.verse)
      : motifFrom(melodyRng, verseContours, verseRhythms);
  // Keep one recognizable mission phrase through the score, changing its
  // scale-degree center in development and hook sections instead of replacing its shape.
  const developmentMotif =
    cue === "mission"
      ? transposeMotif(motif, 1)
      : cueBook
        ? motifFromPhrases(melodyRng, cueBook.verse, motif)
        : motifFrom(melodyRng, verseContours, verseRhythms, motif);
  const hook =
    cue === "mission"
      ? transposeMotif(motif, 2)
      : cueBook
        ? motifFromPhrases(melodyRng, cueBook.hook)
        : cinematicMaterial
          ? motifFrom(melodyRng, CINEMATIC_HOOK_CONTOURS, CINEMATIC_HOOK_RHYTHMS)
          : signatureMotifFrom(melodyRng);
  const [arpFigureA, arpFigureB, arpFigureC, arpFigureD] = pickCycle(rhythmRng, ARP_FIGURES);
  const [openHatA, openHatB, openHatC, openHatD] = pickCycle(drumRng, OPEN_HAT_FIGURES);
  const sparse = isSparseCue(cue);
  const sections = makeSections();
  const arrangement = style.arrangement;
  const phrasePlans = makePhrasePlans(formRng, sections, arrangement, sparse);
  const notes: Record<MusicStem, MusicNoteEvent[]> = {
    bass: [],
    pulse: [],
    harmony: [],
    melody: [],
    counter: [],
    guitar: [],
  };
  const drums: MusicDrumEvent[] = [];
  const padRoot: number[] = [];
  const padThird: number[] = [];
  const padFifth: number[] = [];
  const padSeventh: number[] = [];
  const carry: ComposeCarry = {
    previousMelodyMidi: null,
    previousBassMidi: null,
    previousPadVoicing: null,
  };
  const barInput = {
    sections,
    phrasePlans,
    progressionA,
    progressionB,
    progressionC,
    progressionD,
    bassRiffA,
    bassRiffB,
    bassRiffC,
    bassRiffD,
    arpFigureA,
    arpFigureB,
    arpFigureC,
    arpFigureD,
    openHatA,
    openHatB,
    openHatC,
    openHatD,
    sparse,
    groove,
    arrangement,
    cue,
    style,
    rootMidi,
    scalePick,
    hook,
    developmentMotif,
    motif,
    notes,
    drums,
    padRoot,
    padThird,
    padFifth,
    padSeventh,
    drumRng,
  };
  for (let bar = 0; bar < MUSIC_BARS; bar++) composeBar(bar, barInput, carry);

  const theme: MusicTheme = {
    rootMidi,
    scale: [...scalePick.notes],
    scaleName: scalePick.name,
    groove,
    progressionA: [...progressionA],
    progressionB: [...progressionB],
    progressionC: [...progressionC],
    progressionD: [...progressionD],
    bassRiffA: [...bassRiffA],
    bassRiffB: [...bassRiffB],
    bassRiffC: [...bassRiffC],
    bassRiffD: [...bassRiffD],
    motif,
    developmentMotif,
    hook,
  };

  smoothMelodyLine(notes.melody, { min: MELODY_LOW, max: MELODY_HIGH });
  settleMissionMelody(
    notes.melody,
    notes.counter,
    sections,
    rootMidi,
    scalePick.notes,
    progressionC,
  );
  notes.counter = notes.counter.filter((note) => {
    const lead = notes.melody.find((entry) => entry.step === note.step);
    if (!lead) return true;
    const distance = Math.abs(note.midi - lead.midi) % 12;
    return distance !== 0 && distance !== 1 && distance !== 6 && distance !== 11;
  });

  const intensityLayers = makeIntensityLayers(notes, drums, sections, cue);

  return {
    cue,
    seed,
    missionIndex,
    biome: context.biome,
    missionKind: context.missionKind,
    bpm: bpmFor(cue, textureRng.int(64), missionIndex, style),
    swing: style.swing,
    bars: MUSIC_BARS,
    steps: MUSIC_STEPS,
    rootHz: midiToHz(rootMidi),
    rootMidi,
    scaleName: scalePick.name,
    cutoff: Math.round(style.cutoffMin + textureRng.next() * (style.cutoffMax - style.cutoffMin)),
    style,
    bassType: style.bassType,
    arpType: style.pulseType,
    melodyType: style.melodyType,
    counterType: style.counterType,
    delayBeats: style.delayBeats,
    theme,
    motif,
    sections,
    notes,
    drums,
    intensityLayers,
    bass: legacyNotes(notes.bass),
    arp: legacyNotes(notes.pulse),
    melody: legacyNotes(notes.melody),
    counter: legacyNotes(notes.counter),
    harmony: legacyNotes(notes.harmony),
    kick: legacyHits(drums, "kick"),
    snare: legacyHits(drums, "snare"),
    hats: legacyHits(drums, "hat"),
    openHats: legacyHits(drums, "openHat"),
    padRoot,
    padThird,
    padFifth,
    padSeventh,
  };
}

export * from "./stems";
