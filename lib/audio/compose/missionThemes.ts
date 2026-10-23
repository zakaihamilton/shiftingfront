import type { MissionKind } from "../../types";

export type MotifPhrase = {
  degrees: readonly (number | null)[];
  rhythm: readonly number[];
};

export type MissionMotifPalette = {
  phrases: readonly MotifPhrase[];
  verseContours: readonly (readonly (number | null)[])[];
  verseRhythms: readonly number[][];
  hookContours: readonly (readonly (number | null)[])[];
  hookRhythms: readonly number[][];
};

function palette(rows: readonly (readonly [readonly (number | null)[], readonly number[]])[]): MissionMotifPalette {
  const phrases = rows.map(([degrees, rhythm]) => ({ degrees, rhythm }));
  return {
    phrases,
    verseContours: phrases.map((phrase) => phrase.degrees),
    verseRhythms: phrases.map((phrase) => [...phrase.rhythm]),
    hookContours: phrases.slice(0, 2).map((phrase) => phrase.degrees),
    hookRhythms: phrases.slice(0, 2).map((phrase) => [...phrase.rhythm]),
  };
}

const ECONOMY = palette([
  [[0, 2, 4, 3, 2, 4, 0], [0, 3, 6, 8, 11, 13, 15]],
  [[0, 2, 3, 5, 4, 2, 0], [0, 4, 7, 9, 12, 14, 15]],
  [[2, 0, 2, 4, 5, 3, 0], [0, 2, 5, 8, 10, 12, 15]],
  [[0, 1, 2, 4, 3, 1, 0], [0, 2, 4, 7, 9, 11, 14]],
  [[0, 2, 4, 2, 3, 2, 0], [0, 3, 5, 8, 10, 13, 15]],
  [[1, 2, 4, 5, 3, 2, 0], [0, 4, 6, 8, 11, 13, 15]],
]);

const MOBILIZATION = palette([
  [[0, 0, 3, 4, 2, 4, 0], [0, 2, 4, 7, 8, 11, 14]],
  [[0, 2, 4, 2, 5, 4, 0], [0, 2, 5, 8, 10, 12, 15]],
  [[2, 0, 4, 5, 3, 2, 0], [0, 3, 6, 8, 11, 14, 15]],
  [[0, 2, 3, 4, 5, 3, 0], [0, 1, 4, 7, 10, 12, 15]],
  [[0, 3, 2, 4, 3, 2, 0], [0, 2, 6, 8, 11, 13, 15]],
  [[2, 3, 4, 2, 4, 1, 0], [0, 3, 5, 7, 10, 12, 15]],
]);

const DEFENSE = palette([
  [[4, 3, 2, 0, 1, 2, 0], [0, 4, 7, 9, 12, 14, 15]],
  [[0, 1, 3, 2, 1, 4, 0], [0, 3, 7, 8, 12, 14, 15]],
  [[2, 1, 0, 2, 4, 2, 0], [0, 4, 8, 10, 12, 14, 15]],
  [[3, 2, 1, 0, 2, 1, 0], [0, 3, 6, 9, 11, 13, 15]],
  [[0, 2, 1, 0, 2, 3, 0], [0, 2, 5, 8, 11, 13, 15]],
  [[4, 2, 3, 1, 2, 1, 0], [0, 4, 6, 8, 11, 13, 15]],
]);

const COVERT = palette([
  [[0, null, 3, 4, 2, null, 5], [0, 3, 6, 9, 11, 13, 15]],
  [[0, 3, null, 5, 2, 4, 0], [0, 2, 5, 8, 11, 12, 15]],
  [[2, null, 4, 5, 3, 1, 0], [0, 2, 6, 9, 12, 14, 15]],
  [[0, null, 2, 4, 3, 5, 0], [0, 3, 5, 9, 10, 14, 15]],
  [[0, 2, null, 3, 5, 2, 0], [0, 1, 4, 6, 9, 12, 14]],
  [[3, null, 2, 4, 1, null, 0], [0, 2, 5, 7, 10, 13, 15]],
]);

const ASSAULT = palette([
  [[0, 3, 2, 4, 2, 3, 0], [0, 2, 4, 6, 9, 11, 14]],
  [[0, 2, 4, 3, 2, 4, 0], [0, 3, 5, 7, 10, 12, 15]],
  [[2, 3, 4, 2, 3, 1, 0], [0, 2, 5, 7, 10, 12, 15]],
  [[0, 2, 3, 5, 3, 2, 0], [0, 1, 4, 6, 9, 12, 14]],
  [[0, 3, 4, 2, 4, 2, 0], [0, 2, 6, 8, 11, 13, 15]],
  [[2, 4, 3, 5, 3, 2, 0], [0, 3, 6, 8, 10, 13, 15]],
]);

const OPERATION = palette([
  [[0, 2, 4, 5, 3, 2, 0], [0, 3, 6, 8, 11, 13, 15]],
  [[0, 2, 5, 4, 3, 4, 0], [0, 4, 7, 9, 12, 14, 15]],
  [[2, 4, 5, 4, 2, 1, 0], [0, 3, 6, 8, 11, 14, 15]],
  [[0, 1, 3, 4, 2, 3, 0], [0, 4, 7, 10, 12, 14, 15]],
  [[0, 2, 3, 4, 5, 2, 0], [0, 2, 5, 8, 10, 12, 15]],
  [[1, 2, 4, 3, 5, 2, 0], [0, 2, 6, 9, 11, 14, 15]],
]);

const STRUCTURE = palette([
  [[4, 2, 3, 1, 2, 0, 1], [0, 4, 7, 9, 12, 14, 15]],
  [[0, 1, 3, 2, 4, 1, 0], [0, 2, 5, 8, 11, 13, 15]],
  [[2, 0, 1, 3, 2, 4, 0], [0, 4, 7, 10, 12, 14, 15]],
  [[0, 2, 1, 3, 2, 1, 0], [0, 3, 6, 9, 11, 13, 15]],
  [[3, 1, 2, 0, 2, 1, 0], [0, 4, 6, 8, 11, 13, 15]],
  [[0, 1, 2, 4, 2, 3, 0], [0, 2, 4, 7, 9, 11, 14]],
]);

const TARGET = palette([
  [[0, null, 4, 2, null, 5, 0], [0, 2, 6, 8, 11, 13, 15]],
  [[0, 2, null, 4, 3, null, 5], [0, 3, 5, 9, 10, 14, 15]],
  [[2, null, 5, 3, 4, 1, 0], [0, 2, 6, 9, 11, 13, 15]],
  [[0, 3, null, 2, 4, 2, 0], [0, 3, 7, 8, 12, 14, 15]],
  [[0, null, 2, 5, 3, 4, 0], [0, 1, 4, 7, 10, 12, 15]],
  [[2, 4, null, 3, 5, 2, 0], [0, 2, 5, 9, 11, 12, 15]],
]);

const ANNIHILATION = palette([
  [[0, 3, 5, 2, 4, 1, 0], [0, 1, 4, 6, 9, 12, 14]],
  [[4, 5, 2, 3, 1, 4, 0], [0, 2, 5, 7, 10, 12, 15]],
  [[2, 5, 3, 4, 1, 2, 0], [0, 1, 4, 7, 9, 12, 15]],
  [[0, 2, 5, 3, 4, 2, 0], [0, 2, 5, 8, 10, 13, 15]],
  [[3, 5, 4, 2, 3, 1, 0], [0, 3, 6, 8, 10, 13, 15]],
  [[0, 4, 2, 5, 3, 1, 0], [0, 3, 5, 7, 10, 12, 15]],
]);

const DECAPITATION = palette([
  [[5, 3, 4, 1, 2, 0, 1], [0, 3, 6, 8, 10, 13, 15]],
  [[4, 2, 5, 3, 1, 2, 0], [0, 2, 5, 9, 11, 12, 15]],
  [[5, 2, 4, 1, 3, 0, 2], [0, 3, 6, 9, 11, 13, 15]],
  [[4, 3, 1, 2, 0, 2, 0], [0, 2, 5, 8, 12, 14, 15]],
  [[5, 4, 2, 3, 1, 0, 0], [0, 1, 4, 6, 9, 12, 14]],
  [[3, 5, 2, 4, 1, 2, 0], [0, 2, 6, 8, 11, 13, 15]],
]);

const RESCUE = palette([
  [[0, 1, 3, 5, 4, 2, 0], [0, 4, 6, 8, 11, 13, 15]],
  [[2, 1, 4, 5, 3, 4, 0], [0, 3, 6, 9, 10, 13, 15]],
  [[0, 2, 1, 4, 5, 3, 0], [0, 4, 6, 8, 11, 14, 15]],
  [[0, 2, 4, 3, 5, 2, 0], [0, 3, 6, 9, 12, 14, 15]],
  [[1, 3, 2, 4, 5, 3, 0], [0, 2, 5, 8, 10, 13, 15]],
  [[0, 1, 2, 4, 3, 2, 0], [0, 2, 4, 7, 8, 11, 14]],
]);

const EXTRACTION = palette([
  [[5, 4, 2, 3, 1, 2, 0], [0, 2, 5, 7, 10, 12, 15]],
  [[3, 5, 2, 4, 1, 3, 0], [0, 3, 6, 8, 11, 13, 15]],
  [[4, 2, 5, 3, 1, 2, 0], [0, 2, 5, 8, 10, 12, 15]],
  [[5, 3, 4, 2, 1, 3, 0], [0, 3, 6, 9, 11, 13, 15]],
  [[4, 3, 2, 0, 2, 1, 0], [0, 4, 7, 9, 12, 14, 15]],
  [[2, 4, 3, 1, 2, 0, 0], [0, 2, 6, 9, 11, 14, 15]],
]);

const SIGNATURE_BY_MISSION: Record<MissionKind, MissionMotifPalette> = {
  harvestQuota: ECONOMY,
  forceQuota: MOBILIZATION,
  structureQuota: STRUCTURE,
  holdTheLine: DEFENSE,
  sabotage: COVERT,
  destroyMarked: TARGET,
  razeAll: ASSAULT,
  annihilate: ANNIHILATION,
  decapitate: DECAPITATION,
  escort: OPERATION,
  rescue: RESCUE,
  extraction: EXTRACTION,
};

export function missionMotifPalette(kind: MissionKind | undefined): MissionMotifPalette | undefined {
  return kind ? SIGNATURE_BY_MISSION[kind] : undefined;
}
