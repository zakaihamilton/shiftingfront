import { createRng, type Rng } from "../../seed/rng";
import {
  type MusicCue,
  type MusicMotif,
  type MusicPattern,
  type MusicSection,
  type MusicStem,
  type MusicNoteEvent,
  type MusicDrumEvent,
  type MusicIntensityLayer,
  type MusicTheme,
  type MusicIntensity,
  MUSIC_BARS,
  MUSIC_STEPS,
  STEPS_PER_BAR,
  BARS_PER_SECTION,
  VERSE_CONTOURS,
  VERSE_RHYTHMS,
  SIGNATURE_CONTOURS,
  SIGNATURE_RHYTHMS,
  ARP_FIGURES,
  OPEN_HAT_FIGURES,
  SECTION_ORDER,
} from "./types";
import {
  midiToHz,
  musicLabel,
  bpmFor,
  scaleFor,
  progressionsFor,
  sectionEnergy,
  isSparseCue,
  pickDifferent,
  pickCycle,
  noteEvent,
  drumEvent,
  drumEventUnique,
  legacyNotes,
  legacyHits,
} from "./helpers";
import { bassRiffsFor, createMusicStyle, styleRng } from "./styles";
import { musicMissionContext } from "./missionContext";
import { cueMotifPhrases } from "./cueThemes";
import { missionMotifPalette } from "./missionThemes";
import { smoothMelodyLine } from "./stems";
import { composeBar, type ComposeCarry } from "./composeBar";

const CINEMATIC_VERSE_CONTOURS: readonly (readonly (number | null)[])[] = [
  [0, null, 2, 3, 4, 2, 1, 0],
  [0, 2, null, 4, 3, 2, 0, null],
  [2, 0, 2, 4, 5, 4, 2, 0],
  [0, 1, 3, 4, 2, 0, null, 1],
  [0, 2, 4, 3, 2, 4, 5, 0],
  [0, 2, 3, 5, 3, 2, 4, 0],
  [4, 2, 0, 1, 3, 2, 4, 0],
  [0, null, 4, 5, 4, 2, null, 0],
  [2, 4, 5, 3, 1, 2, 0, 2],
];

const CINEMATIC_VERSE_RHYTHMS: readonly number[][] = [
  [0, 3, 6, 8, 10, 12, 14, 15],
  [0, 2, 5, 8, 10, 12, 14, 15],
  [0, 3, 6, 9, 11, 12, 14, 15],
  [0, 2, 6, 8, 11, 13, 14, 15],
  [0, 2, 4, 7, 9, 11, 13, 15],
  [0, 4, 6, 8, 10, 12, 14, 15],
  [1, 3, 6, 8, 10, 12, 14, 15],
  [0, 3, 5, 8, 10, 12, 13, 15],
];

const CINEMATIC_HOOK_CONTOURS: readonly (readonly (number | null)[])[] = [
  [0, 2, 4, 5, 4, 2, 0],
  [0, 2, 3, 5, 4, 2, 0],
  [2, 4, 5, 4, 2, 0, 2],
  [4, 2, 0, 2, 4, 5, 4],
  [0, 2, 4, 3, 5, 2, 0],
  [0, 1, 3, 5, 3, 2, 0],
  [2, 0, 2, 4, 3, 2, 0],
  [0, 3, 2, 4, 5, 3, 0],
];

const CINEMATIC_HOOK_RHYTHMS: readonly number[][] = [
  [0, 3, 6, 8, 11, 13, 15],
  [0, 2, 6, 9, 11, 14, 15],
  [0, 4, 7, 9, 12, 14, 15],
  [0, 2, 5, 8, 10, 12, 15],
  [0, 1, 4, 7, 10, 12, 15],
  [0, 3, 5, 8, 11, 14, 15],
];

function makeSections(): MusicSection[] {
  return SECTION_ORDER.map((name, index) => ({
    name,
    startBar: index * BARS_PER_SECTION,
    endBar: index * BARS_PER_SECTION + BARS_PER_SECTION,
    energy: sectionEnergy(name),
  }));
}

function motifFrom(
  rng: Rng,
  contours: readonly (readonly (number | null)[])[],
  rhythms: readonly number[][],
  avoid?: MusicMotif,
): MusicMotif {
  const availableContours = avoid
    ? contours.filter((candidate) => JSON.stringify(candidate) !== JSON.stringify(avoid.degrees))
    : contours;
  const contour = rng.pick(availableContours.length > 0 ? availableContours : contours);
  const response = pickDifferent(rng, contours, contour);
  const rhythm = rng.pick(rhythms);
  const accents = rng.pick([
    [0, 2],
    [0, 3],
    [1, 4],
  ]);
  return {
    degrees: [...contour],
    response: [...response],
    rhythm: [...rhythm],
    accentSteps: [...accents],
  };
}

function nudgeResponse(degrees: readonly (number | null)[]): (number | null)[] {
  const response = [...degrees];
  const index = response.findIndex((degree, position) => degree !== null && position > 0 && position < response.length - 1);
  if (index < 0) return response;
  const degree = response[index]!;
  response[index] = degree < 4 ? degree + 1 : degree - 1;
  return response;
}

function motifFromPhrases(
  rng: Rng,
  phrases: readonly { degrees: readonly (number | null)[]; rhythm: readonly number[] }[],
  avoid?: MusicMotif,
): MusicMotif {
  const available = avoid
    ? phrases.filter((phrase) => JSON.stringify(phrase.degrees) !== JSON.stringify(avoid.degrees))
    : phrases;
  const call = rng.pick(available.length > 0 ? available : phrases);
  const alternates = phrases.filter((phrase) =>
    phrase.degrees.length === call.degrees.length
    && JSON.stringify(phrase.degrees) !== JSON.stringify(call.degrees),
  );
  const response = alternates.length > 0 ? [...rng.pick(alternates).degrees] : nudgeResponse(call.degrees);
  return {
    degrees: [...call.degrees],
    response,
    rhythm: [...call.rhythm],
    accentSteps: [...rng.pick([[0, 2], [0, 3], [1, 4]] as const)],
  };
}

function transposeMotif(motif: MusicMotif, degreeOffset: number): MusicMotif {
  const transpose = (degrees: readonly (number | null)[]) =>
    degrees.map((degree) => degree === null ? null : degree + degreeOffset);
  return {
    degrees: transpose(motif.degrees),
    response: transpose(motif.response),
    rhythm: [...motif.rhythm],
    accentSteps: [...motif.accentSteps],
  };
}

function signatureMotifFrom(rng: Rng): MusicMotif {
  return motifFrom(rng, SIGNATURE_CONTOURS, SIGNATURE_RHYTHMS);
}

function makeIntensityLayers(
  notes: Record<MusicStem, MusicNoteEvent[]>,
  drums: MusicDrumEvent[],
  sections: readonly MusicSection[],
  cue: MusicCue,
): Partial<Record<Exclude<MusicIntensity, "calm">, MusicIntensityLayer>> {
  if (cue !== "mission") return {};
  const engaged: MusicIntensityLayer = { notes: { counter: [], guitar: [] }, drums: [] };
  const critical: MusicIntensityLayer = { notes: { counter: [], harmony: [] }, drums: [] };
  const engagedCounter = engaged.notes.counter!;
  const criticalCounter = critical.notes.counter!;
  const engagedGuitar = engaged.notes.guitar!;
  const criticalPiano = critical.notes.harmony!;
  const sectionAt = (step: number) => sections[Math.floor(step / (STEPS_PER_BAR * BARS_PER_SECTION))];

  for (const lead of notes.melody) {
    const section = sectionAt(lead.step);
    if (!section || section.energy < 0.64) continue;
    const beat = lead.step % STEPS_PER_BAR;
    if (lead.accent || beat === 0 || beat === 8) {
      noteEvent(engagedCounter, lead.step, lead.midi - 12, Math.min(lead.duration, 3), lead.velocity * 0.3, !!lead.accent);
    }
    if (lead.accent || (lead.step % 8 === 0 && lead.step % 32 === 0)) {
      noteEvent(criticalCounter, lead.step, lead.midi + 12, Math.min(lead.duration, 3), lead.velocity * 0.24, !!lead.accent);
    }
  }

  for (const strum of notes.guitar) {
    const section = sectionAt(strum.step);
    if (!section || section.energy < 0.62 || !strum.accent) continue;
    noteEvent(engagedGuitar, strum.step, strum.midi + 12, Math.min(strum.duration, 2), strum.velocity * 0.24, true);
  }

  for (const chord of notes.harmony) {
    const section = sectionAt(chord.step);
    if (!section || section.energy < 0.72 || !chord.accent) continue;
    noteEvent(criticalPiano, chord.step, chord.midi + 12, Math.min(chord.duration, 2), chord.velocity * 0.2, true);
  }

  const hasDrum = (step: number, kind: MusicDrumEvent["kind"]) =>
    drums.some((event) => event.step === step && event.kind === kind);
  for (let bar = 0; bar < MUSIC_BARS; bar++) {
    const section = sections[Math.floor(bar / BARS_PER_SECTION)];
    if (!section || section.energy < 0.58) continue;
    const origin = bar * STEPS_PER_BAR;
    if (bar % 4 === 3 && !hasDrum(origin + 14, "shaker")) {
      drumEvent(engaged.drums, origin + 14, "shaker", 0.2);
    }
    if (bar % 2 === 1) {
      if (!hasDrum(origin + 6, "hat") && !hasDrum(origin + 6, "openHat")) {
        drumEventUnique(critical.drums, origin + 6, "openHat", 0.3);
      }
      if (!hasDrum(origin + 14, "hat") && !hasDrum(origin + 14, "openHat")) {
        drumEventUnique(critical.drums, origin + 14, "openHat", 0.34, true);
      }
    }
    if (bar % 8 === 7) {
      if (!hasDrum(origin + 12, "tom")) drumEventUnique(critical.drums, origin + 12, "tom", 0.42);
      if (!hasDrum(origin + 14, "tom")) drumEventUnique(critical.drums, origin + 14, "tom", 0.5, true);
    }
  }
  return { engaged, critical };
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
  return Array.from({ length: MUSIC_BARS / 8 }, (_, phraseIndex) => {
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
  const rootMidi = cue === "defeat"
    ? harmonyRng.intRange(33, 40)
    : harmonyRng.intRange(36, 46);
  const groove = style.groove;
  const context = musicMissionContext(seed, missionIndex);
  const missionPalette = cue === "mission" ? missionMotifPalette(context.missionKind) : undefined;
  const progressions = progressionsFor(scalePick.name, style.progressionVariant);
  const [progressionA, progressionB, progressionC, progressionD] = pickCycle(harmonyRng, progressions);
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
  const developmentMotif = cue === "mission"
    ? transposeMotif(motif, 1)
    : cueBook
      ? motifFromPhrases(melodyRng, cueBook.verse, motif)
      : motifFrom(melodyRng, verseContours, verseRhythms, motif);
  const hook = cue === "mission"
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
  const carry: ComposeCarry = { previousMelodyMidi: null, previousBassMidi: null, previousPadVoicing: null };
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

  smoothMelodyLine(notes.melody, cue === "mission" ? { min: 36, max: 100 } : { min: 0, max: 127 });
  notes.counter = notes.counter.filter(
    (note) => !notes.melody.some((lead) => lead.step === note.step && lead.midi === note.midi),
  );

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
