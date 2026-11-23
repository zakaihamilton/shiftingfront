import { chordToneMidi } from "./helpers";
import { type MusicNoteEvent, type MusicSection, STEPS_PER_BAR } from "./types";

export const MELODY_LOW = 36;
export const MELODY_HIGH = 100;
export const REPEATED_SENTENCES = [
  "groove",
  "hook",
  "development",
  "breakdown",
  "climax",
  "turnaround",
] as const;

const CHORUS_SECTIONS = new Set<MusicSection["name"]>(["hook", "climax", "turnaround"]);

function localBar(note: MusicNoteEvent, sectionStart: number): number {
  return Math.floor(note.step / STEPS_PER_BAR) - sectionStart;
}

function notesInRegion(
  notes: readonly MusicNoteEvent[],
  sectionStart: number,
  from: number,
  to: number,
): MusicNoteEvent[] {
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

function sectionByName(
  sections: readonly MusicSection[],
  name: MusicSection["name"],
): MusicSection {
  return sections.find((section) => section.name === name)!;
}

/**
 * Follow the lead by octaves only, so a counter stays on its scale degree
 * when the melody is pulled onto a chord tone.
 */
function placeCounterPitch(current: number, delta: number, leadMidi: number): number {
  const target = current + delta;
  let next = current;
  while (next + 12 <= 100 && Math.abs(next + 12 - target) < Math.abs(next - target)) next += 12;
  while (next - 12 >= 24 && Math.abs(next - 12 - target) < Math.abs(next - target)) next -= 12;
  while (next > 100) next -= 12;
  while (next < 24) next += 12;
  if (next !== leadMidi) return next;
  return next + 12 <= 100 ? next + 12 : next - 12;
}

function applyMidis(
  phrase: readonly MusicNoteEvent[],
  midis: readonly number[],
  counters: MusicNoteEvent[],
): void {
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
      if ((((midi - note.midi) % 12) + 12) % 12 === 0) options.push(midi);
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
    for (let cursor: PitchNode | undefined = best; cursor; cursor = cursor.prev) {
      midis.push(cursor.midi);
    }
    midis.reverse();
    return midis;
  };
  const midis = voice(12) ?? voice(19);
  if (midis) applyMidis(phrase, midis, counters);
}

/** Move climax and turnaround onto the chorus contour, octave by octave. */
function imposeContour(
  target: MusicNoteEvent[],
  reference: readonly MusicNoteEvent[],
  counters: MusicNoteEvent[],
): void {
  if (target.length === 0 || reference.length === 0 || target.length !== reference.length) {
    loopPhrase(target, counters);
    return;
  }
  const relative = reference.map((note) => note.midi - reference[0]!.midi);
  let best: number[] | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let base = MELODY_LOW; base <= MELODY_HIGH; base += 1) {
    if ((((base - target[0]!.midi) % 12) + 12) % 12 !== 0) continue;
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

function copySentence(
  melody: MusicNoteEvent[],
  counters: MusicNoteEvent[],
  sectionStart: number,
): void {
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

type ChorusLanding = { anchorShift: number; start: number; leap: number };

/** Place an octave of the hook within a leap of the pre-chorus, preferring the hook's own register. */
function chorusLanding(
  sourceMidi: number,
  relative: readonly number[],
  before: readonly MusicNoteEvent[],
): ChorusLanding | undefined {
  if (before.length === 0) return undefined;
  const beforeLow = Math.min(...before.map((note) => note.midi));
  const beforeHigh = Math.max(...before.map((note) => note.midi));
  const fits = (start: number) =>
    relative.every((interval) => {
      const midi = start + interval;
      return midi >= MELODY_LOW && midi <= MELODY_HIGH;
    });
  let best: ChorusLanding | undefined;
  for (let anchorShift = -60; anchorShift <= 60; anchorShift += 12) {
    if (beforeLow + anchorShift < MELODY_LOW || beforeHigh + anchorShift > MELODY_HIGH) continue;
    const anchor = before[before.length - 1]!.midi + anchorShift;
    for (let octave = -5; octave <= 5; octave += 1) {
      const start = sourceMidi + octave * 12;
      if (!fits(start)) continue;
      const leap = Math.abs(start - anchor);
      if (leap > 12) continue;
      const sameRegister = start === sourceMidi;
      const bestSame = best?.start === sourceMidi;
      const better =
        !best ||
        (sameRegister && !bestSame) ||
        (sameRegister === bestSame && Math.abs(anchorShift) < Math.abs(best.anchorShift)) ||
        (sameRegister === bestSame &&
          Math.abs(anchorShift) === Math.abs(best.anchorShift) &&
          leap < best.leap);
      if (better) best = { anchorShift, start, leap };
    }
  }
  return best;
}

/** Land the pre-chorus on the hook, keeping that hook in the register where it was first sung. */
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
  const best = chorusLanding(source[0]!.midi, relative, before);
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

function chordPitchClasses(
  rootMidi: number,
  scale: readonly number[],
  degree: number,
): Set<number> {
  return new Set(
    [0, 1, 2, 3].map((tone) => ((chordToneMidi(rootMidi, scale, degree, tone, 0) % 12) + 12) % 12),
  );
}

/** Pull chorus downbeats onto the chord without opening a leap past a fifth. */
function snapChorusDownbeats(
  melody: MusicNoteEvent[],
  sectionStart: number,
  rootMidi: number,
  scale: readonly number[],
  progression: readonly number[],
): void {
  const phrase = notesInRegion(melody, sectionStart, 0, 8);
  phrase.forEach((note, index) => {
    if (note.step % STEPS_PER_BAR !== 0) return;
    const local = localBar(note, sectionStart);
    const barNotes = phrase.filter((entry) => localBar(entry, sectionStart) === local);
    if (local % 8 === 7 && note === barNotes[barNotes.length - 1]) return;
    const degree = progression[Math.floor((local % 8) / 2)] ?? 0;
    const pcs = chordPitchClasses(rootMidi, scale, degree);
    if (pcs.has(((note.midi % 12) + 12) % 12)) return;
    const previous = index > 0 ? phrase[index - 1]!.midi : note.midi;
    const next = index + 1 < phrase.length ? phrase[index + 1]!.midi : note.midi;
    let best: number | undefined;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let midi = note.midi - 5; midi <= note.midi + 5; midi += 1) {
      if (midi < MELODY_LOW || midi > MELODY_HIGH || !pcs.has(((midi % 12) + 12) % 12)) continue;
      const leapIn = Math.abs(midi - previous);
      const leapOut = Math.abs(next - midi);
      if (leapIn > 7 || leapOut > 7) continue;
      const replaced = phrase.map((entry, entryIndex) =>
        entryIndex === index ? midi : entry.midi,
      );
      const span = Math.max(...replaced) - Math.min(...replaced);
      if (span > 24) continue;
      const cost = Math.abs(midi - note.midi) * 4 + leapIn + leapOut;
      if (cost < bestCost) {
        bestCost = cost;
        best = midi;
      }
    }
    if (best === undefined) return;
    note.midi = best;
  });
}

/** Copy the hook's pitches onto a later chorus, one note at a time. */
function matchPhrase(
  target: MusicNoteEvent[],
  reference: readonly MusicNoteEvent[],
  counters: MusicNoteEvent[],
): void {
  if (target.length === 0 || reference.length === 0 || target.length !== reference.length) {
    imposeContour(target, reference, counters);
    return;
  }
  applyMidis(
    target,
    reference.map((note) => note.midi),
    counters,
  );
}

/**
 * Slide each phrase by octaves so the entrance stays within one leap of the
 * phrase before it. Every chorus, including the one that answers the pre-chorus,
 * shares one slide, so the reprise stays in the register where the hook was sung.
 */
function connectSections(
  melody: MusicNoteEvent[],
  counters: MusicNoteEvent[],
  sections: readonly MusicSection[],
): void {
  const regions = sections.flatMap((section) => {
    const chorus = CHORUS_SECTIONS.has(section.name);
    if (section.name !== "intro" && section.name !== "escalation") {
      return [{ startBar: section.startBar, from: 0, to: 16, chorus }];
    }
    return [
      { startBar: section.startBar, from: 0, to: 8, chorus: false },
      { startBar: section.startBar, from: 8, to: 16, chorus: section.name === "escalation" },
    ];
  });
  const groups = regions.map((region) => {
    const notes = notesInRegion(melody, region.startBar, region.from, region.to);
    if (notes.length === 0) return undefined;
    return {
      ...region,
      low: Math.min(...notes.map((note) => note.midi)),
      high: Math.max(...notes.map((note) => note.midi)),
      first: notes[0]!.midi,
      last: notes[notes.length - 1]!.midi,
    };
  });
  type Path = { cost: number; shifts: number[]; last: number; chorusShift: number | null };
  const openingIndex = groups.findIndex((group) => group !== undefined);
  const findPath = (
    requireSmooth: boolean,
    lockChorus: boolean,
    closeLoop: boolean,
  ): Path | undefined => {
    let paths = new Map<string, Path>([
      ["start", { cost: 0, shifts: [], last: Number.NaN, chorusShift: null }],
    ]);
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      const next = new Map<string, Path>();
      const consider = (path: Path, shift: number) => {
        if (group && (group.low + shift < MELODY_LOW || group.high + shift > MELODY_HIGH)) return;
        const boundary =
          !group || Number.isNaN(path.last) ? 0 : Math.abs(group.first + shift - path.last);
        if (requireSmooth && group && boundary > 12) return;
        const cost =
          path.cost + Math.abs(shift) * 0.05 + (boundary > 12 ? 1_000 + boundary : boundary);
        const chorusShift = group?.chorus ? (path.chorusShift ?? shift) : path.chorusShift;
        const last = group ? group.last + shift : path.last;
        const opening =
          openingIndex < 0
            ? "none"
            : index < openingIndex
              ? "wait"
              : index === openingIndex
                ? shift
                : (path.shifts[openingIndex] ?? 0);
        const key = `${chorusShift ?? "open"}:${Number.isNaN(last) ? "none" : last}:${opening}`;
        const current = next.get(key);
        if (!current || cost < current.cost) {
          next.set(key, { cost, shifts: [...path.shifts, shift], last, chorusShift });
        }
      };
      for (const path of paths.values()) {
        if (!group) {
          consider(path, 0);
          continue;
        }
        if (lockChorus && group.chorus && path.chorusShift !== null) {
          consider(path, path.chorusShift);
          continue;
        }
        for (let shift = -60; shift <= 60; shift += 12) consider(path, shift);
      }
      if (next.size === 0) return undefined;
      paths = next;
    }
    const finished = [...paths.values()];
    const opening = openingIndex >= 0 ? groups[openingIndex] : undefined;
    const scored = finished.flatMap((path) => {
      if (!closeLoop || !opening || Number.isNaN(path.last)) return [path];
      const wrap = Math.abs(opening.first + (path.shifts[openingIndex] ?? 0) - path.last);
      if (requireSmooth && wrap > 12) return [];
      return [{ ...path, cost: path.cost + (wrap > 12 ? 1_000 + wrap : wrap) }];
    });
    return scored.sort((a, b) => a.cost - b.cost)[0];
  };
  const best =
    findPath(true, true, true) ??
    findPath(true, true, false) ??
    findPath(true, false, false) ??
    findPath(false, true, false) ??
    findPath(false, false, false);
  if (!best) return;
  groups.forEach((group, index) => {
    if (!group) return;
    shiftRegion(melody, counters, group.startBar, group.from, group.to, best.shifts[index] ?? 0);
  });
}

/** Move the choruses together when the pre-chorus can only meet them in another octave. */
function seatChorus(
  melody: MusicNoteEvent[],
  counters: MusicNoteEvent[],
  sections: readonly MusicSection[],
): void {
  const hook = sectionByName(sections, "hook");
  const escalation = sectionByName(sections, "escalation");
  const source = notesInRegion(melody, hook.startBar, 0, 8);
  const before = notesInRegion(melody, escalation.startBar, 0, 8);
  if (source.length === 0 || before.length === 0) return;
  const relative = source.map((note) => note.midi - source[0]!.midi);
  const sourceMidi = source[0]!.midi;
  const chorusNotes = [...CHORUS_SECTIONS].flatMap((name) =>
    notesInRegion(melody, sectionByName(sections, name).startBar, 0, 16),
  );
  let best: { shift: number; anchorShift: number; leap: number } | undefined;
  for (let shift = -60; shift <= 60; shift += 12) {
    if (
      chorusNotes.some((note) => note.midi + shift < MELODY_LOW || note.midi + shift > MELODY_HIGH)
    ) {
      continue;
    }
    const landing = chorusLanding(sourceMidi + shift, relative, before);
    if (!landing || landing.start !== sourceMidi + shift) continue;
    const better =
      !best ||
      Math.abs(shift) < Math.abs(best.shift) ||
      (Math.abs(shift) === Math.abs(best.shift) &&
        Math.abs(landing.anchorShift) < Math.abs(best.anchorShift)) ||
      (Math.abs(shift) === Math.abs(best.shift) &&
        Math.abs(landing.anchorShift) === Math.abs(best.anchorShift) &&
        landing.leap < best.leap);
    if (better) best = { shift, anchorShift: landing.anchorShift, leap: landing.leap };
  }
  if (!best || best.shift === 0) return;
  for (const name of CHORUS_SECTIONS) {
    shiftRegion(melody, counters, sectionByName(sections, name).startBar, 0, 16, best.shift);
  }
}

/**
 * Mission verses and choruses are written as an 8-bar sentence played twice.
 * Voice-leading can still drag individual notes into another octave on the
 * repeat; fold the sentence back into one register and copy it.
 */
export function settleMissionMelody(
  melody: MusicNoteEvent[],
  counters: MusicNoteEvent[],
  sections: readonly MusicSection[],
  rootMidi: number,
  scale: readonly number[],
  chorusProgression: readonly number[],
): void {
  const intro = sectionByName(sections, "intro");
  loopPhrase(notesInRegion(melody, intro.startBar, 0, 8), counters);
  loopPhrase(notesInRegion(melody, intro.startBar, 8, 16), counters);
  const hook = sectionByName(sections, "hook");
  const hookSentence = notesInRegion(melody, hook.startBar, 0, 8);
  loopPhrase(hookSentence, counters);
  snapChorusDownbeats(melody, hook.startBar, rootMidi, scale, chorusProgression);
  for (const name of ["climax", "turnaround"] as const) {
    const section = sectionByName(sections, name);
    matchPhrase(notesInRegion(melody, section.startBar, 0, 8), hookSentence, counters);
  }
  for (const name of ["groove", "development", "breakdown"] as const) {
    const section = sectionByName(sections, name);
    loopPhrase(notesInRegion(melody, section.startBar, 0, 8), counters);
  }
  const escalation = sectionByName(sections, "escalation");
  loopPhrase(notesInRegion(melody, escalation.startBar, 0, 8), counters);
  for (const name of REPEATED_SENTENCES) {
    copySentence(melody, counters, sectionByName(sections, name).startBar);
  }
  seatChorus(melody, counters, sections);
  graftPhrase(melody, counters, hook.startBar, escalation.startBar);
  connectSections(melody, counters, sections);
  melody.sort((a, b) => a.step - b.step);
  counters.sort((a, b) => a.step - b.step);
}
