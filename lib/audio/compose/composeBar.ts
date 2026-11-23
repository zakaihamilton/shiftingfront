import type { Rng } from "../../seed/rng";
import { composeBarDrums } from "./composeBarDrums";
import { chordToneMidi, midiToHz, mixEnergy, noteEvent } from "./helpers";
import {
  closeChord,
  placeCounter,
  placeHarmony,
  placeMelody,
  pulseStepsFor,
  voiceLeadBass,
  voiceLeadPad,
} from "./stems";
import {
  BARS_PER_SECTION,
  type BassHit,
  type MusicCue,
  type MusicDrumEvent,
  type MusicMotif,
  type MusicNoteEvent,
  type MusicScaleName,
  type MusicSection,
  type MusicStem,
  type MusicStyleProfile,
  STEPS_PER_BAR,
} from "./types";

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

type BarContext = {
  bar: number;
  sectionIndex: number;
  section: MusicSection;
  origin: number;
  phraseBar: number;
  cycle: number;
  chorusReturn: boolean;
  riff: readonly BassHit[];
  arpFigure: readonly number[];
  openHatSteps: readonly number[];
  fill: boolean;
  intro: boolean;
  breakdown: boolean;
  climax: boolean;
  hookSection: boolean;
  clearBreakdown: boolean;
  holdBass: boolean;
  energy: number;
  miniFill: boolean;
  hole: boolean;
  fullDrums: boolean;
  phraseEnd: boolean;
  lightDrums: boolean;
  usePulse: boolean;
  bridge: boolean;
  response: boolean;
  useHookLead: boolean;
  useMelody: boolean;
  useCounter: boolean;
  sequenceOctave: number;
  variant: number;
  chord: number;
  melodyChord: number;
  lead: MusicMotif;
};

function resolveBarContext(bar: number, input: ComposeBarInput, carry: ComposeCarry): BarContext {
  const {
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
    arrangement,
    cue,
    style,
  } = input;

  const sectionIndex = Math.floor(bar / BARS_PER_SECTION);
  const section = sections[sectionIndex]!;
  const origin = bar * STEPS_PER_BAR;
  const phraseBar = bar % BARS_PER_SECTION;
  const halfPhrase = phraseBar % 8;
  const phrasePlan = phrasePlans[Math.floor(bar / 8)]!;
  const materialIndex = materialIndexForSection(section.name);
  const chorusReturn =
    section.name === "hook" || section.name === "climax" || section.name === "turnaround";
  const cycle = Math.floor(bar / (BARS_PER_SECTION * 2)) % 4;
  const progression = [progressionA, progressionB, progressionC, progressionD][materialIndex]!;
  // Every chorus, including the ending, sits on the hook's chords.
  const leadProgression = section.name === "turnaround" ? progressionC : progression;
  const riff =
    section.name === "turnaround"
      ? bassRiffC
      : [bassRiffA, bassRiffB, bassRiffC, bassRiffD][materialIndex]!;
  const bedCycle = chorusReturn ? 1 : cycle;
  const arpFigure = [arpFigureA, arpFigureB, arpFigureC, arpFigureD][bedCycle]!;
  const openHatSteps = [openHatA, openHatB, openHatC, openHatD][bedCycle]!;
  const fill = halfPhrase === 7;
  const intro = section.name === "intro";
  const breakdown = section.name === "breakdown";
  const climax = section.name === "climax";
  const hookSection = section.name === "hook" || section.name === "turnaround" || climax;
  const clearBreakdown = breakdown && cue !== "victory";
  if (phraseBar === 0 && chorusReturn) carry.previousMelodyMidi = null;
  const holdBass = arrangement.holdBass[sectionIndex]!;
  const energy = section.energy;
  const thinBar = halfPhrase === 2 || halfPhrase === 3;
  const miniFill = phrasePlan.miniFillBar === halfPhrase && thinBar;
  const hole = holdBass && !chorusReturn && phraseBar < 8;
  const introDrums = !intro || phraseBar >= 8;
  const fullDrums = !sparse && !clearBreakdown && (cue === "victory" || (!hole && introDrums));
  const phraseEnd = phraseBar === 7 || phraseBar === 15;
  const lightDrums =
    sparse && !hole && !clearBreakdown && introDrums && (phraseBar % 2 === 0 || phraseEnd);

  const bridge = breakdown;
  let usePulse = arrangement.pulseEnabled[sectionIndex]!;
  if ((intro && phraseBar < 8) || hole || (bridge && holdBass)) usePulse = false;

  const songCycle = phraseBar % 8;
  // Verse and chorus are 8-bar sentences: four bars of the call, four of the answer, then the sentence repeats.
  const response = bridge ? true : intro ? false : songCycle >= 4;
  const useHookLead =
    hookSection ||
    (breakdown && !clearBreakdown && phraseBar >= 8) ||
    (section.name === "escalation" && phraseBar >= 8);
  const useMelody = !intro || Boolean(arrangement.melodyEnabled[sectionIndex] && phraseBar >= 12);
  const useCounter =
    !sparse &&
    arrangement.counterEnabled[sectionIndex]! &&
    useMelody &&
    response &&
    halfPhrase >= 4;

  const sequenceOctave = style.melodyOctave;
  const variant = arrangement.melodyDegreeOffset;
  const preChorus = section.name === "escalation" && phraseBar < 8;
  const harmonyProgression = bridge
    ? progressionB
    : preChorus
      ? progressionA
      : section.name === "turnaround"
        ? progressionC
        : progression;
  const chord = phraseEnd
    ? 0
    : !intro
      ? (harmonyProgression[Math.floor(songCycle / 2)] ?? 0)
      : (progression[Math.floor(phraseBar / 2)] ?? 0);
  const leadChord = phraseEnd ? 0 : (leadProgression[Math.floor(phraseBar / 2)] ?? 0);
  const melodyProgression = bridge ? progressionB : preChorus ? progressionA : leadProgression;
  const melodyChord = !intro
    ? songCycle === 7
      ? 0
      : (melodyProgression[Math.floor(songCycle / 2)] ?? 0)
    : leadChord;
  const lead = useHookLead
    ? input.hook
    : section.name === "development"
      ? input.developmentMotif
      : input.motif;

  return {
    bar,
    sectionIndex,
    section,
    origin,
    phraseBar,
    cycle,
    chorusReturn,
    riff,
    arpFigure,
    openHatSteps,
    fill,
    intro,
    breakdown,
    climax,
    hookSection,
    clearBreakdown,
    holdBass,
    energy,
    miniFill,
    hole,
    fullDrums,
    phraseEnd,
    lightDrums,
    usePulse,
    bridge,
    response,
    useHookLead,
    useMelody,
    useCounter,
    sequenceOctave,
    variant,
    chord,
    melodyChord,
    lead,
  };
}

function writePadStem(ctx: BarContext, input: ComposeBarInput, carry: ComposeCarry): number[] {
  const padVoicing = voiceLeadPad(
    input.rootMidi,
    input.scalePick.notes,
    ctx.chord,
    carry.previousPadVoicing,
  );
  carry.previousPadVoicing = padVoicing;
  input.padRoot.push(midiToHz(padVoicing[0]));
  input.padThird.push(midiToHz(padVoicing[1]));
  input.padFifth.push(midiToHz(padVoicing[2]));
  input.padSeventh.push(midiToHz(padVoicing[3]));
  return padVoicing;
}

function writeHarmonyStem(ctx: BarContext, input: ComposeBarInput, padVoicing: number[]): void {
  const pianoSteps =
    ctx.intro || ctx.breakdown
      ? []
      : ctx.hookSection || ctx.section.name === "escalation"
        ? [0, 8]
        : [0];
  const pianoVoicing = closeChord(padVoicing.slice(0, 3), 58, 76);
  for (const pianoStep of pianoSteps) {
    placeHarmony(
      input.notes.harmony,
      ctx.origin,
      pianoVoicing,
      pianoStep,
      pianoStep === 0 ? 6 : 4,
      mixEnergy(ctx.hookSection ? 0.24 : 0.18, ctx.energy),
      pianoStep === 0 && ctx.phraseBar % 4 === 0,
    );
  }
}

function writeBassStem(ctx: BarContext, input: ComposeBarInput, carry: ComposeCarry): void {
  const sectionBassStride = input.arrangement.bassStrides[ctx.chorusReturn ? 2 : ctx.sectionIndex]!;
  const bassStride =
    ctx.holdBass && !ctx.chorusReturn
      ? 8
      : ctx.intro
        ? (Math.max(4, sectionBassStride) as 4 | 8)
        : sectionBassStride;
  const addBass = (
    step: number,
    tone: number,
    octave: number,
    duration: number,
    velocity: number,
    accent = false,
  ) => {
    const midi = voiceLeadBass(
      chordToneMidi(input.rootMidi, input.scalePick.notes, ctx.chord, tone, octave),
      carry.previousBassMidi,
    );
    carry.previousBassMidi = midi;
    noteEvent(input.notes.bass, step, midi, duration, velocity, accent);
  };
  const bassLift = ctx.hookSection ? 1.08 : ctx.intro ? 0.82 : 1;
  if (ctx.holdBass && !ctx.chorusReturn) {
    addBass(ctx.origin, 0, -1, 8, mixEnergy(0.58 * bassLift, ctx.energy), true);
    if (ctx.bar % 2 === 1) addBass(ctx.origin + 8, 0, 0, 6, mixEnergy(0.46 * bassLift, ctx.energy));
    return;
  }
  if (ctx.section.name === "development") {
    const answer = [0, 2, 3, 4, 2, 4, 1, 0];
    const answerStride = Math.min(bassStride, 4);
    for (let i = 0; i < 8; i += 1) {
      if (i % (answerStride / 2) !== 0) continue;
      addBass(
        ctx.origin + i * 2,
        answer[i]!,
        i % 4 === 2 ? 1 : 0,
        2,
        mixEnergy(i === 0 || i === 4 ? 0.84 : 0.66, ctx.energy),
        i === 0,
      );
    }
    return;
  }
  for (let i = 0; i < 8; i++) {
    if (i % (bassStride / 2) !== 0 && bassStride > 2) continue;
    const hit = ctx.riff[i];
    if (!hit) continue;
    const octave = ctx.climax && i % 3 === 2 ? hit.oct + 1 : hit.oct;
    addBass(
      ctx.origin + i * 2,
      hit.tone,
      octave,
      ctx.intro ? 3 : 2,
      mixEnergy((i === 0 || i === 4 ? 0.92 : 0.7) * bassLift, ctx.energy),
      i === 0 || i === 4,
    );
  }
}

function writePulseStem(ctx: BarContext, input: ComposeBarInput): void {
  if (!ctx.usePulse || input.style.pulseRole === "none") return;
  const sectionPulseStride = input.arrangement.pulseStrides[ctx.sectionIndex]!;
  const requestedPulseStride =
    ctx.hole || (input.sparse && input.cue === "defeat")
      ? 4
      : ctx.hookSection && sectionPulseStride === 1
        ? 2
        : sectionPulseStride;
  // Sixteenth-note arps read as a game-console texture. Let the drums
  // provide urgency at the peak while the fastest pulse stays musical.
  const pulseStride = Math.max(4, requestedPulseStride);
  for (const i of pulseStepsFor(input.style.pulseRole, pulseStride)) {
    const figureIndex = Math.floor(i / 2) % ctx.arpFigure.length;
    const velocity = ctx.climax
      ? i % 2 === 0
        ? 0.7
        : 0.36
      : ctx.section.name === "hook" || ctx.section.name === "escalation"
        ? 0.56
        : 0.48;
    noteEvent(
      input.notes.pulse,
      ctx.origin + i,
      chordToneMidi(
        input.rootMidi,
        input.scalePick.notes,
        ctx.chord,
        ctx.arpFigure[figureIndex]!,
        1,
      ),
      input.style.pulseRole === "stab" ? 3 : 1,
      mixEnergy(velocity, ctx.energy),
      i % 4 === 0,
    );
  }
}

function writeMelodyStem(ctx: BarContext, input: ComposeBarInput, carry: ComposeCarry): void {
  if (!ctx.useMelody) return;
  const leadBase = ctx.intro
    ? 0.58
    : ctx.bridge
      ? 0.6
      : ctx.clearBreakdown
        ? 0.52
        : ctx.section.name === "hook" || ctx.section.name === "turnaround" || ctx.climax
          ? 1
          : ctx.section.name === "escalation"
            ? 0.9
            : 0.72;
  const velocity = mixEnergy(leadBase, ctx.energy);
  const durationFor = (index: number, sounding: number, gap = 1) => {
    const last = index === sounding - 1;
    if (ctx.useHookLead) return last && ctx.phraseEnd ? Math.min(gap + 2, 6) : Math.min(gap, 5);
    if (last && ctx.phraseEnd) return Math.min(gap + 1, 3);
    return Math.max(1, Math.min(gap, 5) - 1);
  };
  carry.previousMelodyMidi = placeMelody(
    input.notes.melody,
    ctx.origin,
    ctx.lead,
    ctx.response,
    input.rootMidi,
    input.scalePick.notes,
    ctx.melodyChord,
    ctx.variant,
    ctx.sequenceOctave,
    durationFor,
    velocity,
    ctx.climax,
    null,
    ctx.phraseEnd,
    carry.previousMelodyMidi,
    0,
  );
}

function writeGuitarStem(ctx: BarContext, input: ComposeBarInput, padVoicing: number[]): void {
  if (input.sparse || ctx.intro || ctx.breakdown) return;
  const busy = ctx.hookSection || ctx.section.name === "escalation";
  const guitarSteps = (busy ? [6, 14] : [10]).filter((step) => !(ctx.fill && step >= 12));
  const strum = closeChord(padVoicing.slice(0, 3), 64, 84);
  for (const guitarStep of guitarSteps) {
    const step = ctx.origin + guitarStep;
    strum.forEach((midi, chordIndex) => {
      let pitch = midi;
      if (lineClashes(input.notes.melody, step, pitch)) pitch += 12;
      if (pitch > 96 || lineClashes(input.notes.melody, step, pitch)) return;
      noteEvent(
        input.notes.guitar,
        step,
        pitch,
        2,
        mixEnergy((busy ? 0.2 : 0.15) * (chordIndex === 0 ? 1 : 0.74), ctx.energy),
        chordIndex === 0 && busy,
      );
    });
  }
}

function writeCounterStem(ctx: BarContext, input: ComposeBarInput): void {
  if (!ctx.useCounter) return;
  const interval = ctx.climax ? 5 : ctx.hookSection ? 2 : 5;
  const counterOctave = 1;
  placeCounter(
    input.notes.counter,
    input.notes.melody,
    ctx.origin,
    ctx.lead,
    ctx.response,
    input.rootMidi,
    input.scalePick.notes,
    ctx.melodyChord,
    ctx.variant,
    counterOctave,
    interval,
    0,
    ctx.climax ? 4 : 2,
    mixEnergy(ctx.climax ? 0.38 : 0.18 + input.style.counterChance * 0.14, ctx.energy),
  );
}

/** Append one bar onto the stem arrays and advance the voice-leading memory. */
export function composeBar(bar: number, input: ComposeBarInput, carry: ComposeCarry): void {
  const ctx = resolveBarContext(bar, input, carry);
  const padVoicing = writePadStem(ctx, input, carry);
  writeHarmonyStem(ctx, input, padVoicing);
  writeBassStem(ctx, input, carry);
  writePulseStem(ctx, input);
  writeMelodyStem(ctx, input, carry);
  writeGuitarStem(ctx, input, padVoicing);
  writeCounterStem(ctx, input);
  composeBarDrums({
    bar: ctx.bar,
    cycle: ctx.cycle,
    origin: ctx.origin,
    phraseBar: ctx.phraseBar,
    sectionIndex: ctx.sectionIndex,
    section: ctx.section,
    cue: input.cue,
    sparse: input.sparse,
    hole: ctx.hole,
    chorusReturn: ctx.chorusReturn,
    climax: ctx.climax,
    intro: ctx.intro,
    hookSection: ctx.hookSection,
    dropHats: false,
    clearBreakdown: ctx.clearBreakdown,
    fullDrums: ctx.fullDrums,
    lightDrums: ctx.lightDrums,
    fill: ctx.fill,
    miniFill: ctx.miniFill,
    energy: ctx.energy,
    groove: input.groove,
    style: input.style,
    arrangement: input.arrangement,
    openHatSteps: ctx.openHatSteps,
    drums: input.drums,
    drumRng: input.drumRng,
  });
}

function lineClashes(melody: readonly MusicNoteEvent[], step: number, midi: number): boolean {
  return melody.some((note) => {
    if (step < note.step || step >= note.step + note.duration) return false;
    const diff = Math.abs(note.midi - midi) % 12;
    return diff === 0 || diff === 1 || diff === 11;
  });
}
