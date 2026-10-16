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
  grooveHits,
  sectionEnergy,
  isSparseCue,
  pickDifferent,
  pickCycle,
  mixEnergy,
  placePhraseFill,
  chordToneMidi,
  noteEvent,
  drumEvent,
  drumEventUnique,
  legacyNotes,
  legacyHits,
} from "./helpers";
import { bassRiffsFor, createMusicStyle, styleRng } from "./styles";
import { musicMissionContext } from "./missionContext";
import { missionMotifPalette } from "./missionThemes";
import {
  placeStylePercussion,
  placeHarmony,
  pulseStepsFor,
  voiceLeadPad,
  placeMelody,
  placeCounter,
  smoothMelodyLine,
} from "./stems";

const CINEMATIC_VERSE_CONTOURS: readonly (readonly (number | null)[])[] = [
  [0, null, 2, 3, 4, 2, 1, 0],
  [0, 2, null, 4, 3, 2, 0, null],
  [2, 0, 2, 4, 5, 4, 2, 0],
  [0, 1, 3, 4, 2, 0, null, 1],
  [0, 2, 4, 3, 2, 4, 5, 0],
];

const CINEMATIC_VERSE_RHYTHMS: readonly number[][] = [
  [0, 3, 6, 8, 10, 12, 14, 15],
  [0, 2, 5, 8, 10, 12, 14, 15],
  [0, 3, 6, 9, 11, 12, 14, 15],
  [0, 2, 6, 8, 11, 13, 14, 15],
];

const CINEMATIC_HOOK_CONTOURS: readonly (readonly (number | null)[])[] = [
  [0, 2, 4, 5, 4, 2, 0],
  [0, 2, 3, 5, 4, 2, 0],
  [2, 4, 5, 4, 2, 0, 2],
  [4, 2, 0, 2, 4, 5, 4],
];

const CINEMATIC_HOOK_RHYTHMS: readonly number[][] = [
  [0, 3, 6, 8, 11, 13, 15],
  [0, 2, 6, 9, 11, 14, 15],
  [0, 4, 7, 9, 12, 14, 15],
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

function signatureMotifFrom(rng: Rng): MusicMotif {
  return motifFrom(rng, SIGNATURE_CONTOURS, SIGNATURE_RHYTHMS);
}

function developMotif(motif: MusicMotif, pass: number): MusicMotif {
  if (pass <= 0) return motif;
  const vary = (values: readonly (number | null)[], direction: number) => values.map((value, index) => {
    if (value === null || index === 0 || index === values.length - 1) return value;
    return (index + pass) % 3 === 0 ? value + direction : value;
  });
  const direction = pass % 2 === 1 ? 1 : -1;
  const rhythm = [...motif.rhythm];
  const rhythmIndex = 1 + ((pass * 2) % Math.max(1, rhythm.length - 2));
  if (rhythm.length > 2) {
    const shift = pass % 2 === 1 ? 1 : -1;
    const next = Math.max(0, Math.min(STEPS_PER_BAR - 1, rhythm[rhythmIndex]! + shift));
    const occupied = new Set(rhythm.filter((_, index) => index !== rhythmIndex));
    if (!occupied.has(next)) rhythm[rhythmIndex] = next;
  }
  return {
    ...motif,
    degrees: vary(motif.degrees, direction),
    response: vary(motif.response, -direction),
    rhythm,
  };
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

function materialIndexForSection(name: MusicSection["name"]): 0 | 1 | 2 | 3 {
  if (name === "intro" || name === "groove" || name === "breakdown") return 0;
  if (name === "development") return 1;
  if (name === "hook" || name === "escalation" || name === "climax") return 2;
  if (name === "turnaround") return 3;
  return 3;
}

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
  const verseContours = missionPalette?.verseContours ?? (cinematicMaterial ? CINEMATIC_VERSE_CONTOURS : VERSE_CONTOURS);
  const verseRhythms = missionPalette?.verseRhythms ?? (cinematicMaterial ? CINEMATIC_VERSE_RHYTHMS : VERSE_RHYTHMS);
  const motif = motifFrom(melodyRng, verseContours, verseRhythms);
  const developmentMotif = motifFrom(melodyRng, verseContours, verseRhythms, motif);
  const hook = missionPalette
    ? motifFrom(melodyRng, missionPalette.hookContours, missionPalette.hookRhythms)
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
  let previousMelodyMidi: number | null = null;
  let previousPadVoicing: readonly number[] | null = null;

  for (let bar = 0; bar < MUSIC_BARS; bar++) {
    const sectionIndex = Math.floor(bar / BARS_PER_SECTION);
    const section = sections[sectionIndex]!;
    const origin = bar * STEPS_PER_BAR;
    const phraseBar = bar % BARS_PER_SECTION;
    const halfPhrase = phraseBar % 8;
    const phrasePlan = phrasePlans[Math.floor(bar / 8)]!;
    const materialIndex = materialIndexForSection(section.name);
    const cycle = Math.floor(bar / (BARS_PER_SECTION * 2)) % 4;
    const recurringHookSection = section.name === "hook" || section.name === "climax" || section.name === "turnaround";
    const progression = [progressionA, progressionB, progressionC, progressionD][materialIndex]!;
    // Let the turnaround foundation resolve independently while the hook lead keeps its contour.
    const leadProgression = section.name === "turnaround" ? progressionC : progression;
    const riff = section.name === "turnaround"
      ? bassRiffD
      : [bassRiffA, bassRiffB, bassRiffC, bassRiffD][materialIndex]!;
    const arpFigure = [arpFigureA, arpFigureB, arpFigureC, arpFigureD][cycle]!;
    const openHatSteps = [openHatA, openHatB, openHatC, openHatD][cycle]!;
    const fill = halfPhrase === 7;
    const intro = section.name === "intro";
    const breakdown = section.name === "breakdown";
    const climax = section.name === "climax";
    const hookSection = section.name === "hook" || section.name === "turnaround" || climax;
    if (phraseBar === 0 && recurringHookSection) previousMelodyMidi = null;
    const holdBass = arrangement.holdBass[sectionIndex]!;
    const energy = section.energy;
    const thinBar = halfPhrase === 2 || halfPhrase === 3;
    const liftBar = phrasePlan.liftBar === halfPhrase;
    const dropTexture = phrasePlan.textureDropBar === halfPhrase;
    const miniFill = phrasePlan.miniFillBar === halfPhrase && thinBar;
    const dropHats = dropTexture && !hookSection;
    const dropPulse = dropTexture && !hookSection;
    const hole = holdBass && phraseBar < 8;
    const fullDrums = !sparse && !dropTexture && (cue === "victory" || (!hole && (!intro || phraseBar >= 4)));
    const phraseEnd = phraseBar === 7 || phraseBar === 15;
    const lightDrums = sparse && !hole && (!intro || phraseBar >= 4) && (phraseBar % 2 === 0 || phraseEnd);
    let usePulse = arrangement.pulseEnabled[sectionIndex]!;
    if (intro && phraseBar < 4) usePulse = false;
    if (hole) usePulse = false;
    if (dropPulse) usePulse = false;
    const phraseSlot = phraseBar % 4;
    const response = phraseSlot === 1 || phraseSlot === 3;
    const phrasePass = Math.floor(phraseBar / 4);
    const restBar = section.name === "breakdown" && phraseSlot === 3;
    const useHookLead =
      hookSection ||
      (intro && phraseBar >= 12) ||
      (breakdown && phraseBar >= 8) ||
      (section.name === "escalation" && phraseBar >= 8);
    const echoBar = arrangement.echoMelody && section.name === "groove" && phraseBar % 2 === 0;
    const useMelody =
      arrangement.melodyEnabled[sectionIndex] &&
      !restBar &&
      !echoBar &&
      (section.name === "groove" ||
        section.name === "development" ||
        section.name === "escalation" ||
        hookSection ||
        (intro && phraseBar >= 8) ||
        (breakdown && phraseBar >= 8));
    const useCounter = !sparse && arrangement.counterEnabled[sectionIndex]! && (useMelody || echoBar) && response && halfPhrase >= 4;
    const sequenceOffset = hookSection ? 0 : liftBar ? 2 : 0;
    const sequenceOctave = climax && style.melodyOctave === 1 ? 2 : style.melodyOctave;
    const variant = (climax
      ? 0
      : section.name === "development"
        ? 1
        : section.name === "escalation" && !useHookLead
          ? 1
          : 0) + arrangement.melodyDegreeOffset + sequenceOffset;
    const chord = phraseEnd ? 0 : progression[Math.floor(phraseBar / 2)] ?? 0;
    const leadChord = phraseEnd ? 0 : leadProgression[Math.floor(phraseBar / 2)] ?? 0;

    const padVoicing = voiceLeadPad(rootMidi, scalePick.notes, chord, previousPadVoicing);
    previousPadVoicing = padVoicing;
    padRoot.push(midiToHz(padVoicing[0]));
    padThird.push(midiToHz(padVoicing[1]));
    padFifth.push(midiToHz(padVoicing[2]));
    padSeventh.push(midiToHz(padVoicing[3]));

    const pianoSteps = intro
      ? phraseBar >= 8 && phraseBar % 4 === 0 ? [0] : []
      : breakdown
        ? phraseBar % 4 === 0 ? [0] : []
        : hookSection || section.name === "escalation" ? [0, 8] : [0];
    for (const pianoStep of pianoSteps) {
      placeHarmony(
        notes.harmony,
        origin,
        padVoicing.slice(0, 3),
        pianoStep,
        2,
        mixEnergy(hookSection ? 0.28 : 0.22, energy),
        pianoStep === 0 && phraseBar % 4 === 0,
      );
    }

    if (!sparse && !intro && !breakdown && !dropTexture) {
      const guitarSteps = hookSection || section.name === "escalation" ? [1, 5, 9, 13] : [5, 13];
      const guitarChord = padVoicing.slice(1, 4).map((midi) => midi + 12);
      for (const guitarStep of guitarSteps) {
        guitarChord.forEach((midi, chordIndex) => {
          noteEvent(
            notes.guitar,
            origin + guitarStep + chordIndex,
            midi,
            2,
            mixEnergy((hookSection ? 0.25 : 0.19) * (1 - chordIndex * 0.12), energy),
            chordIndex === 0 && guitarStep % 8 === 1,
          );
        });
      }
    }

    const sectionBassStride = arrangement.bassStrides[sectionIndex]!;
    const bassStride = holdBass ? 8 : intro ? Math.max(4, sectionBassStride) as 4 | 8 : sectionBassStride;
    if (holdBass) {
      noteEvent(notes.bass, origin, chordToneMidi(rootMidi, scalePick.notes, chord, 0, -1), 8, mixEnergy(0.58, energy), true);
      if (bar % 2 === 1) noteEvent(notes.bass, origin + 8, chordToneMidi(rootMidi, scalePick.notes, chord, 0, 0), 6, mixEnergy(0.46, energy));
    } else {
      for (let i = 0; i < 8; i++) {
        if (i % (bassStride / 2) !== 0 && bassStride > 2) continue;
        const hit = riff[i];
        if (!hit) continue;
        const octave = climax && i % 3 === 2 ? hit.oct + 1 : hit.oct;
        noteEvent(
          notes.bass,
          origin + i * 2,
          chordToneMidi(rootMidi, scalePick.notes, chord, hit.tone, octave),
          intro ? 3 : 2,
          mixEnergy(i === 0 || i === 4 ? 0.92 : 0.7, energy),
          i === 0 || i === 4,
        );
      }
    }

    if (usePulse && style.pulseRole !== "none") {
      const sectionPulseStride = arrangement.pulseStrides[sectionIndex]!;
      const requestedPulseStride = hole || (sparse && cue === "defeat")
        ? 4
        : hookSection && sectionPulseStride === 1
          ? 2
          : sectionPulseStride;
      // Sixteenth-note arps read as a game-console texture. Let the drums
      // provide urgency at the peak while the fastest pulse stays musical.
      const pulseStride = Math.max(4, requestedPulseStride);
      for (const i of pulseStepsFor(style.pulseRole, pulseStride)) {
        const figureIndex = Math.floor(i / 2) % arpFigure.length;
        const velocity = climax
          ? i % 2 === 0 ? 0.7 : 0.36
          : section.name === "hook" || section.name === "escalation"
            ? 0.56
            : 0.48;
        noteEvent(
          notes.pulse,
          origin + i,
          chordToneMidi(rootMidi, scalePick.notes, chord, arpFigure[figureIndex]!, 1),
          style.pulseRole === "stab" ? 3 : 1,
          mixEnergy(velocity, energy),
          i % 4 === 0,
        );
      }
    }

    const stepShift = bar % 2 === 1 ? style.rhythmShift + arrangement.rhythmOffset : arrangement.rhythmOffset;
    const phraseStepShift = (stepShift + [0, 0, 1, -1][phrasePass]! + STEPS_PER_BAR) % STEPS_PER_BAR;
    if (useMelody) {
      const baseLead = useHookLead
        ? hook
        : section.name === "development" || (phraseBar >= 8 && !intro)
          ? developmentMotif
          : motif;
      const lead = developMotif(baseLead, phrasePass);
      const velocity = mixEnergy(climax ? 0.96 : hookSection ? 0.86 : 0.74, energy);
      const durationFor = (index: number, sounding: number) => {
        if (useHookLead) return index === sounding - 1 ? (cinematicMaterial ? 5 : 3) : cinematicMaterial ? 4 : 4;
        return cinematicMaterial ? (liftBar ? 4 : 3) : liftBar ? 3 : 2;
      };
      previousMelodyMidi = placeMelody(
        notes.melody,
        origin,
        lead,
        response,
        rootMidi,
        scalePick.notes,
        leadChord,
        variant,
        sequenceOctave,
        durationFor,
        velocity,
        climax,
        null,
        phraseEnd,
        previousMelodyMidi,
        phraseStepShift,
      );
    }

    if (echoBar && phraseBar > 0) {
      previousMelodyMidi = placeMelody(
        notes.melody,
        origin,
        developMotif(motif, phrasePass),
        false,
        rootMidi,
        scalePick.notes,
        leadChord,
        variant,
        sequenceOctave,
        () => 2,
        mixEnergy(0.48, energy),
        false,
        null,
        false,
        previousMelodyMidi,
        phraseStepShift + 2,
      );
    }

    if (useCounter) {
      const baseLead = useHookLead
        ? hook
        : section.name === "development" || (phraseBar >= 8 && !intro)
          ? developmentMotif
          : motif;
      const lead = developMotif(baseLead, phrasePass);
      const interval = climax ? 5 : hookSection ? 2 : 5;
      const counterOctave = 1;
      placeCounter(
        notes.counter,
        notes.melody,
        origin,
        lead,
        response,
        rootMidi,
        scalePick.notes,
        leadChord,
        variant,
        counterOctave,
        interval,
        phraseStepShift,
        climax ? 4 : 2,
        mixEnergy(climax ? 0.38 : 0.18 + style.counterChance * 0.14, energy),
      );
    }

    if (fullDrums || lightDrums) {
      const grooveVariantNow = ((bar >= MUSIC_BARS / 2 ? style.grooveVariant + 1 : style.grooveVariant) % 3) as 0 | 1 | 2;
      const hits = grooveHits(groove, cycle % 2 as 0 | 1, grooveVariantNow);
      const density = Math.min(1, style.drumDensity * arrangement.drumDensity[sectionIndex]!);
      const drumGain = mixEnergy(fullDrums ? 0.82 + density * 0.18 : 0.54 + density * 0.12, energy) * (cue === "mission" ? 0.78 : 1);
      for (const step of hits.kick) drumEvent(drums, origin + step, "kick", (step === 0 ? 0.95 : 0.72) * drumGain, step === 0, drumRng);
      for (const step of hits.snare) {
        const accent = step === 4 || step === 12;
        drumEvent(drums, origin + step, "snare", (accent ? 0.9 : 0.62) * drumGain, accent, drumRng);
        if (!sparse && !hole && accent && (section.name === "hook" || section.name === "climax") && phraseBar % 4 === 0) {
          drumEvent(drums, origin + step, "clap", 0.28 * drumGain, true, drumRng);
        }
      }
      const requestedHatStride = sparse
        ? Math.max(2, dropHats ? 4 : arrangement.hatStride[sectionIndex]!)
        : climax ? 2 : dropHats ? 4 : arrangement.hatStride[sectionIndex]!;
      const hatStride = cue === "mission" ? Math.max(2, requestedHatStride) : requestedHatStride;
      for (let step = 0; step < STEPS_PER_BAR; step += hatStride) {
        const offbeat = climax ? step % 2 === 1 : step % 4 === 2;
        drumEvent(drums, origin + step, "hat", (offbeat ? 0.36 : 0.26) * drumGain * (cue === "mission" ? 0.72 : 1), false, drumRng);
      }
      if (!sparse && !hole && !dropHats) {
        const openHatHits = cue === "mission" ? openHatSteps.slice(0, 1) : openHatSteps;
        if (cue !== "mission" || bar % 2 === 1) {
          for (const step of openHatHits) drumEvent(drums, origin + step, "openHat", 0.44 * drumGain * (cue === "mission" ? 0.58 : 1), false, drumRng);
        }
      }
      if (!sparse) placeStylePercussion(drums, origin, style.name, drumGain, dropHats, drumRng);
    }

    if ((section.name === "hook" || section.name === "escalation" || climax) && phraseBar === 0) {
      drumEvent(drums, origin, "impact", mixEnergy(climax ? 0.9 : section.name === "hook" ? 0.46 : 0.62, energy), true, drumRng);
    }

    if (miniFill) {
      placePhraseFill(drums, origin, arrangement.fillStyle[sectionIndex]!, { sparse, finalBar: false, mini: true, rng: drumRng });
    }

    if (fill) {
      placePhraseFill(drums, origin, arrangement.fillStyle[sectionIndex]!, {
        sparse: sparse || (hole && cue !== "victory"),
        finalBar: bar === MUSIC_BARS - 1,
        mini: false,
        rng: drumRng,
      });
    }
  }

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

  smoothMelodyLine(notes.melody, cue === "mission" ? { min: 36, max: 100 } : undefined);
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
