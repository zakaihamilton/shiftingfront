import { noteEvent, scaleToneMidi } from "../helpers";
import { BARS_PER_SECTION, STEPS_PER_BAR, type MusicMotif, type MusicNoteEvent } from "../types";

export function nearestMelodyMidi(
  rootMidi: number,
  scale: readonly number[],
  chord: number,
  degree: number,
  octave: number,
  previousMidi: number | null,
): number {
  const target = scaleToneMidi(rootMidi, scale, chord, degree, octave);
  if (previousMidi === null) return target;
  const candidates = [target - 12, target, target + 12];
  const comfortable = candidates.filter((candidate) => Math.abs(candidate - previousMidi) <= 7);
  const bounded = comfortable.length > 0
    ? comfortable
    : candidates.filter((candidate) => Math.abs(candidate - previousMidi) <= 12);
  return [...(bounded.length > 0 ? bounded : candidates)].sort((a, b) => {
    const previousDelta = Math.abs(a - previousMidi) - Math.abs(b - previousMidi);
    return previousDelta === 0 ? Math.abs(a - target) - Math.abs(b - target) : previousDelta;
  })[0] ?? target;
}

export function smoothMelodyLine(events: MusicNoteEvent[], preferredRange?: { min: number; max: number }): void {
  const ordered = [...events].sort((a, b) => a.step - b.step);
  if (ordered.length === 0) return;

  const sections = new Map<number, MusicNoteEvent[]>();
  for (const event of ordered) {
    const section = Math.floor(event.step / (BARS_PER_SECTION * STEPS_PER_BAR));
    const notes = sections.get(section);
    if (notes) notes.push(event);
    else sections.set(section, [event]);
  }

  const groups = [...sections.entries()].sort(([a], [b]) => a - b).map(([, notes]) => ({
    notes,
    first: notes[0]!.midi,
    last: notes.at(-1)!.midi,
    low: Math.min(...notes.map((note) => note.midi)),
    high: Math.max(...notes.map((note) => note.midi)),
  }));
  for (const group of groups) {
    let previous: number | null = null;
    for (const event of group.notes) {
      if (previous !== null) {
        while (event.midi - previous > 12) event.midi -= 12;
        while (previous - event.midi > 12) event.midi += 12;
      }
      previous = event.midi;
    }
    group.first = group.notes[0]!.midi;
    group.last = group.notes.at(-1)!.midi;
    group.low = Math.min(...group.notes.map((note) => note.midi));
    group.high = Math.max(...group.notes.map((note) => note.midi));
  }
  type Path = { cost: number; shifts: number[] };
  const findPath = (requireSmoothBoundaries: boolean): Path | undefined => {
    let paths = new Map<number, Path>([[0, { cost: 0, shifts: [] }]]);
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index]!;
      const next = new Map<number, Path>();
      for (let shift = -120; shift <= 120; shift += 12) {
        if (preferredRange && (group.low + shift < preferredRange.min || group.high + shift > preferredRange.max)) continue;
        for (const [previousShift, path] of paths) {
          const previousGroup = groups[index - 1];
          const boundaryLeap = previousGroup
            ? Math.abs(group.first + shift - (previousGroup.last + previousShift))
            : 0;
          if (requireSmoothBoundaries && boundaryLeap > 12) continue;
          const boundaryCost = boundaryLeap > 12
            ? requireSmoothBoundaries ? 0 : 1_000 + boundaryLeap ** 2
            : boundaryLeap * 0.001;
          const cost = path.cost + Math.abs(shift) * 0.01 + Math.abs(shift - previousShift) * 0.1 + boundaryCost;
          const current = next.get(shift);
          if (!current || cost < current.cost) next.set(shift, { cost, shifts: [...path.shifts, shift] });
        }
      }
      paths = next;
      if (paths.size === 0) return undefined;
    }

    return [...paths.values()].sort((a, b) => a.cost - b.cost)[0];
  };

  // Keep every section within range first, then prefer octave choices with smooth boundaries.
  // A relaxed fallback retains the hard register bound if two adjacent sections cannot be linked within an octave.
  const bestPath = findPath(true) ?? findPath(false);
  if (!bestPath) return;
  groups.forEach((group, index) => {
    const shift = bestPath.shifts[index] ?? 0;
    for (const note of group.notes) note.midi += shift;
  });

  if (!preferredRange) return;

  const signatureFor = (group: (typeof groups)[number]) => {
    const first = group.notes[0]!;
    return group.notes
      .map((note) => `${note.step - first.step}:${note.midi - first.midi}`)
      .join("|");
  };
  const signatureCounts = new Map<string, number>();
  for (const group of groups) {
    const signature = signatureFor(group);
    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
  }
  const recurringGroups = new Set(groups.flatMap((group, index) =>
    signatureCounts.get(signatureFor(group))! > 1 ? [index] : [],
  ));

  // Revoice transitions between repeated phrases while keeping the shared hook contour intact.
  let start = 0;
  while (start < groups.length) {
    if (recurringGroups.has(start)) {
      start += 1;
      continue;
    }
    let end = start;
    while (end + 1 < groups.length && !recurringGroups.has(end + 1)) end += 1;
    const run = groups.slice(start, end + 1).flatMap((group) => group.notes);
    const previousNote = start > 0 && recurringGroups.has(start - 1)
      ? groups[start - 1]!.notes.at(-1)!
      : undefined;
    const nextNote = end + 1 < groups.length && recurringGroups.has(end + 1)
      ? groups[end + 1]!.notes[0]!
      : undefined;
    type NotePath = { cost: number; notes: number[] };
    let paths = new Map<number, NotePath>();
    for (const note of run) {
      const candidates = Array.from(
        { length: preferredRange.max - preferredRange.min + 1 },
        (_, index) => preferredRange.min + index,
      ).filter((midi) => ((midi - note.midi) % 12 + 12) % 12 === 0);
      const next = new Map<number, NotePath>();
      for (const midi of candidates) {
        if (paths.size === 0) {
          if (previousNote && Math.abs(midi - previousNote.midi) > 12) continue;
          next.set(midi, { cost: Math.abs(midi - note.midi), notes: [midi] });
          continue;
        }
        for (const [previousMidi, path] of paths) {
          if (Math.abs(midi - previousMidi) > 12) continue;
          const cost = path.cost + Math.abs(midi - note.midi) + Math.abs(midi - previousMidi) * 0.001;
          const current = next.get(midi);
          if (!current || cost < current.cost) next.set(midi, { cost, notes: [...path.notes, midi] });
        }
      }
      paths = next;
      if (paths.size === 0) break;
    }

    const best = [...paths.values()]
      .filter((path) => !nextNote || Math.abs(path.notes.at(-1)! - nextNote.midi) <= 12)
      .sort((a, b) => a.cost - b.cost)[0];
    if (best) run.forEach((note, index) => { note.midi = best.notes[index]!; });
    start = end + 1;
  }
}

export function placeMelody(
  notes: MusicNoteEvent[],
  origin: number,
  motif: MusicMotif,
  response: boolean,
  rootMidi: number,
  scale: readonly number[],
  chord: number,
  variant: number,
  octave: number,
  durationFor: (index: number, sounding: number) => number,
  velocity: number,
  harmony: boolean,
  harmonyNotes: MusicNoteEvent[] | null,
  cadence: boolean,
  previousMidi: number | null,
  stepShift = 0,
): number | null {
  const degrees = response ? motif.response : motif.degrees;
  const placements = degrees
    .map((degree, index) => {
      if (degree === null) return null;
      const motifStep = ((motif.rhythm[index] ?? index * 2) + stepShift) % STEPS_PER_BAR;
      if (motifStep < 0 || motifStep >= STEPS_PER_BAR) return null;
      return { degree, index, motifStep };
    })
    .filter((placement): placement is { degree: number; index: number; motifStep: number } => placement !== null)
    .sort((a, b) => a.motifStep - b.motifStep);
  let placed = 0;
  let lastMidi: number | null = previousMidi;
  for (const placement of placements) {
    const isLastSounding = placed === placements.length - 1;
    const melodicDegree = cadence && isLastSounding ? 0 : placement.degree + variant;
    const midi = nearestMelodyMidi(rootMidi, scale, chord, melodicDegree, octave, lastMidi);
    const duration = durationFor(placed, placements.length);
    noteEvent(notes, origin + placement.motifStep, midi, duration, velocity, motif.accentSteps.includes(placement.index));
    if (harmony && harmonyNotes) {
      noteEvent(
        harmonyNotes,
        origin + placement.motifStep,
        scaleToneMidi(rootMidi, scale, chord, melodicDegree + 2, octave),
        duration,
        velocity * 0.7,
      );
    }
    lastMidi = midi;
    placed += 1;
  }
  return lastMidi;
}

export function placeCounter(
  notes: MusicNoteEvent[],
  melody: MusicNoteEvent[],
  origin: number,
  motif: MusicMotif,
  response: boolean,
  rootMidi: number,
  scale: readonly number[],
  chord: number,
  variant: number,
  octave: number,
  interval: number,
  stepShift: number,
  duration: number,
  velocity: number,
): void {
  const degrees = response ? motif.response : motif.degrees;
  for (let i = 0; i < degrees.length; i++) {
    const degree = degrees[i];
    if (degree === null) continue;
    const motifStep = ((motif.rhythm[i] ?? i * 2) + stepShift) % STEPS_PER_BAR;
    if (motifStep % 2 === 1 || motifStep >= STEPS_PER_BAR) continue;
    const midi = scaleToneMidi(rootMidi, scale, chord, degree + variant + interval, octave);
    const step = origin + motifStep;
    if (melody.some((lead) => lead.step === step && lead.midi === midi)) continue;
    noteEvent(notes, step, midi, duration, velocity);
  }
}
