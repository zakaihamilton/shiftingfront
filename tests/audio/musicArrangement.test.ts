import { describe, expect, it } from "vitest";
import {
  BARS_PER_SECTION,
  composeMusic,
  MUSIC_BARS,
  MUSIC_STEPS,
  midiToHz,
  STEPS_PER_BAR,
} from "../../lib/audio/compose";
import { shouldApplyPendingIntensity } from "../../lib/audio/musicScheduler";

describe("music arrangement and pacing", () => {
  it("builds a long-form arrangement with contrasting phrases and fills", () => {
    expect(MUSIC_BARS).toBe(128);
    expect(BARS_PER_SECTION).toBe(16);
    const half = STEPS_PER_BAR * (MUSIC_BARS / 2);
    const fillBars = Array.from({ length: MUSIC_BARS / 8 }, (_, index) => index * 8 + 7);

    for (const seed of [0, 421, 9999]) {
      const pattern = composeMusic(seed, "mission", 3);
      const firstHalf = [
        pattern.bass.slice(0, half),
        pattern.arp.slice(0, half),
        pattern.melody.slice(0, half),
        pattern.kick.slice(0, half),
        pattern.snare.slice(0, half),
        pattern.padRoot.slice(0, MUSIC_BARS / 2),
      ];
      const secondHalf = [
        pattern.bass.slice(half),
        pattern.arp.slice(half),
        pattern.melody.slice(half),
        pattern.kick.slice(half),
        pattern.snare.slice(half),
        pattern.padRoot.slice(MUSIC_BARS / 2),
      ];

      expect(
        firstHalf.some((lane, index) => JSON.stringify(lane) !== JSON.stringify(secondHalf[index])),
      ).toBe(true);
      const quarter = STEPS_PER_BAR * 32;
      const quarterPrints = [0, 1, 2, 3].map((index) =>
        JSON.stringify({
          bass: pattern.bass.slice(index * quarter, (index + 1) * quarter),
          arp: pattern.arp.slice(index * quarter, (index + 1) * quarter),
          melody: pattern.melody.slice(index * quarter, (index + 1) * quarter),
          kick: pattern.kick.slice(index * quarter, (index + 1) * quarter),
        }),
      );
      expect(quarterPrints[0]).not.toEqual(quarterPrints[1]);
      expect(quarterPrints[1]).not.toEqual(quarterPrints[2]);
      expect(quarterPrints[2]).not.toEqual(quarterPrints[3]);
      expect(new Set(pattern.padRoot).size).toBeGreaterThan(2);
      for (const bar of fillBars) {
        const start = bar * STEPS_PER_BAR;
        expect(
          pattern.snare.slice(start, start + STEPS_PER_BAR).filter(Boolean).length,
        ).toBeGreaterThan(0);
      }
      const penultimateFill = pattern.snare
        .slice(119 * STEPS_PER_BAR, 120 * STEPS_PER_BAR)
        .filter(Boolean).length;
      const finalFill = pattern.snare
        .slice(127 * STEPS_PER_BAR, 128 * STEPS_PER_BAR)
        .filter(Boolean).length;
      expect(finalFill).toBeGreaterThan(penultimateFill);
      expect(pattern.sections.map((section) => section.name)).toEqual([
        "intro",
        "groove",
        "hook",
        "development",
        "breakdown",
        "escalation",
        "climax",
        "turnaround",
      ]);
      expect(pattern.motif.degrees.length).toBeGreaterThan(4);
      expect(pattern.notes.melody.length).toBeGreaterThan(0);
      expect(pattern.notes.melody.every((note) => note.duration > 0 && note.velocity > 0)).toBe(
        true,
      );
    }
  });

  it("starts mission grooves with drums, pulse, and melody before the first verse ends", () => {
    for (const seed of [0, 421, 9999]) {
      const pattern = composeMusic(seed, "mission", 3);
      const fromBar = (bar: number) => bar * STEPS_PER_BAR;
      expect(pattern.kick.slice(fromBar(4), fromBar(16)).some(Boolean)).toBe(true);
      if (pattern.style.arrangement.pulseEnabled[0] && pattern.style.pulseRole !== "none") {
        expect(pattern.arp.slice(fromBar(4), fromBar(16)).some((note) => note !== null)).toBe(true);
      }
      if (pattern.style.arrangement.melodyEnabled[0]) {
        expect(pattern.melody.slice(fromBar(8), fromBar(16)).some((note) => note !== null)).toBe(
          true,
        );
      }
    }
  });

  it("applies combat intensity on bar boundaries and critical immediately", () => {
    expect(shouldApplyPendingIntensity(0, "engaged")).toBe(true);
    expect(shouldApplyPendingIntensity(1, "engaged")).toBe(false);
    expect(shouldApplyPendingIntensity(STEPS_PER_BAR, "calm")).toBe(true);
    expect(shouldApplyPendingIntensity(6, "critical")).toBe(true);
    expect(shouldApplyPendingIntensity(7, "critical")).toBe(false);
    expect(shouldApplyPendingIntensity(3, null)).toBe(false);
  });

  it("keeps victory drums active through the breakdown", () => {
    const pattern = composeMusic(421, "victory");
    const breakdownStart = 64 * STEPS_PER_BAR;
    const breakdownEnd = 79 * STEPS_PER_BAR;

    expect(pattern.kick.slice(breakdownStart, breakdownEnd).some(Boolean)).toBe(true);
    expect(pattern.snare.slice(breakdownStart, breakdownEnd).some(Boolean)).toBe(true);
    expect(pattern.hats.slice(breakdownStart, breakdownEnd).some(Boolean)).toBe(true);
  });

  it("keeps cue tempos in upbeat 80s ranges and fills long-form lanes", () => {
    const ranges = {
      menu: [112, 124],
      briefing: [104, 118],
      mission: [118, 138],
      victory: [124, 136],
      defeat: [88, 100],
    } as const;
    for (const seed of [0, 1, 421, 9999]) {
      for (const [cue, [lo, hi]] of Object.entries(ranges)) {
        const pattern = composeMusic(seed, cue as keyof typeof ranges, cue === "mission" ? 3 : 0);
        expect(pattern.bpm).toBeGreaterThanOrEqual(lo);
        expect(pattern.bpm).toBeLessThanOrEqual(hi);
        expect(pattern.bars).toBe(MUSIC_BARS);
        expect(pattern.steps).toBe(MUSIC_STEPS);
        expect(pattern.bass).toHaveLength(MUSIC_STEPS);
        expect(pattern.arp).toHaveLength(MUSIC_STEPS);
        expect(pattern.melody).toHaveLength(MUSIC_STEPS);
        expect(pattern.counter).toHaveLength(MUSIC_STEPS);
        expect(pattern.harmony).toHaveLength(MUSIC_STEPS);
        expect(pattern.kick).toHaveLength(MUSIC_STEPS);
        expect(pattern.snare).toHaveLength(MUSIC_STEPS);
        expect(pattern.hats).toHaveLength(MUSIC_STEPS);
        expect(pattern.openHats).toHaveLength(MUSIC_STEPS);
        expect(pattern.padRoot).toHaveLength(MUSIC_BARS);
        expect(pattern.padThird).toHaveLength(MUSIC_BARS);
        expect(pattern.padFifth).toHaveLength(MUSIC_BARS);
        expect(pattern.padSeventh).toHaveLength(MUSIC_BARS);
        expect(pattern.bass.some((note) => note !== null)).toBe(true);
        expect(pattern.kick.some(Boolean)).toBe(true);
        expect(pattern.snare.some(Boolean)).toBe(true);
        const melodyHits = pattern.melody.filter((note) => note !== null).length;
        expect(melodyHits).toBeGreaterThan(0);
        expect(melodyHits).toBeLessThan(MUSIC_STEPS / 2);
        expect(pattern.rootHz).toBeGreaterThan(midiToHz(30));
        if (cue === "mission") {
          expect([
            "pulse",
            "march",
            "shuffle",
            "half-time",
            "breakbeat",
            "four-floor",
            "offbeat",
          ]).toContain(pattern.theme.groove);
          expect([
            "natural minor",
            "dorian",
            "mixolydian",
            "major",
            "phrygian",
            "harmonic minor",
            "minor pentatonic",
            "lydian",
            "double harmonic",
            "blues",
          ]).toContain(pattern.scaleName);
        }
      }
    }
  });

  it("builds a recurring cinematic hook with restrained gated drums", () => {
    const sectionNotesFor = (
      pattern: ReturnType<typeof composeMusic>,
      name: string,
      lane: "melody" | "pulse" | "counter",
    ) => {
      const section = pattern.sections.find((entry) => entry.name === name);
      if (!section) return [];
      return pattern.notes[lane].filter(
        (note) =>
          note.step >= section.startBar * STEPS_PER_BAR &&
          note.step < section.endBar * STEPS_PER_BAR,
      );
    };
    const averageDuration = (notes: { duration: number }[]) =>
      notes.reduce((sum, note) => sum + note.duration, 0) / Math.max(1, notes.length);

    for (const seed of [0, 421, 9999]) {
      const pattern = composeMusic(seed, "mission", 3);
      const sectionNotes = (name: string, lane: "melody" | "pulse" | "counter") =>
        sectionNotesFor(pattern, name, lane);
      expect(pattern.theme.hook).not.toEqual(pattern.motif);
      expect(pattern.theme.developmentMotif.degrees.length).toBeGreaterThan(4);
      expect(pattern.motif.rhythm.some((step) => step % 2 === 1)).toBe(true);
      expect([
        "pulse",
        "march",
        "shuffle",
        "half-time",
        "breakbeat",
        "four-floor",
        "offbeat",
      ]).toContain(pattern.theme.groove);
      expect([
        "natural minor",
        "dorian",
        "mixolydian",
        "major",
        "phrygian",
        "harmonic minor",
        "minor pentatonic",
        "lydian",
        "double harmonic",
        "blues",
      ]).toContain(pattern.scaleName);
      expect(sectionNotes("hook", "melody").length).toBeGreaterThan(24);
      if (pattern.style.arrangement.melodyEnabled[1]) {
        expect(sectionNotes("groove", "melody").length).toBeGreaterThan(0);
        expect(averageDuration(sectionNotes("hook", "melody"))).toBeGreaterThan(
          averageDuration(sectionNotes("groove", "melody")),
        );
      }
      expect(sectionNotes("climax", "melody").length).toBeGreaterThanOrEqual(
        sectionNotes("hook", "melody").length,
      );
      if (pattern.style.pulseRole !== "none") {
        expect(sectionNotes("climax", "pulse").length).toBeGreaterThanOrEqual(
          sectionNotes("hook", "pulse").length,
        );
      }
      const developmentMelody = sectionNotes("development", "melody");
      const developmentCounter = sectionNotes("development", "counter");
      expect(developmentCounter.length).toBeGreaterThan(0);
      for (const note of developmentCounter) {
        const lead = developmentMelody.find((entry) => entry.step === note.step);
        expect(lead).toBeTruthy();
        expect(lead?.midi).not.toBe(note.midi);
      }
      expect(pattern.drums.some((event) => event.kind === "clap")).toBe(true);
      expect(pattern.drums.filter((event) => event.kind === "clap").length).toBeLessThan(
        pattern.drums.filter((event) => event.kind === "snare").length / 4,
      );
      expect(pattern.drums.some((event) => event.kind === "impact")).toBe(true);
      expect(pattern.arpType).toBe(pattern.style.pulseType);
      expect(new Set(pattern.padThird).size).toBeGreaterThan(2);
      expect(new Set(pattern.padSeventh).size).toBeGreaterThan(2);

      const sectionHats = (name: string) => {
        const section = pattern.sections.find((entry) => entry.name === name);
        if (!section) return [];
        return pattern.drums.filter(
          (event) =>
            event.kind === "hat" &&
            event.step >= section.startBar * STEPS_PER_BAR &&
            event.step < section.endBar * STEPS_PER_BAR,
        );
      };
      expect(sectionHats("climax").length).toBeGreaterThanOrEqual(BARS_PER_SECTION * 4);
      expect(sectionHats("hook").length).toBeLessThanOrEqual(BARS_PER_SECTION * 8);
    }

    const majorOpeners = [
      [0, 4, 5, 3],
      [0, 4, 3, 5],
      [0, 3, 4, 5],
      [5, 3, 0, 4],
      [0, 2, 5, 4],
      [0, 5, 3, 4],
      [2, 5, 0, 4],
      [0, 3, 5, 1],
    ];
    const majors = Array.from({ length: 48 }, (_, seed) => composeMusic(seed, "mission", 0)).filter(
      (entry) => entry.scaleName === "major",
    );
    expect(majors.length).toBeGreaterThan(0);
    for (const major of majors) {
      expect(majorOpeners).toContainEqual(major.theme.progressionA.slice(0, 4));
      expect(major.theme.progressionA.slice(0, 4)).not.toEqual([0, 5, 2, 6]);
    }
  });
});
