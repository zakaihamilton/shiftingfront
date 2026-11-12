import type { Rng } from "../../seed/rng";
import { drumEvent, grooveHits, mixEnergy, placePhraseFill } from "./helpers";
import { placeStylePercussion } from "./stems";
import type { MusicCue, MusicDrumEvent, MusicSection, MusicStyleProfile } from "./types";
import { MUSIC_BARS, STEPS_PER_BAR } from "./types";

interface ComposeBarDrumsInput {
  bar: number;
  cycle: number;
  origin: number;
  phraseBar: number;
  sectionIndex: number;
  section: MusicSection;
  cue: MusicCue;
  sparse: boolean;
  hole: boolean;
  chorusReturn: boolean;
  climax: boolean;
  intro: boolean;
  hookSection: boolean;
  dropHats: boolean;
  clearBreakdown: boolean;
  fullDrums: boolean;
  lightDrums: boolean;
  fill: boolean;
  miniFill: boolean;
  energy: number;
  groove: MusicStyleProfile["groove"];
  style: MusicStyleProfile;
  arrangement: MusicStyleProfile["arrangement"];
  openHatSteps: readonly number[];
  drums: MusicDrumEvent[];
  drumRng: Rng;
}

/** Add the per-bar drum groove, section impact, and phrase fills. */
export function composeBarDrums({
  bar,
  cycle,
  origin,
  phraseBar,
  sectionIndex,
  section,
  cue,
  sparse,
  hole,
  chorusReturn,
  climax,
  intro,
  hookSection,
  dropHats,
  clearBreakdown,
  fullDrums,
  lightDrums,
  fill,
  miniFill,
  energy,
  groove,
  style,
  arrangement,
  openHatSteps,
  drums,
  drumRng,
}: ComposeBarDrumsInput): void {
  if (fullDrums || lightDrums) {
    const grooveVariant = ((chorusReturn
      ? style.grooveVariant
      : bar >= MUSIC_BARS / 2
        ? style.grooveVariant + 1
        : style.grooveVariant) % 3) as 0 | 1 | 2;
    const hits = grooveHits(groove, (cycle % 2) as 0 | 1, grooveVariant);
    const density = Math.min(1, style.drumDensity * arrangement.drumDensity[sectionIndex]!);
    const drumScale = intro ? 0.7 : hookSection ? 1.08 : section.name === "escalation" ? 1.02 : 1;
    const drumGain = Math.min(
      0.9,
      mixEnergy(fullDrums ? 0.82 + density * 0.18 : 0.54 + density * 0.12, energy) *
        (cue === "mission" ? 0.78 : 1) *
        drumScale,
    );
    for (const step of hits.kick) {
      drumEvent(
        drums,
        origin + step,
        "kick",
        (step === 0 ? 0.95 : 0.72) * drumGain,
        step === 0,
        drumRng,
      );
    }
    for (const step of hits.snare) {
      const accent = step === 4 || step === 12;
      drumEvent(drums, origin + step, "snare", (accent ? 0.9 : 0.62) * drumGain, accent, drumRng);
      if (!sparse && !hole && accent && chorusReturn && phraseBar % 4 === 0) {
        drumEvent(drums, origin + step, "clap", 0.28 * drumGain, true, drumRng);
      }
    }
    const hatSource = arrangement.hatStride[chorusReturn ? 2 : sectionIndex]!;
    const requestedHatStride = sparse
      ? Math.max(2, dropHats ? 4 : hatSource)
      : chorusReturn
        ? Math.max(2, hatSource)
        : climax
          ? 2
          : dropHats
            ? 4
            : hatSource;
    const hatStride = cue === "mission" ? Math.max(2, requestedHatStride) : requestedHatStride;
    for (let step = 0; step < STEPS_PER_BAR; step += hatStride) {
      const offbeat = climax ? step % 2 === 1 : step % 4 === 2;
      drumEvent(
        drums,
        origin + step,
        "hat",
        (offbeat ? 0.36 : 0.26) * drumGain * (cue === "mission" ? 0.72 : 1),
        false,
        drumRng,
      );
    }
    if (!sparse && !hole && !dropHats) {
      const openHatHits = cue === "mission" ? openHatSteps.slice(0, 1) : openHatSteps;
      if (cue !== "mission" || bar % 2 === 1) {
        for (const step of openHatHits) {
          drumEvent(
            drums,
            origin + step,
            "openHat",
            0.44 * drumGain * (cue === "mission" ? 0.58 : 1),
            false,
            drumRng,
          );
        }
      }
    }
    if (!sparse) placeStylePercussion(drums, origin, style.name, drumGain, dropHats, drumRng);
  }

  if ((chorusReturn || section.name === "escalation") && phraseBar === 0) {
    drumEvent(
      drums,
      origin,
      "impact",
      mixEnergy(climax ? 0.9 : section.name === "hook" ? 0.46 : 0.62, energy),
      true,
      drumRng,
    );
  }

  const chorusFill = chorusReturn && bar !== MUSIC_BARS - 1;
  const fillStyle = arrangement.fillStyle[chorusFill ? 2 : sectionIndex]!;
  if (miniFill && !clearBreakdown) {
    placePhraseFill(drums, origin, fillStyle, {
      sparse,
      finalBar: false,
      mini: true,
      rng: drumRng,
    });
  }

  if (fill && clearBreakdown) {
    drumEvent(drums, origin + 12, "snare", mixEnergy(0.42, energy), true, drumRng);
  } else if (fill) {
    placePhraseFill(drums, origin, fillStyle, {
      sparse: sparse || (hole && cue !== "victory"),
      finalBar: bar === MUSIC_BARS - 1,
      mini: false,
      rng: drumRng,
    });
  }
}
