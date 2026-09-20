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

export function voiceLeadPad(
  rootMidi: number,
  scale: readonly number[],
  chord: number,
  previous: readonly number[] | null,
): [number, number, number, number] {
  const target = [0, 1, 2, 3].map((tone) => chordToneMidi(rootMidi, scale, chord, tone, 1));
  if (!previous) return target as [number, number, number, number];
  return target.map((midi, index) => {
    const prior = previous[index] ?? midi;
    return [midi - 12, midi, midi + 12].sort(
      (a, b) => Math.abs(a - prior) - Math.abs(b - prior),
    )[0] ?? midi;
  }) as [number, number, number, number];
}
