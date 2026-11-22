import { describe, expect, it } from "vitest";
import { composeMusic, STEPS_PER_BAR } from "../../lib/audio/compose";

describe("music motifs, voicing, and mix", () => {
  it("repeats each cue hook with a stable contour and cadential phrase endings", () => {
    const cues = ["menu", "briefing", "mission", "victory", "defeat"] as const;
    const hookShape = (pattern: ReturnType<typeof composeMusic>, name: string) => {
      const section = pattern.sections.find((entry) => entry.name === name);
      if (!section) return [];
      const start = section.startBar * STEPS_PER_BAR;
      const end = section.endBar * STEPS_PER_BAR;
      const notes = pattern.notes.melody
        .filter((note) => note.step >= start && note.step < end)
        .sort((a, b) => a.step - b.step);
      const firstMidi = notes[0]?.midi ?? 0;
      return notes.map((note) => [note.step - start, note.midi - firstMidi]);
    };

    for (const cue of cues) {
      for (let seed = 0; seed < 24; seed++) {
        const pattern = composeMusic(seed, cue, cue === "mission" ? seed % 8 : 0);
        expect(hookShape(pattern, "hook")).toEqual(hookShape(pattern, "climax"));
        expect(hookShape(pattern, "hook")).toEqual(hookShape(pattern, "turnaround"));

        for (let bar = 7; bar < pattern.bars; bar += 8) {
          const phraseEnd = pattern.notes.melody
            .filter((note) => Math.floor(note.step / STEPS_PER_BAR) === bar)
            .sort((a, b) => a.step - b.step)
            .at(-1);
          if (phraseEnd) {
            expect((((phraseEnd.midi - pattern.rootMidi) % 12) + 12) % 12).toBe(0);
          }
        }
      }
    }
  });

  it("keeps bounded mission leads smooth without changing their recurring hook contour", () => {
    const hookShape = (pattern: ReturnType<typeof composeMusic>, name: string) => {
      const section = pattern.sections.find((entry) => entry.name === name)!;
      const start = section.startBar * STEPS_PER_BAR;
      const end = section.endBar * STEPS_PER_BAR;
      const notes = pattern.notes.melody
        .filter((note) => note.step >= start && note.step < end)
        .sort((a, b) => a.step - b.step);
      const firstMidi = notes[0]?.midi ?? 0;
      return notes.map((note) => [note.step - start, note.midi - firstMidi]);
    };

    for (const [seed, mission] of [
      [2, 4],
      [22, 6],
    ] as const) {
      const pattern = composeMusic(seed, "mission", mission);
      const melody = [...pattern.notes.melody].sort((a, b) => a.step - b.step);
      expect(melody.every((note) => note.midi >= 36 && note.midi <= 100)).toBe(true);
      for (let index = 1; index < melody.length; index += 1) {
        expect(Math.abs(melody[index]!.midi - melody[index - 1]!.midi)).toBeLessThanOrEqual(12);
      }
      expect(hookShape(pattern, "hook")).toEqual(hookShape(pattern, "climax"));
      expect(hookShape(pattern, "hook")).toEqual(hookShape(pattern, "turnaround"));
    }
  });

  it("develops one mission motif through transposed sections and keeps notes in the score scale", () => {
    const contour = (degrees: (number | null)[]) => {
      const first = degrees.find((degree): degree is number => degree !== null) ?? 0;
      return degrees.map((degree) => (degree === null ? null : degree - first));
    };

    for (const seed of [0, 421, 9999]) {
      for (let mission = 0; mission < 6; mission++) {
        const pattern = composeMusic(seed, "mission", mission);
        expect(contour(pattern.theme.developmentMotif.degrees)).toEqual(
          contour(pattern.theme.motif.degrees),
        );
        expect(contour(pattern.theme.hook.degrees)).toEqual(contour(pattern.theme.motif.degrees));
        expect(pattern.theme.developmentMotif.rhythm).toEqual(pattern.theme.motif.rhythm);
        expect(pattern.theme.hook.rhythm).toEqual(pattern.theme.motif.rhythm);

        for (const [laneName, lane] of Object.entries(pattern.notes)) {
          for (const note of lane) {
            const pitchClass = (((note.midi - pattern.rootMidi) % 12) + 12) % 12;
            expect(pattern.theme.scale).toContain(pitchClass);
            expect(note.midi).toBeGreaterThanOrEqual(laneName === "melody" ? 36 : 24);
            if (laneName === "melody") expect(note.midi).toBeLessThanOrEqual(100);
            expect(note.midi).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });

  it("repeats the chorus chords through the ending chorus", () => {
    const midiFromHz = (hz: number) => Math.round(69 + 12 * Math.log2(hz / 440));

    for (const seed of [0, 421, 9999]) {
      const pattern = composeMusic(seed, "mission", 3);
      const turnaround = pattern.sections.find((section) => section.name === "turnaround")!;
      const hook = pattern.sections.find((section) => section.name === "hook")!;
      for (let offset = 0; offset < turnaround.endBar - turnaround.startBar; offset += 1) {
        const degree =
          offset % 8 === 7 ? 0 : pattern.theme.progressionC[Math.floor((offset % 8) / 2)]!;
        const expectedPitchClass = (pattern.rootMidi + pattern.theme.scale[degree]!) % 12;
        const turnaroundPitchClass =
          midiFromHz(pattern.padRoot[turnaround.startBar + offset]!) % 12;
        expect(turnaroundPitchClass).toBe(expectedPitchClass);
        expect(turnaroundPitchClass).toBe(
          midiFromHz(pattern.padRoot[hook.startBar + offset]!) % 12,
        );
      }
    }
  });

  it("keeps foreground melodies within one octave and mostly within a perfect fifth", () => {
    const cues = ["menu", "briefing", "mission", "victory", "defeat"] as const;
    let adjacentNotes = 0;
    let notesWithinFifth = 0;

    for (const cue of cues) {
      for (let seed = 0; seed < 24; seed++) {
        const pattern = composeMusic(seed, cue, cue === "mission" ? seed % 8 : 0);
        const notes = [...pattern.notes.melody].sort((a, b) => a.step - b.step);
        let previousMidi: number | null = null;
        for (const note of notes) {
          if (previousMidi !== null) {
            const leap = Math.abs(note.midi - previousMidi);
            expect(leap).toBeLessThanOrEqual(12);
            adjacentNotes += 1;
            if (leap <= 7) notesWithinFifth += 1;
          }
          previousMidi = note.midi;
        }
      }
    }

    expect(adjacentNotes).toBeGreaterThan(1000);
    expect(notesWithinFifth / adjacentNotes).toBeGreaterThanOrEqual(0.95);
  });

  it("voices a sustained bed, a singable bass line, and a melody that does not stack on itself", () => {
    const midiFromHz = (hz: number) => Math.round(69 + 12 * Math.log2(hz / 440));
    const cues = ["menu", "briefing", "mission", "victory", "defeat"] as const;

    for (const cue of cues) {
      for (let seed = 0; seed < 16; seed += 1) {
        const pattern = composeMusic(seed, cue, cue === "mission" ? seed % 8 : 0);
        const bass = [...pattern.notes.bass].sort((a, b) => a.step - b.step);
        expect(bass.length).toBeGreaterThan(0);
        expect(bass.every((note) => note.midi >= 28 && note.midi <= 64)).toBe(true);
        for (let index = 1; index < bass.length; index += 1) {
          expect(Math.abs(bass[index]!.midi - bass[index - 1]!.midi)).toBeLessThanOrEqual(12);
        }

        for (let bar = 0; bar < pattern.bars; bar += 1) {
          const voices = [
            pattern.padRoot,
            pattern.padThird,
            pattern.padFifth,
            pattern.padSeventh,
          ].map((lane) => midiFromHz(lane[bar]!));
          expect(Math.max(...voices) - Math.min(...voices)).toBeLessThanOrEqual(24);
          expect(voices[0]).toBe(Math.min(...voices));
          for (let left = 0; left < voices.length; left += 1) {
            for (let right = left + 1; right < voices.length; right += 1) {
              const diff = Math.abs(voices[left]! - voices[right]!);
              expect(diff).toBeGreaterThanOrEqual(2);
              expect(diff % 12).not.toBe(1);
            }
          }
        }

        const melody = [...pattern.notes.melody].sort((a, b) => a.step - b.step);
        let overlaps = 0;
        for (let index = 1; index < melody.length; index += 1) {
          if (melody[index - 1]!.step + melody[index - 1]!.duration > melody[index]!.step)
            overlaps += 1;
        }
        expect(overlaps / melody.length).toBeLessThan(0.05);

        if (cue !== "mission") continue;
        const groove = pattern.sections.find((section) => section.name === "groove")!;
        const grooveChords = pattern.notes.harmony.filter(
          (note) =>
            note.step >= groove.startBar * STEPS_PER_BAR &&
            note.step < groove.endBar * STEPS_PER_BAR,
        );
        expect(grooveChords.length).toBeGreaterThan(0);
        expect(grooveChords.every((note) => note.duration >= 6)).toBe(true);
        const guitarSteps = new Set(pattern.notes.guitar.map((note) => note.step));
        expect(pattern.notes.guitar.length).toBeGreaterThan(guitarSteps.size);
        for (const strum of pattern.notes.guitar) {
          for (const lead of melody) {
            if (strum.step < lead.step || strum.step >= lead.step + lead.duration) continue;
            const diff = Math.abs(strum.midi - lead.midi) % 12;
            expect(diff === 0 || diff === 1 || diff === 11).toBe(false);
          }
        }
      }
    }
  });

  it("keeps sparse cue percussion atmospheric", () => {
    for (const cue of ["menu", "briefing", "defeat"] as const) {
      for (let seed = 0; seed < 24; seed++) {
        const pattern = composeMusic(seed, cue);
        expect(pattern.drums.some((event) => event.kind === "openHat")).toBe(false);
        for (let bar = 0; bar < pattern.bars; bar++) {
          const start = bar * STEPS_PER_BAR;
          const end = start + STEPS_PER_BAR;
          const brightHits = pattern.drums.filter(
            (event) =>
              (event.kind === "hat" || event.kind === "openHat" || event.kind === "clap") &&
              event.step >= start &&
              event.step < end,
          );
          expect(brightHits.length).toBeLessThanOrEqual(8);
        }
      }
    }
  });

  it("keeps climax counters off the harmony line and does not stack drum hits", () => {
    for (const seed of [0, 1, 421, 9999]) {
      for (let mission = 0; mission < 6; mission++) {
        const pattern = composeMusic(seed, "mission", mission);
        const climax = pattern.sections.find((section) => section.name === "climax");
        expect(climax).toBeTruthy();
        const start = climax!.startBar * STEPS_PER_BAR;
        const end = climax!.endBar * STEPS_PER_BAR;
        const climaxMelody = pattern.notes.melody.filter(
          (note) => note.step >= start && note.step < end,
        );
        const climaxCounter = pattern.notes.counter.filter(
          (note) => note.step >= start && note.step < end,
        );
        for (const note of climaxCounter) {
          expect(
            climaxMelody.some((lead) => lead.step === note.step && lead.midi === note.midi),
          ).toBe(false);
        }
        const seen = new Set<string>();
        for (const event of pattern.drums) {
          const key = `${event.step}:${event.kind}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
        if (pattern.style.arrangement.pulseEnabled[2] && pattern.style.pulseRole !== "none") {
          const hook = pattern.sections.find((section) => section.name === "hook")!;
          const midHookPulse = pattern.notes.pulse.filter((note) => {
            const bar = Math.floor(note.step / STEPS_PER_BAR);
            return bar === hook.startBar + 2 || bar === hook.startBar + 3;
          });
          expect(midHookPulse.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("opens the double-drop hole and keeps the verse line continuous", () => {
    const sectionHits = (
      pattern: ReturnType<typeof composeMusic>,
      name: string,
      kind: "kick" | "snare" | "hat",
    ) => {
      const section = pattern.sections.find((entry) => entry.name === name);
      if (!section) return 0;
      const start = section.startBar * STEPS_PER_BAR;
      const end = section.endBar * STEPS_PER_BAR;
      return pattern.drums.filter(
        (event) => event.kind === kind && event.step >= start && event.step < end,
      ).length;
    };
    const sectionHalfHits = (
      pattern: ReturnType<typeof composeMusic>,
      name: string,
      kind: "kick" | "snare" | "hat",
      half: "first" | "second",
    ) => {
      const section = pattern.sections.find((entry) => entry.name === name);
      if (!section) return 0;
      const mid = section.startBar + 8;
      const start = (half === "first" ? section.startBar : mid) * STEPS_PER_BAR;
      const end = (half === "first" ? mid : section.endBar) * STEPS_PER_BAR;
      return pattern.drums.filter(
        (event) => event.kind === kind && event.step >= start && event.step < end,
      ).length;
    };
    let sawDrop = false;
    let sawEcho = false;
    for (const seed of [0, 1, 7, 21, 421, 999, 2000, 9999]) {
      for (let mission = 0; mission < 16; mission++) {
        const pattern = composeMusic(seed, "mission", mission);
        if (pattern.style.arrangement.name === "double-drop") {
          sawDrop = true;
          const grooveKicks = sectionHits(pattern, "groove", "kick");
          expect(sectionHalfHits(pattern, "escalation", "kick", "first")).toBeLessThan(
            grooveKicks / 3,
          );
          expect(sectionHalfHits(pattern, "breakdown", "kick", "first")).toBeLessThan(
            grooveKicks / 3,
          );
          const escalation = pattern.sections.find((section) => section.name === "escalation")!;
          expect(
            pattern.notes.pulse.some(
              (note) =>
                note.step >= escalation.startBar * STEPS_PER_BAR &&
                note.step < escalation.endBar * STEPS_PER_BAR,
            ),
          ).toBe(false);
        }
        if (pattern.style.arrangement.echoMelody) {
          sawEcho = true;
          const groove = pattern.sections.find((section) => section.name === "groove")!;
          const inGroove = (bar: number) => bar >= groove.startBar && bar < groove.endBar;
          const even = pattern.notes.melody.filter((note) => {
            const bar = Math.floor(note.step / STEPS_PER_BAR);
            return inGroove(bar) && (bar - groove.startBar) % 2 === 0 && bar > groove.startBar;
          });
          const odd = pattern.notes.melody.filter((note) => {
            const bar = Math.floor(note.step / STEPS_PER_BAR);
            return inGroove(bar) && (bar - groove.startBar) % 2 === 1;
          });
          expect(even.length).toBeGreaterThan(0);
          expect(odd.length).toBeGreaterThan(0);
          const average = (notes: { velocity: number }[]) =>
            notes.reduce((sum, note) => sum + note.velocity, 0) / Math.max(1, notes.length);
          expect(average(even)).toBeGreaterThan(average(odd) * 0.9);
        }
      }
    }
    expect(sawDrop).toBe(true);
    expect(sawEcho).toBe(true);
  });
});
