import { drumEvent, drumEventUnique, noteEvent } from "./helpers";
import {
  BARS_PER_SECTION,
  MUSIC_BARS,
  type MusicCue,
  type MusicDrumEvent,
  type MusicIntensity,
  type MusicIntensityLayer,
  type MusicNoteEvent,
  type MusicSection,
  type MusicStem,
  STEPS_PER_BAR,
} from "./types";

/** An octave double stays in the melody register. Above that it is left out. */
function registerDouble(midi: number, direction: 1 | -1): number | undefined {
  const doubled = midi + direction * 12;
  if (doubled < 24 || doubled > 100) return undefined;
  return doubled;
}

export function makeIntensityLayers(
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
  const sectionAt = (step: number) =>
    sections[Math.floor(step / (STEPS_PER_BAR * BARS_PER_SECTION))];

  for (const lead of notes.melody) {
    const section = sectionAt(lead.step);
    if (!section || section.energy < 0.64) continue;
    const beat = lead.step % STEPS_PER_BAR;
    if (lead.accent || beat === 0 || beat === 8) {
      const below = registerDouble(lead.midi, -1);
      if (below !== undefined) {
        noteEvent(
          engagedCounter,
          lead.step,
          below,
          Math.min(lead.duration, 3),
          lead.velocity * 0.3,
          !!lead.accent,
        );
      }
    }
    if (lead.accent || (lead.step % 8 === 0 && lead.step % 32 === 0)) {
      const above = registerDouble(lead.midi, 1);
      if (above !== undefined) {
        noteEvent(
          criticalCounter,
          lead.step,
          above,
          Math.min(lead.duration, 3),
          lead.velocity * 0.24,
          !!lead.accent,
        );
      }
    }
  }

  for (const strum of notes.guitar) {
    const section = sectionAt(strum.step);
    if (!section || section.energy < 0.62 || !strum.accent) continue;
    const above = registerDouble(strum.midi, 1);
    if (above !== undefined) {
      noteEvent(
        engagedGuitar,
        strum.step,
        above,
        Math.min(strum.duration, 2),
        strum.velocity * 0.24,
        true,
      );
    }
  }

  for (const chord of notes.harmony) {
    const section = sectionAt(chord.step);
    if (!section || section.energy < 0.72 || !chord.accent) continue;
    const above = registerDouble(chord.midi, 1);
    if (above !== undefined) {
      noteEvent(
        criticalPiano,
        chord.step,
        above,
        Math.min(chord.duration, 2),
        chord.velocity * 0.2,
        true,
      );
    }
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
      if (!hasDrum(origin + 14, "tom")) {
        drumEventUnique(critical.drums, origin + 14, "tom", 0.5, true);
      }
    }
  }
  return { engaged, critical };
}
