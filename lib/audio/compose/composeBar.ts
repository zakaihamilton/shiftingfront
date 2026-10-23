import type { Rng } from "../../seed/rng";
import {
  BARS_PER_SECTION,
  MUSIC_BARS,
  STEPS_PER_BAR,
  type BassHit,
  type MusicCue,
  type MusicDrumEvent,
  type MusicMotif,
  type MusicNoteEvent,
  type MusicScaleName,
  type MusicSection,
  type MusicStem,
  type MusicStyleProfile,
} from "./types";
import { chordToneMidi, drumEvent, grooveHits, midiToHz, mixEnergy, noteEvent, placePhraseFill } from "./helpers";
import { closeChord, placeCounter, placeHarmony, placeMelody, placeStylePercussion, pulseStepsFor, voiceLeadBass, voiceLeadPad } from "./stems";

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

function materialIndexForSection(name: MusicSection["name"]): 0 | 1 | 2 | 3 {
  if (name === "intro" || name === "groove" || name === "breakdown") return 0;
  if (name === "development") return 1;
  if (name === "hook" || name === "escalation" || name === "climax") return 2;
  if (name === "turnaround") return 3;
  return 3;
}

type PhrasePlan = {
  textureDropBar: number | null;
  miniFillBar: number | null;
  liftBar: 4 | 5;
};

export type ComposeCarry = {
  previousMelodyMidi: number | null;
  previousBassMidi: number | null;
  previousPadVoicing: readonly number[] | null;
};

export type ComposeBarInput = {
  sections: readonly MusicSection[];
  phrasePlans: readonly PhrasePlan[];
  progressionA: readonly number[];
  progressionB: readonly number[];
  progressionC: readonly number[];
  progressionD: readonly number[];
  bassRiffA: readonly BassHit[];
  bassRiffB: readonly BassHit[];
  bassRiffC: readonly BassHit[];
  bassRiffD: readonly BassHit[];
  arpFigureA: readonly number[];
  arpFigureB: readonly number[];
  arpFigureC: readonly number[];
  arpFigureD: readonly number[];
  openHatA: readonly number[];
  openHatB: readonly number[];
  openHatC: readonly number[];
  openHatD: readonly number[];
  sparse: boolean;
  groove: MusicStyleProfile["groove"];
  arrangement: MusicStyleProfile["arrangement"];
  cue: MusicCue;
  style: MusicStyleProfile;
  rootMidi: number;
  scalePick: { notes: readonly number[]; name: MusicScaleName };
  hook: MusicMotif;
  developmentMotif: MusicMotif;
  motif: MusicMotif;
  notes: Record<MusicStem, MusicNoteEvent[]>;
  drums: MusicDrumEvent[];
  padRoot: number[];
  padThird: number[];
  padFifth: number[];
  padSeventh: number[];
  drumRng: Rng;
};

/** Append one bar onto the stem arrays and advance the voice-leading memory. */
export function composeBar(bar: number, input: ComposeBarInput, carry: ComposeCarry): void {
  const {
    sections, phrasePlans, progressionA, progressionB, progressionC, progressionD,
    bassRiffA, bassRiffB, bassRiffC, bassRiffD, arpFigureA, arpFigureB, arpFigureC, arpFigureD,
    openHatA, openHatB, openHatC, openHatD, sparse, groove, arrangement, cue, style,
    rootMidi, scalePick, hook, developmentMotif, motif, notes, drums, padRoot, padThird, padFifth,
    padSeventh, drumRng,
  } = input;
  let previousMelodyMidi = carry.previousMelodyMidi;
  let previousBassMidi = carry.previousBassMidi;
  let previousPadVoicing = carry.previousPadVoicing;
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
  const clearBreakdown = breakdown && cue !== "victory";
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
  const introDrums = !intro || phraseBar >= 8;
  const fullDrums = !sparse && !dropTexture && !clearBreakdown && (cue === "victory" || (!hole && introDrums));
  const phraseEnd = phraseBar === 7 || phraseBar === 15;
  const lightDrums = sparse && !hole && !clearBreakdown && introDrums && (phraseBar % 2 === 0 || phraseEnd);
  let usePulse = arrangement.pulseEnabled[sectionIndex]!;
  if (intro && phraseBar < 8) usePulse = false;
  if (hole) usePulse = false;
  if (dropPulse) usePulse = false;
  const phraseSlot = phraseBar % 4;
  const response = phraseSlot === 1 || phraseSlot === 3;
  const phrasePass = Math.floor(phraseBar / 4);
  const restBar = section.name === "breakdown" && phraseSlot === 3;
  const useHookLead =
    hookSection ||
    (breakdown && !clearBreakdown && phraseBar >= 8) ||
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
      (intro && phraseBar >= 12) ||
      (breakdown && !clearBreakdown && phraseBar >= 8));
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

  const pianoSteps = intro || breakdown
    ? []
    : hookSection || section.name === "escalation" ? [0, 8] : [0];
  const pianoVoicing = closeChord(padVoicing.slice(0, 3), 58, 76);
  for (const pianoStep of pianoSteps) {
    placeHarmony(
      notes.harmony,
      origin,
      pianoVoicing,
      pianoStep,
      pianoStep === 0 ? 6 : 4,
      mixEnergy(hookSection ? 0.24 : 0.18, energy),
      pianoStep === 0 && phraseBar % 4 === 0,
    );
  }

  const sectionBassStride = arrangement.bassStrides[sectionIndex]!;
  const bassStride = holdBass ? 8 : intro ? Math.max(4, sectionBassStride) as 4 | 8 : sectionBassStride;
  const addBass = (step: number, tone: number, octave: number, duration: number, velocity: number, accent = false) => {
    const midi = voiceLeadBass(chordToneMidi(rootMidi, scalePick.notes, chord, tone, octave), previousBassMidi);
    previousBassMidi = midi;
    noteEvent(notes.bass, step, midi, duration, velocity, accent);
  };
  const bassLift = hookSection ? 1.08 : intro ? 0.82 : 1;
  if (holdBass) {
    addBass(origin, 0, -1, 8, mixEnergy(0.58 * bassLift, energy), true);
    if (bar % 2 === 1) addBass(origin + 8, 0, 0, 6, mixEnergy(0.46 * bassLift, energy));
  } else if (section.name === "development") {
    const answer = [0, 2, 3, 4, 2, 4, 1, 0];
    const answerStride = Math.min(bassStride, 4);
    for (let i = 0; i < 8; i += 1) {
      if (i % (answerStride / 2) !== 0) continue;
      addBass(
        origin + i * 2,
        answer[i]!,
        i % 4 === 2 ? 1 : 0,
        2,
        mixEnergy(i === 0 || i === 4 ? 0.84 : 0.66, energy),
        i === 0,
      );
    }
  } else {
    for (let i = 0; i < 8; i++) {
      if (i % (bassStride / 2) !== 0 && bassStride > 2) continue;
      const hit = riff[i];
      if (!hit) continue;
      const octave = climax && i % 3 === 2 ? hit.oct + 1 : hit.oct;
      addBass(
        origin + i * 2,
        hit.tone,
        octave,
        intro ? 3 : 2,
        mixEnergy((i === 0 || i === 4 ? 0.92 : 0.7) * bassLift, energy),
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
    const leadBase = intro ? 0.58
      : clearBreakdown ? 0.52
      : section.name === "hook" || section.name === "turnaround" ? 1
      : climax ? 1
      : section.name === "escalation" ? 0.9
      : 0.72;
    const velocity = mixEnergy(leadBase, energy);
    const durationFor = (index: number, sounding: number, gap = 1) => {
      const last = index === sounding - 1;
      if (useHookLead) return last && phraseEnd ? Math.min(gap + 2, 6) : Math.min(gap, 5);
      if (last && phraseEnd) return Math.min(gap + 1, 3);
      return Math.max(1, Math.min(gap, 5) - (liftBar ? 0 : 1));
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

  if (!sparse && !intro && !breakdown && !dropTexture) {
    const busy = hookSection || section.name === "escalation";
    const guitarSteps = (busy ? [6, 14] : [10]).filter((step) => !(fill && step >= 12));
    const strum = closeChord(padVoicing.slice(0, 3), 64, 84);
    for (const guitarStep of guitarSteps) {
      const step = origin + guitarStep;
      strum.forEach((midi, chordIndex) => {
        let pitch = midi;
        if (lineClashes(notes.melody, step, pitch)) pitch += 12;
        if (pitch > 96 || lineClashes(notes.melody, step, pitch)) return;
        noteEvent(
          notes.guitar,
          step,
          pitch,
          2,
          mixEnergy((busy ? 0.2 : 0.15) * (chordIndex === 0 ? 1 : 0.74), energy),
          chordIndex === 0 && busy,
        );
      });
    }
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
    const drumScale = intro ? 0.7 : hookSection ? 1.08 : section.name === "escalation" ? 1.02 : 1;
    const drumGain = Math.min(
      0.9,
      mixEnergy(fullDrums ? 0.82 + density * 0.18 : 0.54 + density * 0.12, energy) * (cue === "mission" ? 0.78 : 1) * drumScale,
    );
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

  if (miniFill && !clearBreakdown) {
    placePhraseFill(drums, origin, arrangement.fillStyle[sectionIndex]!, { sparse, finalBar: false, mini: true, rng: drumRng });
  }

  if (fill && clearBreakdown) {
    drumEvent(drums, origin + 12, "snare", mixEnergy(0.42, energy), true, drumRng);
  } else if (fill) {
    placePhraseFill(drums, origin, arrangement.fillStyle[sectionIndex]!, {
      sparse: sparse || (hole && cue !== "victory"),
      finalBar: bar === MUSIC_BARS - 1,
      mini: false,
      rng: drumRng,
    });
  }
  carry.previousMelodyMidi = previousMelodyMidi;
  carry.previousBassMidi = previousBassMidi;
  carry.previousPadVoicing = previousPadVoicing;
}

function lineClashes(melody: readonly MusicNoteEvent[], step: number, midi: number): boolean {
  return melody.some((note) => {
    if (step < note.step || step >= note.step + note.duration) return false;
    const diff = Math.abs(note.midi - midi) % 12;
    return diff === 0 || diff === 1 || diff === 11;
  });
}
