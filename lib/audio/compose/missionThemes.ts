import type { MissionKind } from "../../types";

export type MissionMotifPalette = {
  verseContours: readonly (readonly (number | null)[])[];
  verseRhythms: readonly number[][];
  hookContours: readonly (readonly (number | null)[])[];
  hookRhythms: readonly number[][];
};

const ECONOMY: MissionMotifPalette = {
  verseContours: [
    [0, 2, 4, 3, 2, 4, 0],
    [0, 2, 3, 5, 4, 2, 0],
    [2, 0, 2, 4, 5, 3, 0],
  ],
  verseRhythms: [[0, 3, 6, 8, 11, 13, 15], [0, 4, 7, 9, 12, 14, 15]],
  hookContours: [[0, 2, 4, 5, 4, 2, 0], [0, 2, 3, 5, 4, 2, 0]],
  hookRhythms: [[0, 3, 6, 8, 11, 13, 15], [0, 4, 7, 9, 12, 14, 15]],
};

const MOBILIZATION: MissionMotifPalette = {
  verseContours: [[0, 0, 3, 4, 2, 4, 0], [0, 2, 4, 2, 5, 4, 0], [2, 0, 4, 5, 3, 2, 0]],
  verseRhythms: [[0, 2, 4, 7, 8, 11, 14], [0, 2, 5, 8, 10, 12, 15]],
  hookContours: [[0, 2, 4, 5, 4, 2, 0], [0, 3, 4, 5, 4, 2, 0]],
  hookRhythms: [[0, 2, 5, 8, 10, 13, 15], [0, 3, 6, 8, 11, 14, 15]],
};

const DEFENSE: MissionMotifPalette = {
  verseContours: [[4, 3, 2, 0, 1, 2, 0], [0, 1, 3, 2, 1, 4, 0], [2, 1, 0, 2, 4, 2, 0]],
  verseRhythms: [[0, 4, 7, 9, 12, 14, 15], [0, 3, 7, 8, 12, 14, 15]],
  hookContours: [[4, 3, 2, 0, 2, 1, 0], [0, 2, 4, 3, 2, 1, 0]],
  hookRhythms: [[0, 4, 8, 10, 12, 14, 15], [0, 3, 7, 9, 12, 14, 15]],
};

const COVERT: MissionMotifPalette = {
  verseContours: [[0, null, 3, 4, 2, null, 5], [0, 3, null, 5, 2, 4, 0], [2, null, 4, 5, 3, 1, 0]],
  verseRhythms: [[0, 3, 6, 9, 11, 13, 15], [0, 2, 5, 8, 11, 12, 15]],
  hookContours: [[0, 3, 5, 2, 4, 3, 0], [0, 2, 5, 3, 4, 2, 0]],
  hookRhythms: [[0, 3, 6, 9, 11, 13, 15], [0, 2, 6, 9, 12, 14, 15]],
};

const ASSAULT: MissionMotifPalette = {
  verseContours: [[0, 4, 3, 5, 2, 4, 0], [0, 3, 5, 4, 2, 5, 0], [2, 4, 5, 3, 4, 2, 0]],
  verseRhythms: [[0, 2, 4, 6, 9, 11, 14], [0, 3, 5, 7, 10, 12, 15]],
  hookContours: [[0, 4, 5, 2, 4, 2, 0], [0, 3, 5, 4, 2, 4, 0]],
  hookRhythms: [[0, 2, 5, 7, 10, 12, 15], [0, 3, 6, 8, 11, 13, 15]],
};

const OPERATION: MissionMotifPalette = {
  verseContours: [[0, 2, 4, 5, 3, 2, 0], [0, 2, 5, 4, 3, 4, 0], [2, 4, 5, 4, 2, 1, 0]],
  verseRhythms: [[0, 3, 6, 8, 11, 13, 15], [0, 4, 7, 9, 12, 14, 15]],
  hookContours: [[0, 2, 4, 5, 4, 3, 0], [0, 2, 5, 4, 3, 2, 0]],
  hookRhythms: [[0, 3, 6, 8, 11, 14, 15], [0, 4, 7, 10, 12, 14, 15]],
};

const STRUCTURE: MissionMotifPalette = {
  verseContours: [[4, 2, 3, 1, 2, 0, 1], [0, 1, 3, 2, 4, 1, 0], [2, 0, 1, 3, 2, 4, 0]],
  verseRhythms: [[0, 4, 7, 9, 12, 14, 15], [0, 2, 5, 8, 11, 13, 15]],
  hookContours: [[0, 1, 3, 2, 4, 2, 0], [4, 2, 1, 3, 2, 1, 0]],
  hookRhythms: [[0, 4, 7, 10, 12, 14, 15], [0, 3, 6, 9, 11, 13, 15]],
};

const TARGET: MissionMotifPalette = {
  verseContours: [[0, null, 4, 2, null, 5, 0], [0, 2, null, 4, 3, null, 5], [2, null, 5, 3, 4, 1, 0]],
  verseRhythms: [[0, 2, 6, 8, 11, 13, 15], [0, 3, 5, 9, 10, 14, 15]],
  hookContours: [[0, 4, 2, 5, 3, 4, 0], [2, 5, 3, 0, 4, 2, 0]],
  hookRhythms: [[0, 2, 6, 9, 11, 13, 15], [0, 3, 7, 8, 12, 14, 15]],
};

const ANNIHILATION: MissionMotifPalette = {
  verseContours: [[0, 3, 5, 2, 4, 1, 0], [4, 5, 2, 3, 1, 4, 0], [2, 5, 3, 4, 1, 2, 0]],
  verseRhythms: [[0, 1, 4, 6, 9, 12, 14], [0, 2, 5, 7, 10, 12, 15]],
  hookContours: [[0, 5, 3, 4, 1, 2, 0], [2, 5, 4, 2, 3, 1, 0]],
  hookRhythms: [[0, 1, 4, 7, 9, 12, 15], [0, 2, 5, 8, 10, 13, 15]],
};

const DECAPITATION: MissionMotifPalette = {
  verseContours: [[5, 3, 4, 1, 2, 0, 1], [4, 2, 5, 3, 1, 2, 0], [5, 2, 4, 1, 3, 0, 2]],
  verseRhythms: [[0, 3, 6, 8, 10, 13, 15], [0, 2, 5, 9, 11, 12, 15]],
  hookContours: [[5, 3, 1, 4, 2, 0, 1], [4, 1, 3, 5, 2, 0, 2]],
  hookRhythms: [[0, 3, 6, 9, 11, 13, 15], [0, 2, 5, 8, 12, 14, 15]],
};

const RESCUE: MissionMotifPalette = {
  verseContours: [[0, 1, 3, 5, 4, 2, 0], [2, 1, 4, 5, 3, 4, 0], [0, 2, 1, 4, 5, 3, 0]],
  verseRhythms: [[0, 4, 6, 8, 11, 13, 15], [0, 3, 6, 9, 10, 13, 15]],
  hookContours: [[0, 2, 4, 5, 3, 4, 0], [2, 1, 4, 5, 4, 2, 0]],
  hookRhythms: [[0, 4, 6, 8, 11, 14, 15], [0, 3, 6, 9, 12, 14, 15]],
};

const EXTRACTION: MissionMotifPalette = {
  verseContours: [[5, 4, 2, 3, 1, 2, 0], [3, 5, 2, 4, 1, 3, 0], [4, 2, 5, 3, 1, 2, 0]],
  verseRhythms: [[0, 2, 5, 7, 10, 12, 15], [0, 3, 6, 8, 11, 13, 15]],
  hookContours: [[5, 3, 4, 2, 1, 3, 0], [4, 2, 5, 3, 2, 1, 0]],
  hookRhythms: [[0, 2, 5, 8, 10, 12, 15], [0, 3, 6, 9, 11, 13, 15]],
};

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
