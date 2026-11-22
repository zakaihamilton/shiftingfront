import { describe, expect, it } from "vitest";
import {
  composeMusic,
  MUSIC_STEPS,
  STEPS_PER_BAR,
  TUTORIAL_MUSIC_MISSION,
} from "../../lib/audio/compose";
import { styleAffinityScore } from "../../lib/audio/compose/missionContext";
import { createCampaign } from "../../lib/gen/campaign";

const CINEMATIC_MISSION_STYLES = new Set([
  "neon-arpeggio",
  "industrial-march",
  "cinematic-tension",
  "signal-chase",
  "chrome-fanfare",
  "low-orbit",
  "foundry-stomp",
  "night-raid",
  "ice-protocol",
  "orbital-drift",
  "glass-chime",
  "dune-cipher",
  "choir-vector",
  "break-wire",
]);

describe("generated audio", () => {
  it("composes the same pattern for the same seed, cue, and mission", () => {
    expect(composeMusic(421, "mission", 3)).toEqual(composeMusic(421, "mission", 3));
    expect(composeMusic(421, "menu")).not.toEqual(composeMusic(421, "mission"));
    expect(composeMusic(1, "mission")).not.toEqual(composeMusic(2, "mission"));

    const cues = ["menu", "briefing", "mission", "victory", "defeat"] as const;
    const scores = cues.map((cue) => composeMusic(421, cue, cue === "mission" ? 3 : 0));
    expect(scores).toEqual(cues.map((cue) => composeMusic(421, cue, cue === "mission" ? 3 : 0)));
    expect(new Set(scores.map((score) => JSON.stringify(score.theme))).size).toBe(cues.length);
  });

  it("adds a deterministic harmony layer and keeps active grooves phrase-stable", () => {
    const pattern = composeMusic(421, "mission", 3);
    expect(pattern.notes.harmony).toEqual(composeMusic(421, "mission", 3).notes.harmony);
    expect(pattern.harmony).toHaveLength(MUSIC_STEPS);
    expect(pattern.notes.harmony.length).toBeGreaterThan(0);

    const sectionCount = (sectionName: string, lane: keyof typeof pattern.notes) => {
      const section = pattern.sections.find((entry) => entry.name === sectionName)!;
      return pattern.notes[lane].filter(
        (note) =>
          note.step >= section.startBar * STEPS_PER_BAR &&
          note.step < section.endBar * STEPS_PER_BAR,
      ).length;
    };
    expect(sectionCount("intro", "harmony")).toBe(0);
    expect(sectionCount("breakdown", "harmony")).toBe(0);
    for (const section of ["groove", "hook", "development", "escalation", "climax", "turnaround"]) {
      expect(sectionCount(section, "harmony")).toBeGreaterThan(0);
    }

    for (const section of pattern.sections.filter(
      ({ name }) => !["intro", "breakdown"].includes(name),
    )) {
      const barsWithKick = Array.from(
        { length: section.endBar - section.startBar },
        (_, offset) => {
          const start = (section.startBar + offset) * STEPS_PER_BAR;
          return pattern.drums.some(
            (event) =>
              event.kind === "kick" && event.step >= start && event.step < start + STEPS_PER_BAR,
          );
        },
      ).filter(Boolean).length;
      expect(barsWithKick).toBeGreaterThanOrEqual(14);

      const kickMask = (bar: number) =>
        pattern.kick.slice(bar * STEPS_PER_BAR, (bar + 1) * STEPS_PER_BAR);
      let backbone: boolean[] | null = null;
      for (let offset = 0; offset < section.endBar - section.startBar; offset += 1) {
        const bar = section.startBar + offset;
        const phraseBar = offset % 8;
        const hole =
          pattern.style.arrangement.holdBass[pattern.sections.indexOf(section)] && offset < 8;
        const mask = kickMask(bar);
        if (!mask.some(Boolean)) {
          if (!hole) expect([2, 6]).toContain(phraseBar);
          continue;
        }
        if (phraseBar === 7 || hole) continue;
        backbone ??= mask;
        expect(mask).toEqual(backbone);
      }
    }

    for (const event of pattern.drums.filter(({ kind }) => kind === "tom")) {
      const bar = Math.floor(event.step / STEPS_PER_BAR);
      const section = pattern.sections.find(
        ({ startBar, endBar }) => bar >= startBar && bar < endBar,
      )!;
      expect([3, 7]).toContain((bar - section.startBar) % 8);
    }

    for (const section of pattern.sections) {
      expect(sectionCount(section.name, "counter")).toBeLessThanOrEqual(48);
    }
  });

  it("varies the arrangement across missions of the same seed", () => {
    expect(composeMusic(421, "mission", 0)).not.toEqual(composeMusic(421, "mission", 1));
    expect(composeMusic(421, "mission", 0)).not.toEqual(composeMusic(421, "mission", 7));
    expect(composeMusic(421, "mission", 0)).not.toEqual(
      composeMusic(421, "mission", TUTORIAL_MUSIC_MISSION),
    );
  });

  it("keeps mission scores in a cinematic palette with distinct seeded identities", () => {
    const corpus = Array.from({ length: 48 }, (_, seed) =>
      Array.from({ length: 8 }, (__, mission) => composeMusic(seed, "mission", mission)),
    ).flat();
    expect(corpus.every((pattern) => CINEMATIC_MISSION_STYLES.has(pattern.style.name))).toBe(true);
    expect(new Set(corpus.map((pattern) => pattern.style.name)).size).toBeGreaterThanOrEqual(10);
    expect(corpus.some((pattern) => pattern.theme.groove === "shuffle")).toBe(true);
    expect(corpus.some((pattern) => pattern.theme.groove === "half-time")).toBe(true);
    expect(corpus.some((pattern) => pattern.theme.groove === "breakbeat")).toBe(true);
    expect(corpus.some((pattern) => pattern.theme.groove === "march")).toBe(true);
    expect(corpus.some((pattern) => pattern.scaleName === "phrygian")).toBe(true);
    expect(
      corpus.some(
        (pattern) =>
          pattern.scaleName === "harmonic minor" || pattern.scaleName === "minor pentatonic",
      ),
    ).toBe(true);
    expect(
      corpus.some(
        (pattern) => pattern.scaleName === "lydian" || pattern.scaleName === "double harmonic",
      ),
    ).toBe(true);
    expect(corpus.every((pattern) => pattern.style.voiceEngine === "cinematic")).toBe(true);
    expect(corpus.some((pattern) => pattern.style.drumKit === "industrial")).toBe(true);
    expect(
      corpus.some((pattern) =>
        pattern.drums.some((event) => event.kind === "rim" || event.kind === "shaker"),
      ),
    ).toBe(true);
    expect(new Set(corpus.map((pattern) => pattern.style.voiceEngine))).toEqual(
      new Set(["cinematic"]),
    );

    const missions = Array.from({ length: 6 }, (_, mission) =>
      composeMusic(421, "mission", mission),
    );
    expect(new Set(missions.map((pattern) => pattern.style.name)).size).toBe(6);
    expect(new Set(missions.map((pattern) => JSON.stringify(pattern.theme.motif))).size).toBe(6);
    expect(new Set(missions.map((pattern) => pattern.style.arrangement.name)).size).toBe(6);
    const campaign = Array.from({ length: 12 }, (_, mission) =>
      composeMusic(421, "mission", mission),
    );
    expect(new Set(campaign.map((pattern) => pattern.style.arrangement.name)).size).toBe(12);
    expect(
      campaign.some((pattern, index) =>
        campaign.some(
          (other, otherIndex) =>
            index !== otherIndex &&
            JSON.stringify(pattern.style.arrangement.melodyEnabled) !==
              JSON.stringify(other.style.arrangement.melodyEnabled),
        ),
      ),
    ).toBe(true);
    expect(
      campaign.some((pattern, index) =>
        campaign.some(
          (other, otherIndex) =>
            index !== otherIndex &&
            JSON.stringify(pattern.style.arrangement.counterEnabled) !==
              JSON.stringify(other.style.arrangement.counterEnabled),
        ),
      ),
    ).toBe(true);
    const fingerprints = missions.map((pattern) =>
      JSON.stringify({
        style: pattern.style,
        bpm: pattern.bpm,
        rootMidi: pattern.rootMidi,
        scaleName: pattern.scaleName,
        progression: pattern.theme.progressionA,
        motif: pattern.motif,
        hook: pattern.theme.hook,
        drums: pattern.drums,
      }),
    );
    expect(new Set(fingerprints).size).toBe(missions.length);
    expect(missions.every((pattern) => pattern.arpType === pattern.style.pulseType)).toBe(true);
    expect(missions.every((pattern) => pattern.melodyType === pattern.style.melodyType)).toBe(true);
  });

  it("keeps every cue in the cinematic palette with restrained pulse patterns", () => {
    const cues = ["menu", "briefing", "mission", "victory", "defeat"] as const;
    const voiceTypes = (pattern: ReturnType<typeof composeMusic>) => [
      pattern.style.bassType,
      pattern.style.pulseType,
      pattern.style.melodyType,
      pattern.style.counterType,
      pattern.style.padType,
    ];
    for (const cue of cues) {
      for (let seed = 0; seed < 48; seed++) {
        const pattern = composeMusic(seed, cue, cue === "mission" ? seed % 8 : 0);
        expect(pattern.style.voiceEngine).toBe("cinematic");
        expect(pattern.style.drumKit).not.toBe("chip-noise");
        expect(voiceTypes(pattern)).not.toContain("square");
        expect(pattern.style.saturationAmount).toBeLessThanOrEqual(0.1);
        expect(pattern.style.reverbWet).toBeLessThanOrEqual(cue === "mission" ? 0.18 : 0.22);
        expect(pattern.style.delayWet).toBeLessThanOrEqual(cue === "mission" ? 0.18 : 0.22);
        const low = cue === "mission" ? 36 : 0;
        expect(pattern.notes.melody.every((note) => note.midi >= low && note.midi <= 127)).toBe(
          true,
        );
        for (let bar = 0; bar < pattern.bars; bar++) {
          const start = bar * STEPS_PER_BAR;
          const pulses = pattern.notes.pulse
            .filter((note) => note.step >= start && note.step < start + STEPS_PER_BAR)
            .sort((a, b) => a.step - b.step);
          expect(pulses.length).toBeLessThanOrEqual(4);
          for (let index = 1; index < pulses.length; index++) {
            expect(pulses[index]!.step - pulses[index - 1]!.step).toBeGreaterThanOrEqual(4);
          }
        }
      }
    }
  });

  it("gives cinematic phrases a call-and-response hook and seeded drum dynamics", () => {
    const cinematic = Array.from({ length: 48 }, (_, seed) =>
      composeMusic(seed, "mission", seed % 8),
    ).filter((pattern) => pattern.style.voiceEngine === "cinematic");
    expect(cinematic.length).toBeGreaterThan(0);

    for (const pattern of cinematic) {
      expect(pattern.theme.motif.degrees).not.toEqual(pattern.theme.motif.response);
      expect(pattern.theme.developmentMotif.degrees).not.toEqual(pattern.theme.motif.degrees);
      expect(pattern.theme.developmentMotif.rhythm).toEqual(pattern.theme.motif.rhythm);
      expect(pattern.theme.hook.degrees.length).toBe(pattern.theme.motif.degrees.length);
      expect(pattern.theme.hook.rhythm).toEqual(pattern.theme.motif.rhythm);
      expect(pattern.theme.hook).not.toEqual(pattern.theme.motif);
      expect(pattern.drums.every((event) => event.velocity > 0 && event.velocity <= 1)).toBe(true);
      expect(new Set(pattern.drums.map((event) => event.velocity)).size).toBeGreaterThan(8);

      for (let bar = 7; bar < pattern.bars; bar += 8) {
        const start = bar * STEPS_PER_BAR;
        const fillHits = pattern.drums.filter(
          (event) =>
            event.step >= start + 8 &&
            event.step < start + STEPS_PER_BAR &&
            (event.kind === "kick" ||
              event.kind === "snare" ||
              event.kind === "tom" ||
              event.kind === "impact"),
        );
        expect(fillHits.length).toBeLessThanOrEqual(14);
      }
    }
  });

  it("ties mission scores to campaign biome and objective", () => {
    for (const seed of [0, 21, 421, 1994, 7777]) {
      const campaign = createCampaign(seed);
      for (const mission of campaign.missions) {
        const pattern = composeMusic(seed, "mission", mission.index);
        expect(pattern.biome).toBe(mission.biome);
        expect(pattern.missionKind).toBe(mission.kind);
      }
    }

    const volcanicFamilies = ["foundry-stomp", "night-raid"];
    const tundraFamilies = ["ice-protocol", "low-orbit", "cinematic-tension"];
    for (let seed = 0; seed < 48; seed++) {
      const biome = createCampaign(seed).world.biome;
      if (biome === "volcanic shelf") {
        expect(volcanicFamilies).toContain(composeMusic(seed, "mission", 0).style.name);
      }
      if (biome === "tundra grid") {
        expect(tundraFamilies).toContain(composeMusic(seed, "mission", 0).style.name);
      }
      for (let missionIndex = 0; missionIndex < 6; missionIndex++) {
        const pattern = composeMusic(seed, "mission", missionIndex);
        expect(
          styleAffinityScore(pattern.style.name, {
            biome: pattern.biome,
            missionKind: pattern.missionKind,
          }),
        ).toBeGreaterThan(0);
      }
    }

    for (const seed of [0, 21, 421, 1994, 7777]) {
      const campaign = createCampaign(seed);
      for (const mission of campaign.missions) {
        const pattern = composeMusic(seed, "mission", mission.index);
        expect(
          styleAffinityScore(pattern.style.name, {
            biome: mission.biome,
            missionKind: mission.kind,
          }),
        ).toBeGreaterThan(0);
      }
    }

    const assault: number[] = [];
    const harvest: number[] = [];
    for (let seed = 0; seed < 36; seed++) {
      const campaign = createCampaign(seed);
      for (const mission of campaign.missions) {
        const density = composeMusic(seed, "mission", mission.index).style.drumDensity;
        if (
          mission.kind === "razeAll" ||
          mission.kind === "annihilate" ||
          mission.kind === "decapitate"
        ) {
          assault.push(density);
        }
        if (mission.kind === "harvestQuota") harvest.push(density);
      }
    }
    const average = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    expect(assault.length).toBeGreaterThan(0);
    expect(harvest.length).toBeGreaterThan(0);
    expect(average(assault)).toBeGreaterThan(average(harvest));
  });
});
