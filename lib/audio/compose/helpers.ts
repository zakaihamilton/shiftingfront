import type { Rng } from "../../seed/rng";
import {
  type MusicCue,
  type MusicDrumKind,
  type MusicDrumEvent,
  type MusicFillStyle,
  type MusicGroove,
  type MusicNoteEvent,
  type MusicSectionName,
  type MusicStyleProfile,
  type MusicScaleName,
  MUSIC_STEPS,
  TUTORIAL_MUSIC_MISSION,
  NATURAL_MINOR,
  DORIAN,
  MIXOLYDIAN,
  MAJOR,
  PHRYGIAN,
  MINOR_PROGRESSIONS,
  MAJOR_PROGRESSIONS,
  MIXOLYDIAN_PROGRESSIONS,
  PHRYGIAN_PROGRESSIONS,
  HARMONIC_MINOR,
  MINOR_PENTATONIC,
  LYDIAN,
  DOUBLE_HARMONIC,
  BLUES,
  HARMONIC_MINOR_PROGRESSIONS,
  PENTATONIC_PROGRESSIONS,
  LYDIAN_PROGRESSIONS,
  DOUBLE_HARMONIC_PROGRESSIONS,
  BLUES_PROGRESSIONS,
} from "./types";

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function musicLabel(cue: MusicCue, missionIndex: number): string {
  if (missionIndex === TUTORIAL_MUSIC_MISSION) return "music:tutorial";
  return `music:${cue}:${missionIndex}`;
}

export function bpmFor(cue: MusicCue, roll: number, missionIndex: number, style?: MusicStyleProfile): number {
  const mission = Math.max(0, missionIndex);
  const [min, max, base] = cue === "menu"
    ? [112, 124, 112 + (roll % 13)]
    : cue === "briefing"
      ? [104, 118, 104 + (roll % 15)]
      : cue === "mission"
        ? [118, 138, 124 + ((roll + mission) % 11)]
        : cue === "victory"
          ? [124, 136, 124 + (roll % 13)]
          : [88, 100, 88 + (roll % 13)];
  return Math.max(min, Math.min(max, base + (style?.tempoBias ?? 0)));
}

const SCALES: Record<MusicScaleName, { notes: readonly number[]; name: MusicScaleName }> = {
  "natural minor": { notes: NATURAL_MINOR, name: "natural minor" },
  dorian: { notes: DORIAN, name: "dorian" },
  mixolydian: { notes: MIXOLYDIAN, name: "mixolydian" },
  major: { notes: MAJOR, name: "major" },
  phrygian: { notes: PHRYGIAN, name: "phrygian" },
  "harmonic minor": { notes: HARMONIC_MINOR, name: "harmonic minor" },
  "minor pentatonic": { notes: MINOR_PENTATONIC, name: "minor pentatonic" },
  lydian: { notes: LYDIAN, name: "lydian" },
  "double harmonic": { notes: DOUBLE_HARMONIC, name: "double harmonic" },
  blues: { notes: BLUES, name: "blues" },
};

export function scaleFor(cue: MusicCue, rng: Rng, style?: MusicStyleProfile): { notes: readonly number[]; name: MusicScaleName } {
  const fallback: readonly MusicScaleName[] = cue === "victory"
    ? ["major", "mixolydian", "dorian"]
    : cue === "briefing"
      ? ["dorian", "natural minor", "phrygian"]
      : cue === "defeat"
        ? ["natural minor", "dorian", "phrygian", "harmonic minor"]
        : ["natural minor", "dorian", "mixolydian", "major", "phrygian", "harmonic minor", "minor pentatonic", "lydian", "double harmonic", "blues"];
  const name = rng.pick(style?.scalePool ?? fallback);
  return SCALES[name];
}

export function progressionsFor(scaleName: string, variant = 0): readonly number[][] {
  const progressions = scaleName === "major"
    ? MAJOR_PROGRESSIONS
    : scaleName === "mixolydian"
      ? MIXOLYDIAN_PROGRESSIONS
      : scaleName === "phrygian"
        ? PHRYGIAN_PROGRESSIONS
        : scaleName === "harmonic minor"
          ? HARMONIC_MINOR_PROGRESSIONS
        : scaleName === "minor pentatonic"
          ? PENTATONIC_PROGRESSIONS
          : scaleName === "lydian"
            ? LYDIAN_PROGRESSIONS
            : scaleName === "double harmonic"
              ? DOUBLE_HARMONIC_PROGRESSIONS
              : scaleName === "blues"
                ? BLUES_PROGRESSIONS
                : MINOR_PROGRESSIONS;
  const offset = ((variant % progressions.length) + progressions.length) % progressions.length;
  return [...progressions.slice(offset), ...progressions.slice(0, offset)];
}

export function grooveHits(groove: MusicGroove, variation: 0 | 1, variant: 0 | 1 | 2 = 0): { kick: number[]; snare: number[] } {
  if (groove === "breakbeat") {
    if (variant === 1) {
      return variation === 0
        ? { kick: [0, 10], snare: [4, 6, 12, 13] }
        : { kick: [0, 6, 10], snare: [4, 7, 12, 15] };
    }
    if (variant === 2) {
      return variation === 0
        ? { kick: [0, 6, 8, 14], snare: [4, 11, 12] }
        : { kick: [0, 3, 10], snare: [4, 6, 12, 14] };
    }
    return variation === 0
      ? { kick: [0, 6, 10], snare: [4, 7, 12] }
      : { kick: [0, 3, 6, 10], snare: [4, 12, 14] };
  }
  if (groove === "four-floor") {
    if (variant === 1) {
      return variation === 0
        ? { kick: [0, 4, 8, 12], snare: [4, 12] }
        : { kick: [0, 4, 8, 12, 14], snare: [4, 12] };
    }
    if (variant === 2) {
      return variation === 0
        ? { kick: [0, 4, 8, 10, 12], snare: [4, 12] }
        : { kick: [0, 4, 7, 8, 12], snare: [4, 12] };
    }
    return variation === 0
      ? { kick: [0, 4, 8, 12], snare: [4, 12] }
      : { kick: [0, 4, 8, 12], snare: [4, 10, 12] };
  }
  if (groove === "offbeat") {
    if (variant === 1) {
      return variation === 0
        ? { kick: [0, 7, 8], snare: [6, 14] }
        : { kick: [0, 8], snare: [6, 10, 14] };
    }
    if (variant === 2) {
      return variation === 0
        ? { kick: [0, 8, 10], snare: [4, 6, 12, 14] }
        : { kick: [0, 6, 8], snare: [6, 14] };
    }
    return variation === 0
      ? { kick: [0, 8], snare: [6, 14] }
      : { kick: [0, 8], snare: [4, 6, 12, 14] };
  }
  if (groove === "half-time") {
    if (variant === 1) {
      return variation === 0
        ? { kick: [0, 8], snare: [12] }
        : { kick: [0, 6, 8], snare: [12] };
    }
    if (variant === 2) {
      return variation === 0
        ? { kick: [0, 8, 14], snare: [4, 12] }
        : { kick: [0, 6, 8, 14], snare: [12, 14] };
    }
    return variation === 0
      ? { kick: [0, 8], snare: [12] }
      : { kick: [0, 8], snare: [4, 12] };
  }
  if (groove === "shuffle") {
    if (variant === 1) {
      return variation === 0
        ? { kick: [0, 3, 6, 10, 14], snare: [4, 10, 12] }
        : { kick: [0, 3, 6, 8, 10, 14], snare: [4, 11, 12] };
    }
    if (variant === 2) {
      return variation === 0
        ? { kick: [0, 6, 10, 14], snare: [4, 7, 12] }
        : { kick: [0, 3, 6, 10, 14], snare: [4, 7, 12, 15] };
    }
    return variation === 0
      ? { kick: [0, 6, 8, 14], snare: [4, 12] }
      : { kick: [0, 3, 6, 8, 14], snare: [4, 10, 12] };
  }
  if (groove === "pulse") {
    if (variant === 1) {
      return variation === 0
        ? { kick: [0, 3, 6, 8, 11, 14], snare: [4, 12] }
        : { kick: [0, 3, 6, 8, 10, 13, 14], snare: [4, 12] };
    }
    if (variant === 2) {
      return variation === 0
        ? { kick: [0, 4, 7, 10, 12, 15], snare: [3, 11] }
        : { kick: [0, 4, 7, 10, 12, 14, 15], snare: [3, 11] };
    }
    return variation === 0
      ? { kick: [0, 4, 8, 12], snare: [4, 12] }
      : { kick: [0, 4, 8, 10, 12], snare: [4, 12] };
  }
  if (variant === 1) {
    return variation === 0
      ? { kick: [0, 3, 8, 10], snare: [4, 12] }
      : { kick: [0, 3, 6, 8, 10], snare: [4, 12] };
  }
  if (variant === 2) {
    return variation === 0
      ? { kick: [0, 6, 8, 14], snare: [4, 12] }
      : { kick: [0, 4, 6, 8, 14], snare: [4, 12] };
  }
  return variation === 0
    ? { kick: [0, 8], snare: [4, 12] }
    : { kick: [0, 6, 8], snare: [4, 12] };
}

export function sectionEnergy(name: MusicSectionName): number {
  if (name === "intro") return 0.34;
  if (name === "breakdown") return 0.3;
  if (name === "groove") return 0.58;
  if (name === "hook") return 0.74;
  if (name === "development") return 0.64;
  if (name === "escalation") return 0.82;
  if (name === "climax") return 0.96;
  return 0.84;
}

export function isSparseCue(cue: MusicCue): boolean {
  return cue === "menu" || cue === "briefing" || cue === "defeat";
}

export function pickDifferent<T>(rng: Rng, options: readonly T[], current: T): T {
  if (options.length < 2) return current;
  let next = rng.pick(options);
  while (next === current) next = rng.pick(options);
  return next;
}

export function pickCycle<T>(rng: Rng, options: readonly T[]): [T, T, T, T] {
  const a = rng.pick(options);
  const b = pickDifferent(rng, options, a);
  const c = pickDifferent(rng, options, b);
  const d = pickDifferent(rng, options, c);
  return [a, b, c, d];
}

export function mixEnergy(base: number, energy: number): number {
  return Math.max(0.08, Math.min(1, base * (0.52 + energy * 0.48)));
}

export function placePhraseFill(
  drums: MusicDrumEvent[],
  origin: number,
  fillStyle: MusicFillStyle,
  options: { sparse: boolean; finalBar: boolean; mini: boolean; rng?: Rng },
): void {
  const add = (step: number, kind: MusicDrumKind, velocity: number, accent = false) =>
    drumEventUnique(drums, step, kind, velocity, accent, options.rng);
  if (options.sparse) {
    add(origin + 12, "snare", 0.52, true);
    if (options.finalBar) add(origin + 10, "snare", 0.6, true);
    return;
  }
  if (options.mini) {
    add(origin + 12, "snare", 0.56, true);
    add(origin + 14, "tom", 0.5);
    return;
  }
  add(origin, "kick", 0.92, true);
  add(origin + 8, "kick", 0.7);
  if (options.finalBar) {
    add(origin + 4, "kick", 0.78);
    add(origin + 12, "kick", 0.88, true);
    add(origin + 12, "impact", 0.86, true);
  }
  if (fillStyle === "kick-roll") {
    for (const step of [8, 10, 12, 14]) add(origin + step, "kick", step >= 12 ? 0.8 : 0.62, step >= 12);
    add(origin + 12, "snare", 0.7, true);
    if (options.finalBar) {
      for (const step of [6, 10, 12, 14]) add(origin + step, "snare", 0.64, step >= 10);
    } else {
      add(origin + 14, "snare", 0.55);
    }
    return;
  }
  if (fillStyle === "hat-chatter") {
    for (let step = 8; step < 16; step += 2) add(origin + step, "hat", 0.3);
    add(origin + 12, "snare", 0.68, true);
    add(origin + 14, "snare", 0.52);
    add(origin + 14, "openHat", 0.4);
    if (options.finalBar) {
      for (const step of [6, 10, 12, 14]) add(origin + step, "snare", 0.62, step >= 10);
    }
    return;
  }
  if (fillStyle === "tom-only") {
    for (const step of [8, 10, 12, 14]) add(origin + step, "tom", step >= 12 ? 0.76 : 0.58, step >= 12);
    add(origin + 12, "snare", 0.66, true);
    if (options.finalBar) {
      for (const step of [6, 10, 12, 14]) add(origin + step, "snare", 0.62, step >= 10);
    } else {
      add(origin + 14, "snare", 0.48);
    }
    return;
  }
  const fillSteps = options.finalBar ? [6, 8, 10, 12, 14, 15] : [8, 10, 12, 14];
  for (const step of fillSteps) add(origin + step, step >= 12 ? "tom" : "snare", step >= 12 ? 0.74 : 0.6, step >= 12);
  if (options.finalBar) {
    add(origin + 14, "snare", 0.7, true);
  }
}

export function wrapDegree(scale: readonly number[], degree: number): number {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return scale[idx]! + oct * 12;
}

export function chordToneMidi(rootMidi: number, scale: readonly number[], chord: number, tone: number, octave: number): number {
  return rootMidi + wrapDegree(scale, chord + tone * 2) + octave * 12;
}

export function scaleToneMidi(rootMidi: number, scale: readonly number[], chord: number, offset: number, octave: number): number {
  return rootMidi + wrapDegree(scale, chord + offset) + octave * 12;
}

export function noteEvent(
  notes: MusicNoteEvent[],
  step: number,
  midi: number,
  duration: number,
  velocity: number,
  accent = false,
): void {
  notes.push({ step, midi, duration, velocity, ...(accent ? { accent: true } : {}) });
}

function humanizeDrumVelocity(rng: Rng, velocity: number, accent: boolean): number {
  const spread = accent ? 0.035 : 0.085;
  return velocity * (1 - spread + rng.next() * spread * 2);
}

export function drumEvent(
  drums: MusicDrumEvent[],
  step: number,
  kind: MusicDrumKind,
  velocity: number,
  accent = false,
  rng?: Rng,
): void {
  drums.push({
    step,
    kind,
    velocity: rng ? humanizeDrumVelocity(rng, velocity, accent) : velocity,
    ...(accent ? { accent: true } : {}),
  });
}

export function drumEventUnique(
  drums: MusicDrumEvent[],
  step: number,
  kind: MusicDrumKind,
  velocity: number,
  accent = false,
  rng?: Rng,
): void {
  if (drums.some((event) => event.step === step && event.kind === kind)) return;
  drumEvent(drums, step, kind, velocity, accent, rng);
}

export function legacyNotes(events: MusicNoteEvent[]): (number | null)[] {
  const lane = Array.from({ length: MUSIC_STEPS }, () => null as number | null);
  for (const event of events) lane[event.step] = midiToHz(event.midi);
  return lane;
}

export function legacyHits(drums: MusicDrumEvent[], kind: MusicDrumKind): boolean[] {
  const lane = Array.from({ length: MUSIC_STEPS }, () => false);
  for (const event of drums) {
    if (event.kind === kind) lane[event.step] = true;
  }
  return lane;
}
