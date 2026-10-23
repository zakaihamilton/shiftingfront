import { chordToneMidi, noteEvent } from "../helpers";
import { STEPS_PER_BAR, type MusicNoteEvent, type MusicPulseRole } from "../types";

export function placeHarmony(
  notes: MusicNoteEvent[],
  origin: number,
  voicing: readonly number[],
  step: number,
  duration: number,
  velocity: number,
  accent = false,
): void {
  for (const [index, midi] of voicing.entries()) {
    noteEvent(notes, origin + step, midi, duration, velocity * (index === 0 ? 1 : 0.82), accent && index === 0);
  }
}

export function pulseStepsFor(role: MusicPulseRole, stride: number): number[] {
  if (role === "none") return [];
  if (stride === 1) {
    const dense: number[] = [];
    for (let i = 0; i < STEPS_PER_BAR; i += 1) dense.push(i);
    return dense;
  }
  if (role === "offbeat") return [2, 6, 10, 14];
  if (role === "stab") return stride >= 4 ? [0, 8] : [0, 6, 8, 12];
  const steps: number[] = [];
  for (let i = 0; i < STEPS_PER_BAR; i += stride) steps.push(i);
  return steps;
}

const BASS_LOW = 28;
const BASS_HIGH = 64;

function pitchClassOf(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

function rubs(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff < 2 || diff % 12 === 1;
}

/** Stack a chord into one register so a strum or piano hit speaks as a single voicing. */
export function closeChord(voicing: readonly number[], low: number, high: number): number[] {
  const classes: number[] = [];
  for (const midi of voicing) {
    const pitchClass = pitchClassOf(midi);
    if (!classes.includes(pitchClass)) classes.push(pitchClass);
  }
  if (classes.length === 0) return [low];
  const placed: number[] = [];
  let cursor = low;
  for (const pitchClass of classes) {
    let midi = cursor;
    while (pitchClassOf(midi) !== pitchClass) midi += 1;
    if (placed.length > 0 && midi - placed[placed.length - 1]! <= 1) midi += 12;
    if (midi > high) continue;
    placed.push(midi);
    cursor = midi + 2;
  }
  return placed.length > 0 ? placed : [low + ((classes[0]! - low) % 12 + 12) % 12];
}

/**
 * Keep the written bass riff, including its octave leaps, but fold chord-change
 * jumps back into the bass register so the line stays singable.
 */
export function voiceLeadBass(midi: number, previous: number | null): number {
  const pitchClass = pitchClassOf(midi);
  const pool: number[] = [];
  for (let note = BASS_LOW; note <= BASS_HIGH; note += 1) {
    if (pitchClassOf(note) === pitchClass) pool.push(note);
  }
  const target = previous ?? 40;
  const nearest = pool.reduce((best, note) => {
    const leap = Math.abs(note - target);
    const bestLeap = Math.abs(best - target);
    return leap < bestLeap || (leap === bestLeap && note < best) ? note : best;
  });
  if (pool.includes(midi) && (previous === null || Math.abs(midi - previous) <= 12)) return midi;
  return nearest;
}

export function voiceLeadPad(
  rootMidi: number,
  scale: readonly number[],
  chord: number,
  previous: readonly number[] | null,
): [number, number, number, number] {
  const pitchClass = (tone: number) => pitchClassOf(chordToneMidi(rootMidi, scale, chord, tone, 0));
  const nearestIn = (target: number, pc: number, low: number, high: number) => {
    let best = low;
    let bestDistance = Infinity;
    for (let midi = low; midi <= high; midi += 1) {
      if (pitchClassOf(midi) !== pc) continue;
      const distance = Math.abs(midi - target);
      if (distance < bestDistance || (distance === bestDistance && midi < best)) {
        best = midi;
        bestDistance = distance;
      }
    }
    return best;
  };

  const root = nearestIn(previous?.[0] ?? rootMidi + 12, pitchClass(0), 45, 60);
  const placed: number[] = [root];
  for (const tone of [1, 2, 3] as const) {
    const pc = pitchClass(tone);
    const options: number[] = [];
    for (let midi = root + 2; midi <= root + 24; midi += 1) {
      if (pitchClassOf(midi) !== pc) continue;
      if (placed.some((other) => rubs(other, midi))) continue;
      options.push(midi);
    }
    if (options.length === 0) {
      for (const existing of placed) {
        const doubled = existing + 12;
        if (doubled <= root + 24 && !placed.some((other) => other === doubled || rubs(other, doubled))) {
          options.push(doubled);
          break;
        }
      }
    }
    const target = previous?.[tone] ?? placed[placed.length - 1]! + 4;
    const choice = options.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0] ?? root + 12;
    placed.push(choice);
  }
  return [placed[0]!, placed[1]!, placed[2]!, placed[3]!];
}
