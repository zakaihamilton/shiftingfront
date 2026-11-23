import { describe, expect, it } from "vitest";
import {
  BARS_PER_SECTION,
  composeMusic,
  MUSIC_BARS,
  MUSIC_STEPS,
  midiToHz,
  STEPS_PER_BAR,
  TUTORIAL_MUSIC_MISSION,
} from "../../lib/audio/compose";
import { cueMotifPhrases } from "../../lib/audio/compose/cueThemes";
import { chordToneMidi } from "../../lib/audio/compose/helpers";
import { missionMotifPalette } from "../../lib/audio/compose/missionThemes";
import {
  isMusicEnabled,
  musicCueFromPath,
  setMusicEnabled,
  setMusicIntensity,
} from "../../lib/audio/music";
import { spatialAudioForWorld } from "../../lib/audio/spatial";
import {
  beep,
  isSfxEnabled,
  MAX_SFX_QUEUE_S,
  playSfx,
  scheduleSfxTime,
  setSfxEnabled,
} from "../../lib/audio/synth";
import { beepForCommands } from "../../lib/audio/uiOrders";
import { createCamera } from "../../lib/iso";
import type { MissionKind } from "../../lib/types";

describe("generated audio behavior and integration", () => {
  it("maps routes onto music cues", () => {
    expect(musicCueFromPath("/")).toBe("menu");
    expect(musicCueFromPath("/briefing")).toBe("briefing");
    expect(musicCueFromPath("/play")).toBe("mission");
    expect(musicCueFromPath("/tutorial")).toBe("mission");
    expect(musicCueFromPath("/campaign-complete")).toBe("victory");
    expect(musicCueFromPath("/campaign")).toBeNull();
    expect(musicCueFromPath("/privacy")).toBeNull();
  });

  it("skips synthesized cues when sound effects are disabled", () => {
    setSfxEnabled(false);
    expect(isSfxEnabled()).toBe(false);
    expect(() => beep("select")).not.toThrow();
    setSfxEnabled(true);
    expect(isSfxEnabled()).toBe(true);
  });

  it("exposes semantic layered cues without requiring an audio device", () => {
    expect(() => {
      playSfx("uiConfirm");
      playSfx("uiCancel");
      playSfx("orderAttack");
      playSfx("orderHarvest");
      playSfx("credits");
      playSfx("powerShortage");
      playSfx("insufficientFunds");
      playSfx("deadline");
      playSfx("smallArms", { pan: -0.8 });
      playSfx("antiArmor");
      playSfx("cannon", { pan: 0.8 });
      playSfx("airStrike");
      playSfx("antiAir");
      playSfx("impact");
      playSfx("impactFlesh");
      playSfx("impactMetal");
      playSfx("destruction", { heavy: true });
      playSfx("wreckHuman");
      playSfx("wreckVehicle");
      playSfx("heal");
      playSfx("repair");
      playSfx("contact");
      playSfx("warning");
      setMusicIntensity("critical");
    }).not.toThrow();
  });

  it("maps issued orders onto distinct acknowledgement beeps", () => {
    expect(beepForCommands([])).toBeUndefined();
    expect(beepForCommands([{ type: "move", unitIds: [1], x: 2, y: 3 }])).toBe("ack");
    expect(beepForCommands([{ type: "attack", unitIds: [1], targetId: 9 }])).toBe("ackAttack");
    expect(beepForCommands([{ type: "attackMove", unitIds: [1], x: 4, y: 5 }])).toBe("ackAttack");
    expect(beepForCommands([{ type: "harvest", unitIds: [1], x: 4, y: 5 }])).toBe("ackHarvest");
    expect(
      beepForCommands([
        { type: "harvest", unitIds: [1], x: 4, y: 5 },
        { type: "move", unitIds: [2], x: 4, y: 5 },
      ]),
    ).toBe("ackHarvest");
    expect(beepForCommands([{ type: "support", unitIds: [1], targetId: 2 }])).toBe("ack");
    expect(beepForCommands([{ type: "stop", unitIds: [1] }])).toBe("ack");
  });

  it("maps world positions to bounded stereo placement and audible range", () => {
    const camera = createCamera();
    camera.x = 400;
    camera.y = 80;
    expect(spatialAudioForWorld(0, 0, camera, 800, 500).pan).toBeLessThanOrEqual(0.85);
    expect(spatialAudioForWorld(0, 0, camera, 800, 500).pan).toBeGreaterThanOrEqual(-0.85);
    const near = spatialAudioForWorld(6, 6, camera, 800, 500);
    const far = spatialAudioForWorld(12, 0, camera, 800, 500);
    expect(near.audible).toBe(true);
    expect(far.audible).toBe(true);
    expect(near.gain).toBeGreaterThanOrEqual(0.95);
    expect(far.gain).toBeGreaterThanOrEqual(0.68);
    expect(near.gain).toBeGreaterThan(far.gain);
  });

  it("staggers same-kind shots instead of dropping a volley", () => {
    expect(scheduleSfxTime(1, Number.NEGATIVE_INFINITY, 0.045)).toBe(1);
    expect(scheduleSfxTime(1, 1, 0.045)).toBeCloseTo(1.045);
    expect(scheduleSfxTime(1, 1, 0)).toBe(1);

    const starts: number[] = [];
    let previous = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 20; i++) {
      const start = scheduleSfxTime(1, previous, 0.045);
      if (start === null) break;
      starts.push(start);
      previous = start;
    }
    expect(starts[0]).toBe(1);
    expect(starts.length).toBeGreaterThan(5);
    expect(starts.at(-1)! - 1).toBeLessThanOrEqual(MAX_SFX_QUEUE_S);
    expect(scheduleSfxTime(1, previous, 0.045)).toBeNull();
    expect(scheduleSfxTime(0.1, 50, 0.045)).toBe(0.1);
  });

  it("gives every mission kind a phrase book and keeps cues off the battle style", () => {
    const kinds: MissionKind[] = [
      "harvestQuota",
      "forceQuota",
      "structureQuota",
      "holdTheLine",
      "sabotage",
      "destroyMarked",
      "razeAll",
      "annihilate",
      "decapitate",
      "escort",
      "rescue",
      "extraction",
    ];
    for (const kind of kinds) {
      const phrases = missionMotifPalette(kind)!.phrases;
      expect(phrases.length).toBeGreaterThanOrEqual(6);
      expect(
        new Set(phrases.map((phrase) => JSON.stringify(phrase.rhythm))).size,
      ).toBeGreaterThanOrEqual(4);
      for (const phrase of phrases) {
        expect(phrase.degrees.length).toBeGreaterThan(4);
        expect(phrase.rhythm).toHaveLength(phrase.degrees.length);
        expect(phrase.rhythm.some((step) => step % 2 === 1)).toBe(true);
        expect(phrase.rhythm[0]).toBeGreaterThanOrEqual(0);
        expect(phrase.rhythm.at(-1)).toBeLessThanOrEqual(15);
        for (let index = 1; index < phrase.rhythm.length; index += 1) {
          expect(phrase.rhythm[index]).toBeGreaterThan(phrase.rhythm[index - 1]!);
        }
      }
    }

    const pieces = Array.from({ length: 24 }, (_, seed) =>
      Array.from({ length: 6 }, (__, mission) => composeMusic(seed, "mission", mission)),
    );
    const flat = pieces.flat();
    expect(
      new Set(flat.map((pattern) => JSON.stringify(pattern.theme.motif.degrees))).size,
    ).toBeGreaterThanOrEqual(24);
    expect(
      new Set(flat.map((pattern) => JSON.stringify(pattern.theme.motif.rhythm))).size,
    ).toBeGreaterThanOrEqual(8);
    expect(new Set(flat.map((pattern) => pattern.style.melodyOctave))).toEqual(new Set([1, 2]));
    expect(
      Math.max(
        ...flat.flatMap((pattern) => pattern.style.padDetune.map((cents) => Math.abs(cents))),
      ),
    ).toBeGreaterThanOrEqual(12);
    for (const campaign of pieces) {
      expect(new Set(campaign.map((pattern) => pattern.theme.groove)).size).toBeGreaterThanOrEqual(
        2,
      );
      expect(new Set(campaign.map((pattern) => pattern.scaleName)).size).toBeGreaterThanOrEqual(2);
    }

    const cues = ["menu", "briefing", "victory", "defeat"] as const;
    for (const cue of cues) {
      let differs = 0;
      for (let seed = 0; seed < 24; seed += 1) {
        if (composeMusic(seed, cue, 0).style.name !== composeMusic(seed, "mission", 0).style.name)
          differs += 1;
      }
      expect(differs).toBeGreaterThanOrEqual(20);
    }
  });

  it("gives each screen its own tune, a louder hook, and a rhythm section that matches the style", () => {
    const sounding = (degrees: readonly (number | null)[]) =>
      degrees.filter((degree): degree is number => degree !== null);
    const menu = cueMotifPhrases("menu")!;
    const briefing = cueMotifPhrases("briefing")!;
    const victory = cueMotifPhrases("victory")!;
    const defeat = cueMotifPhrases("defeat")!;
    for (const phrase of [...menu.verse, ...menu.hook]) {
      expect(Math.max(...sounding(phrase.degrees))).toBeLessThanOrEqual(3);
      expect(
        phrase.rhythm.some(
          (step: number, index: number) => index > 0 && step - phrase.rhythm[index - 1]! >= 3,
        ),
      ).toBe(true);
    }
    for (const phrase of briefing.verse) {
      expect(Math.max(...sounding(phrase.degrees))).toBeLessThanOrEqual(4);
      expect(
        phrase.rhythm.some(
          (step: number, index: number) => index > 0 && step - phrase.rhythm[index - 1]! <= 2,
        ),
      ).toBe(true);
    }
    for (const phrase of [...victory.verse, ...victory.hook]) {
      const notes = sounding(phrase.degrees);
      expect(Math.max(...notes) - notes[0]!).toBeGreaterThanOrEqual(3);
    }
    for (const phrase of defeat.verse) {
      const notes = sounding(phrase.degrees);
      expect(notes[0]).toBeGreaterThanOrEqual(3);
      expect(notes.at(-1)).toBe(0);
    }

    const cueMotifs = ["menu", "briefing", "victory", "defeat"].map((cue) =>
      JSON.stringify(
        composeMusic(421, cue as "menu" | "briefing" | "victory" | "defeat").theme.motif.degrees,
      ),
    );
    expect(new Set(cueMotifs).size).toBe(4);

    const averageVelocity = (pattern: ReturnType<typeof composeMusic>, name: string) => {
      const section = pattern.sections.find((entry) => entry.name === name)!;
      const notes = pattern.notes.melody.filter(
        (note) =>
          note.step >= section.startBar * STEPS_PER_BAR &&
          note.step < section.endBar * STEPS_PER_BAR,
      );
      return notes.reduce((sum, note) => sum + note.velocity, 0) / Math.max(1, notes.length);
    };
    const drumsIn = (pattern: ReturnType<typeof composeMusic>, name: string) => {
      const section = pattern.sections.find((entry) => entry.name === name)!;
      return pattern.drums.filter(
        (event) =>
          event.step >= section.startBar * STEPS_PER_BAR &&
          event.step < section.endBar * STEPS_PER_BAR,
      ).length;
    };
    for (const seed of [0, 421, 9999]) {
      const pattern = composeMusic(seed, "mission", 3);
      if (
        pattern.style.arrangement.melodyEnabled[0] &&
        pattern.style.arrangement.melodyEnabled[1] &&
        pattern.style.arrangement.melodyEnabled[2]
      ) {
        expect(averageVelocity(pattern, "hook")).toBeGreaterThan(
          averageVelocity(pattern, "groove"),
        );
        expect(averageVelocity(pattern, "groove")).toBeGreaterThan(
          averageVelocity(pattern, "intro"),
        );
      }
      const breakdown = pattern.sections.find((entry) => entry.name === "breakdown")!;
      const breakdownDrums = pattern.drums.filter(
        (event) =>
          event.step >= breakdown.startBar * STEPS_PER_BAR &&
          event.step < breakdown.endBar * STEPS_PER_BAR,
      );
      expect(breakdownDrums.some((event) => event.kind === "kick" || event.kind === "hat")).toBe(
        false,
      );
      expect(breakdownDrums.length).toBeGreaterThan(0);
      expect(breakdownDrums.length).toBeLessThan(drumsIn(pattern, "groove"));
      expect(drumsIn(composeMusic(seed, "victory"), "breakdown")).toBeGreaterThan(
        drumsIn(pattern, "breakdown"),
      );
      if (!pattern.style.arrangement.holdBass[3]) {
        const section = pattern.sections.find((entry) => entry.name === "development")!;
        const classes = new Set(
          pattern.notes.bass
            .filter(
              (note) =>
                note.step >= section.startBar * STEPS_PER_BAR &&
                note.step < section.endBar * STEPS_PER_BAR,
            )
            .map((note) => ((note.midi % 12) + 12) % 12),
        );
        expect(classes.size).toBeGreaterThanOrEqual(3);
      }
    }

    let foundry: ReturnType<typeof composeMusic>["style"] | undefined;
    let ice: ReturnType<typeof composeMusic>["style"] | undefined;
    for (let seed = 0; seed < 48 && (!foundry || !ice); seed += 1) {
      for (let mission = 0; mission < 6 && (!foundry || !ice); mission += 1) {
        const pattern = composeMusic(seed, "mission", mission);
        if (pattern.style.name === "foundry-stomp") foundry = pattern.style;
        if (pattern.style.name === "ice-protocol") ice = pattern.style;
      }
    }
    expect(foundry).toBeTruthy();
    expect(ice).toBeTruthy();
    expect(foundry!.drum.kickTail).toBeGreaterThan(ice!.drum.kickTail);
    expect(foundry!.drum.kickEnd).toBeLessThan(ice!.drum.kickEnd);
    expect(ice!.drum.hatFrequency).toBeGreaterThan(foundry!.drum.hatFrequency);
  });

  it("forms each mission as a verse, a repeated chorus, and a bridge", () => {
    const midiFromHz = (hz: number) => Math.round(69 + 12 * Math.log2(hz / 440));
    const cells = (
      pattern: ReturnType<typeof composeMusic>,
      name: string,
      fromBar: number,
      toBar: number,
    ) => {
      const section = pattern.sections.find((entry) => entry.name === name)!;
      const notes = pattern.notes.melody
        .filter((note) => {
          const bar = Math.floor(note.step / STEPS_PER_BAR) - section.startBar;
          return bar >= fromBar && bar < toBar;
        })
        .sort((a, b) => a.step - b.step);
      const bases = new Map<number, number>();
      for (const note of notes) {
        const half = Math.floor((Math.floor(note.step / STEPS_PER_BAR) - section.startBar) / 8);
        if (!bases.has(half)) bases.set(half, note.midi);
      }
      return notes.map((note) => {
        const localBar = Math.floor(note.step / STEPS_PER_BAR) - section.startBar;
        return `${localBar % 8}:${note.step % STEPS_PER_BAR}:${note.midi - bases.get(Math.floor(localBar / 8))!}`;
      });
    };

    for (const seed of [0, 21, 421, 9999]) {
      const pattern = composeMusic(seed, "mission", 3);
      const verse = cells(pattern, "groove", 0, 8);
      const verseReturn = cells(pattern, "groove", 8, 16);
      const chorus = cells(pattern, "hook", 0, 8);
      const chorusReturn = cells(pattern, "hook", 8, 16);
      const secondVerse = cells(pattern, "development", 0, 8);
      const secondVerseReturn = cells(pattern, "development", 8, 16);
      expect(verse.length).toBeGreaterThan(0);
      expect(chorus.length).toBeGreaterThan(0);
      expect(verseReturn).toEqual(verse);
      expect(chorusReturn).toEqual(chorus);
      expect(secondVerseReturn).toEqual(secondVerse);
      expect(chorus).not.toEqual(verse);
      expect(cells(pattern, "climax", 0, 16)).toEqual(cells(pattern, "hook", 0, 16));
      expect(cells(pattern, "turnaround", 0, 16)).toEqual(cells(pattern, "hook", 0, 16));
      expect(cells(pattern, "escalation", 8, 16)).toEqual(chorus);
      for (const name of ["groove", "hook", "development", "breakdown", "turnaround"] as const) {
        const section = pattern.sections.find((entry) => entry.name === name)!;
        for (let offset = 0; offset < 8; offset += 1) {
          const first = midiFromHz(pattern.padRoot[section.startBar + offset]!);
          const repeated = midiFromHz(pattern.padRoot[section.startBar + offset + 8]!);
          expect(((first % 12) + 12) % 12).toBe(((repeated % 12) + 12) % 12);
        }
      }

      const bridge = pattern.sections.find((entry) => entry.name === "breakdown")!;
      const bridgeNotes = pattern.notes.melody.filter(
        (note) =>
          note.step >= bridge.startBar * STEPS_PER_BAR && note.step < bridge.endBar * STEPS_PER_BAR,
      );
      expect(bridgeNotes.length).toBeGreaterThan(0);
      expect(cells(pattern, "breakdown", 8, 16)).toEqual(cells(pattern, "breakdown", 0, 8));
      const pulseCount = (from: number, to: number) =>
        pattern.notes.pulse.filter((note) => {
          const bar = Math.floor(note.step / STEPS_PER_BAR) - bridge.startBar;
          return bar >= from && bar < to;
        }).length;
      expect(pulseCount(8, 16)).toBe(pulseCount(0, 8));
      expect(
        pattern.notes.harmony.some(
          (note) =>
            note.step >= bridge.startBar * STEPS_PER_BAR &&
            note.step < bridge.endBar * STEPS_PER_BAR,
        ),
      ).toBe(false);

      const tomBars = (name: string, from: number, to: number) => {
        const section = pattern.sections.find((entry) => entry.name === name)!;
        return pattern.drums
          .filter((event) => event.kind === "tom")
          .map((event) => Math.floor(event.step / STEPS_PER_BAR) - section.startBar)
          .filter((local) => local >= from && local < to)
          .map((local) => local % 8)
          .sort((left, right) => left - right);
      };
      for (const name of ["groove", "development", "hook"] as const) {
        const section = pattern.sections.find((entry) => entry.name === name)!;
        if (pattern.style.arrangement.holdBass[pattern.sections.indexOf(section)]) continue;
        expect(tomBars(name, 8, 16)).toEqual(tomBars(name, 0, 8));
      }

      const grooveStart = pattern.sections.find((entry) => entry.name === "groove")!.startBar;
      const stepsOn = (local: number) =>
        pattern.notes.melody
          .filter((note) => Math.floor(note.step / STEPS_PER_BAR) === grooveStart + local)
          .map((note) => note.step % STEPS_PER_BAR)
          .sort((left, right) => left - right);
      expect(stepsOn(0)).toEqual(stepsOn(1));

      const chorusLead = (name: string) =>
        pattern.notes.melody
          .filter((note) => {
            const section = pattern.sections.find((entry) => entry.name === name)!;
            const local = Math.floor(note.step / STEPS_PER_BAR) - section.startBar;
            return local >= 0 && local < 8;
          })
          .sort((left, right) => left.step - right.step)
          .map((note) => note.midi);
      expect(chorusLead("climax")).toEqual(chorusLead("hook"));
      expect(chorusLead("turnaround")).toEqual(chorusLead("hook"));

      const beat = (name: string) => {
        const section = pattern.sections.find((entry) => entry.name === name)!;
        return pattern.drums
          .filter(
            (event) => event.kind === "kick" || event.kind === "snare" || event.kind === "clap",
          )
          .filter((event) => {
            const local = Math.floor(event.step / STEPS_PER_BAR) - section.startBar;
            return local >= 0 && local < 15 && local % 8 !== 7;
          })
          .map((event) => {
            const local = Math.floor(event.step / STEPS_PER_BAR) - section.startBar;
            return `${local % 8}:${event.step % STEPS_PER_BAR}:${event.kind}`;
          })
          .sort()
          .join("|");
      };
      expect(beat("turnaround")).toBe(beat("hook"));
      expect(beat("climax")).toBe(beat("hook"));
    }
  });

  it("plays each phrase on the rhythm it was written with", () => {
    const soundingSteps = (motif: ReturnType<typeof composeMusic>["motif"], response: boolean) => {
      const degrees = response ? motif.response : motif.degrees;
      return degrees
        .map((degree, index) =>
          degree == null ? null : (motif.rhythm[index] ?? index * 2) % STEPS_PER_BAR,
        )
        .filter((step): step is number => step != null)
        .sort((left, right) => left - right);
    };
    const barSteps = (pattern: ReturnType<typeof composeMusic>, start: number) =>
      pattern.notes.melody
        .filter((note) => Math.floor(note.step / STEPS_PER_BAR) === start)
        .map((note) => note.step % STEPS_PER_BAR)
        .sort((left, right) => left - right);

    for (const cue of ["menu", "briefing", "mission", "victory", "defeat"] as const) {
      for (let seed = 0; seed < 24; seed += 1) {
        const missions = cue === "mission" ? [0, 1, 2, 3, 4, 5] : [0];
        for (const mission of missions) {
          const pattern = composeMusic(seed, cue, mission);
          const groove = pattern.sections.find((section) => section.name === "groove")!;
          const hook = pattern.sections.find((section) => section.name === "hook")!;
          expect(barSteps(pattern, groove.startBar)).toEqual(soundingSteps(pattern.motif, false));
          expect(barSteps(pattern, groove.startBar + 4)).toEqual(
            soundingSteps(pattern.motif, true),
          );
          expect(barSteps(pattern, hook.startBar)).toEqual(
            soundingSteps(pattern.theme.hook, false),
          );
        }
      }
    }
  });

  it("keeps combat doubles inside the melody range", () => {
    for (let seed = 0; seed < 24; seed += 1) {
      for (let mission = 0; mission < 6; mission += 1) {
        const pattern = composeMusic(seed, "mission", mission);
        for (const layer of Object.values(pattern.intensityLayers)) {
          for (const lane of Object.values(layer?.notes ?? {})) {
            for (const note of lane ?? []) {
              expect(note.midi).toBeGreaterThanOrEqual(24);
              expect(note.midi).toBeLessThanOrEqual(100);
            }
          }
        }
      }
    }
  });

  it("lands chorus downbeats on the chord", () => {
    let hits = 0;
    let tones = 0;
    for (let seed = 0; seed < 24; seed += 1) {
      for (let mission = 0; mission < 6; mission += 1) {
        const pattern = composeMusic(seed, "mission", mission);
        const hook = pattern.sections.find((section) => section.name === "hook")!;
        for (let offset = 0; offset < 16; offset += 1) {
          const downbeat = pattern.notes.melody.find(
            (note) =>
              Math.floor(note.step / STEPS_PER_BAR) === hook.startBar + offset &&
              note.step % STEPS_PER_BAR === 0,
          );
          if (!downbeat) continue;
          hits += 1;
          const degree =
            offset % 8 === 7 ? 0 : pattern.theme.progressionC[Math.floor((offset % 8) / 2)]!;
          const pcs = [0, 1, 2, 3].map(
            (tone) =>
              ((chordToneMidi(pattern.rootMidi, pattern.theme.scale, degree, tone, 0) % 12) + 12) %
              12,
          );
          if (pcs.includes(((downbeat.midi % 12) + 12) % 12)) tones += 1;
        }
      }
    }
    expect(hits).toBeGreaterThan(1000);
    expect(tones / hits).toBeGreaterThanOrEqual(0.9);
  });

  it("repeats the verse and chorus on every screen", () => {
    const sentence = (
      pattern: ReturnType<typeof composeMusic>,
      name: string,
      from: number,
      to: number,
    ) => {
      const section = pattern.sections.find((entry) => entry.name === name)!;
      return pattern.notes.melody
        .filter((note) => {
          const local = Math.floor(note.step / STEPS_PER_BAR) - section.startBar;
          return local >= from && local < to;
        })
        .sort((left, right) => left.step - right.step)
        .map((note) => {
          const local = Math.floor(note.step / STEPS_PER_BAR) - section.startBar;
          return `${local % 8}:${note.step % STEPS_PER_BAR}:${note.midi}`;
        });
    };
    for (const cue of ["menu", "briefing", "victory", "defeat"] as const) {
      for (const seed of [0, 21, 421]) {
        const pattern = composeMusic(seed, cue);
        expect(sentence(pattern, "groove", 0, 8).length).toBeGreaterThan(0);
        expect(sentence(pattern, "groove", 8, 16)).toEqual(sentence(pattern, "groove", 0, 8));
        expect(sentence(pattern, "hook", 8, 16)).toEqual(sentence(pattern, "hook", 0, 8));
        expect(sentence(pattern, "turnaround", 0, 8)).toEqual(sentence(pattern, "hook", 0, 8));
      }
    }
  });

  it("tracks the music enable flag without requiring an audio device", () => {
    setMusicEnabled(false);
    expect(isMusicEnabled()).toBe(false);
    setMusicEnabled(true);
    expect(isMusicEnabled()).toBe(true);
  });
});
