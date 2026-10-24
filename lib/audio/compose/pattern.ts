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

const MELODY_LOW = 36;
const MELODY_HIGH = 100;
const REPEATED_SENTENCES = ["groove", "hook", "development", "breakdown", "climax", "turnaround"] as const;

function localBar(note: MusicNoteEvent, sectionStart: number): number {
  return Math.floor(note.step / STEPS_PER_BAR) - sectionStart;
}

function notesInRegion(notes: readonly MusicNoteEvent[], sectionStart: number, from: number, to: number): MusicNoteEvent[] {
  return notes
    .filter((note) => {
      const bar = localBar(note, sectionStart);
      return bar >= from && bar < to;
    })
    .sort((a, b) => a.step - b.step);
}

function dropRegion(notes: MusicNoteEvent[], sectionStart: number, from: number, to: number): void {
  for (let index = notes.length - 1; index >= 0; index -= 1) {
    const bar = localBar(notes[index]!, sectionStart);
    if (bar >= from && bar < to) notes.splice(index, 1);
  }
}

function sectionByName(sections: readonly MusicSection[], name: MusicSection["name"]): MusicSection {
  return sections.find((section) => section.name === name)!;
}

/** Keep a doubled counter off the lead and inside the counter register. */
function placeCounterPitch(current: number, delta: number, leadMidi: number): number {
  let next = current + delta;
  while (next > 100) next -= 12;
  while (next < 24) next += 12;
  if (next !== leadMidi) return next;
  return next + 12 <= 100 ? next + 12 : next - 12;
}

function applyMidis(phrase: readonly MusicNoteEvent[], midis: readonly number[], counters: MusicNoteEvent[]): void {
  phrase.forEach((note, index) => {
    const midi = midis[index]!;
    const delta = midi - note.midi;
    note.midi = midi;
    if (delta === 0) return;
    for (const counter of counters) {
      if (counter.step !== note.step) continue;
      counter.midi = placeCounterPitch(counter.midi, delta, midi);
    }
  });
}

function phraseLoops(phrase: readonly MusicNoteEvent[]): boolean {
  if (phrase.length === 0) return true;
  const low = Math.min(...phrase.map((note) => note.midi));
  const high = Math.max(...phrase.map((note) => note.midi));
  if (high - low > 24) return false;
  for (let index = 1; index < phrase.length; index += 1) {
    if (Math.abs(phrase[index]!.midi - phrase[index - 1]!.midi) > 12) return false;
  }
  return Math.abs(phrase[phrase.length - 1]!.midi - phrase[0]!.midi) <= 12;
}

type PitchNode = { midi: number; cost: number; prev?: PitchNode };

/**
 * Re-voice one sentence so it stays inside an octave and can restart
 * without a jump. Pitch classes stay put; only the octave of a note changes.
 */
function loopPhrase(phrase: MusicNoteEvent[], counters: MusicNoteEvent[]): void {
  if (phrase.length === 0 || phraseLoops(phrase)) return;
  const optionsFor = (note: MusicNoteEvent) => {
    const options: number[] = [];
    for (let midi = MELODY_LOW; midi <= MELODY_HIGH; midi += 1) {
      if (((midi - note.midi) % 12 + 12) % 12 === 0) options.push(midi);
    }
    return options;
  };
  const voice = (span: number): number[] | undefined => {
    let layer = new Map<string, PitchNode>();
    for (const midi of optionsFor(phrase[0]!)) {
      layer.set(`${midi}:${midi}`, { midi, cost: Math.abs(midi - phrase[0]!.midi) });
    }
    for (let index = 1; index < phrase.length; index += 1) {
      const next = new Map<string, PitchNode>();
      for (const [key, state] of layer) {
        const first = Number(key.slice(0, key.indexOf(":")));
        for (const midi of optionsFor(phrase[index]!)) {
          const leap = Math.abs(midi - state.midi);
          if (leap > 12 || Math.abs(midi - first) > span) continue;
          const cost = state.cost + Math.abs(midi - phrase[index]!.midi) + (leap > 7 ? 6 : 0);
          const nextKey = `${first}:${midi}`;
          const existing = next.get(nextKey);
          if (!existing || cost < existing.cost) next.set(nextKey, { midi, cost, prev: state });
        }
      }
      if (next.size === 0) return undefined;
      layer = next;
    }
    let best: PitchNode | undefined;
    for (const [key, node] of layer) {
      const first = Number(key.slice(0, key.indexOf(":")));
      if (Math.abs(node.midi - first) > 12) continue;
      if (!best || node.cost < best.cost) best = node;
    }
    if (!best) return undefined;
    const midis: number[] = [];
    for (let cursor: PitchNode | undefined = best; cursor; cursor = cursor.prev) midis.push(cursor.midi);
    midis.reverse();
    return midis;
  };
  const midis = voice(12) ?? voice(19);
  if (midis) applyMidis(phrase, midis, counters);
}

/** Move climax and turnaround onto the chorus contour, octave by octave. */
function imposeContour(target: MusicNoteEvent[], reference: readonly MusicNoteEvent[], counters: MusicNoteEvent[]): void {
  if (target.length === 0 || reference.length === 0 || target.length !== reference.length) {
    loopPhrase(target, counters);
    return;
  }
  const relative = reference.map((note) => note.midi - reference[0]!.midi);
  let best: number[] | undefined;
  let bestCost = Infinity;
  for (let base = MELODY_LOW; base <= MELODY_HIGH; base += 1) {
    if (((base - target[0]!.midi) % 12 + 12) % 12 !== 0) continue;
    const midis = relative.map((interval) => base + interval);
    if (midis.some((midi) => midi < MELODY_LOW || midi > MELODY_HIGH)) continue;
    const cost = midis.reduce((sum, midi, index) => sum + Math.abs(midi - target[index]!.midi), 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = midis;
    }
  }
  if (!best) {
    loopPhrase(target, counters);
    return;
  }
  applyMidis(target, best, counters);
}

function copySentence(melody: MusicNoteEvent[], counters: MusicNoteEvent[], sectionStart: number): void {
  const first = notesInRegion(melody, sectionStart, 0, 8);
  if (first.length === 0) return;
  const copy = first.map((note) => ({ ...note, step: note.step + 8 * STEPS_PER_BAR }));
  dropRegion(melody, sectionStart, 8, 16);
  melody.push(...copy);
  const copiedCounters = notesInRegion(counters, sectionStart, 0, 8).flatMap((note) => {
    const step = note.step + 8 * STEPS_PER_BAR;
    const lead = copy.find((entry) => entry.step === step);
    if (!lead || lead.midi === note.midi) return [];
    return [{ ...note, step }];
  });
  dropRegion(counters, sectionStart, 8, 16);
  counters.push(...copiedCounters);
}

function placedRepeat(
  relative: readonly number[],
  anchor: number,
  sourceMidi: number,
): { start: number; leap: number } | undefined {
  let best: { start: number; leap: number } | undefined;
  for (let start = MELODY_LOW; start <= MELODY_HIGH; start += 1) {
    if (((start - sourceMidi) % 12 + 12) % 12 !== 0) continue;
    if (relative.some((interval) => start + interval < MELODY_LOW || start + interval > MELODY_HIGH)) continue;
    const leap = Math.abs(start - anchor);
    if (!best || leap < best.leap) best = { start, leap };
  }
  return best;
}

function shiftRegion(
  melody: MusicNoteEvent[],
  counters: MusicNoteEvent[],
  sectionStart: number,
  from: number,
  to: number,
  shift: number,
): void {
  if (shift === 0) return;
  const leads = new Map<number, number>();
  for (const note of melody) {
    const bar = localBar(note, sectionStart);
    if (bar < from || bar >= to) continue;
    note.midi += shift;
    leads.set(note.step, note.midi);
  }
  for (const note of counters) {
    const bar = localBar(note, sectionStart);
    if (bar < from || bar >= to) continue;
    note.midi = placeCounterPitch(note.midi, shift, leads.get(note.step) ?? -1);
  }
}

/** Land the chorus under the pre-chorus, then keep that entrance inside an octave. */
function graftPhrase(
  melody: MusicNoteEvent[],
  counters: MusicNoteEvent[],
  sourceStart: number,
  targetStart: number,
): void {
  const source = notesInRegion(melody, sourceStart, 0, 8);
  const before = notesInRegion(melody, targetStart, 0, 8);
  if (source.length === 0 || before.length === 0) return;
  const relative = source.map((note) => note.midi - source[0]!.midi);
  const beforeLow = Math.min(...before.map((note) => note.midi));
  const beforeHigh = Math.max(...before.map((note) => note.midi));
  let best: { anchorShift: number; start: number; leap: number } | undefined;
  for (let anchorShift = -60; anchorShift <= 60; anchorShift += 12) {
    if (beforeLow + anchorShift < MELODY_LOW || beforeHigh + anchorShift > MELODY_HIGH) continue;
    const placed = placedRepeat(relative, before[before.length - 1]!.midi + anchorShift, source[0]!.midi);
    if (!placed) continue;
    const candidate = { anchorShift, start: placed.start, leap: placed.leap };
    const closer = !best
      || candidate.leap < best.leap
      || (candidate.leap === best.leap && Math.abs(candidate.anchorShift) < Math.abs(best.anchorShift));
    if (closer) best = candidate;
  }
  if (!best) return;
  const landing = best;
  shiftRegion(melody, counters, targetStart, 0, 8, landing.anchorShift);
  const sourceOrigin = sourceStart * STEPS_PER_BAR;
  const copy = source.map((note) => ({
    ...note,
    step: (targetStart + 8) * STEPS_PER_BAR + (note.step - sourceOrigin),
    midi: landing.start + (note.midi - source[0]!.midi),
  }));
  dropRegion(melody, targetStart, 8, 16);
  melody.push(...copy);
  const copiedCounters = notesInRegion(counters, sourceStart, 0, 8).flatMap((note) => {
    const step = (targetStart + 8) * STEPS_PER_BAR + (note.step - sourceOrigin);
    const sourceLead = source.find((entry) => entry.step === note.step);
    const lead = copy.find((entry) => entry.step === step);
    if (!sourceLead || !lead) return [];
    const midi = placeCounterPitch(note.midi, lead.midi - sourceLead.midi, lead.midi);
    if (midi === lead.midi) return [];
    return [{ ...note, step, midi }];
  });
  dropRegion(counters, targetStart, 8, 16);
  counters.push(...copiedCounters);
}

/**
 * Slide each section by octaves so the entrance stays within one leap of the
 * phrase before it. A whole-section slide keeps the repeated sentence intact.
 */
function connectSections(melody: MusicNoteEvent[], counters: MusicNoteEvent[], sections: readonly MusicSection[]): void {
  const groups = sections.map((section) => {
    const notes = notesInRegion(melody, section.startBar, 0, 16);
    if (notes.length === 0) return undefined;
    return {
      startBar: section.startBar,
      low: Math.min(...notes.map((note) => note.midi)),
      high: Math.max(...notes.map((note) => note.midi)),
      first: notes[0]!.midi,
      last: notes[notes.length - 1]!.midi,
    };
  });
  type Path = { cost: number; shifts: number[]; last: number };
  const findPath = (requireSmooth: boolean): Path | undefined => {
    let paths = new Map<number, Path>([[0, { cost: 0, shifts: [], last: Number.NaN }]]);
    for (const group of groups) {
      const next = new Map<number, Path>();
      if (!group) {
        for (const [key, path] of paths) next.set(key, { ...path, shifts: [...path.shifts, 0] });
        paths = next;
        continue;
      }
      for (let shift = -60; shift <= 60; shift += 12) {
        if (group.low + shift < MELODY_LOW || group.high + shift > MELODY_HIGH) continue;
        for (const path of paths.values()) {
          const boundary = Number.isNaN(path.last) ? 0 : Math.abs(group.first + shift - path.last);
          if (requireSmooth && boundary > 12) continue;
          const cost = path.cost + Math.abs(shift) * 0.05 + (boundary > 12 ? 1_000 + boundary : boundary);
          const current = next.get(shift);
          if (!current || cost < current.cost) {
            next.set(shift, { cost, shifts: [...path.shifts, shift], last: group.last + shift });
          }
        }
      }
      if (next.size === 0) return undefined;
      paths = next;
    }
    return [...paths.values()].sort((a, b) => a.cost - b.cost)[0];
  };
  const best = findPath(true) ?? findPath(false);
  if (!best) return;
  groups.forEach((group, index) => {
    if (!group) return;
    shiftRegion(melody, counters, group.startBar, 0, 16, best.shifts[index] ?? 0);
  });
}

/**
 * Mission verses and choruses are written as an 8-bar sentence played twice.
 * Voice-leading can still drag individual notes into another octave on the
 * repeat; fold the sentence back into one register and copy it.
 */
function settleMissionMelody(
  melody: MusicNoteEvent[],
  counters: MusicNoteEvent[],
  sections: readonly MusicSection[],
): void {
  const hook = sectionByName(sections, "hook");
  const hookSentence = notesInRegion(melody, hook.startBar, 0, 8);
  loopPhrase(hookSentence, counters);
  for (const name of ["climax", "turnaround"] as const) {
    const section = sectionByName(sections, name);
    imposeContour(notesInRegion(melody, section.startBar, 0, 8), hookSentence, counters);
  }
  for (const name of ["groove", "development", "breakdown"] as const) {
    const section = sectionByName(sections, name);
    loopPhrase(notesInRegion(melody, section.startBar, 0, 8), counters);
  }
  const escalation = sectionByName(sections, "escalation");
  loopPhrase(notesInRegion(melody, escalation.startBar, 0, 8), counters);
  for (const name of REPEATED_SENTENCES) copySentence(melody, counters, sectionByName(sections, name).startBar);
  graftPhrase(melody, counters, hook.startBar, escalation.startBar);
  connectSections(melody, counters, sections);
  melody.sort((a, b) => a.step - b.step);
  counters.sort((a, b) => a.step - b.step);
}

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
  cue: MusicCue,
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
  if (cue === "mission") {
    const repeated = new Set<string>(REPEATED_SENTENCES);
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      const name = sections[sectionIndex]!.name;
      if (!repeated.has(name)) continue;
      plans[sectionIndex * 2 + 1] = { ...plans[sectionIndex * 2]! };
    }
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
  const phrasePlans = makePhrasePlans(formRng, sections, arrangement, sparse, cue);
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
  if (cue === "mission") settleMissionMelody(notes.melody, notes.counter, sections);
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
