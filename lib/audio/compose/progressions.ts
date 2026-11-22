import type { BassHit, MusicSectionName } from "./types";

export const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
export const DORIAN = [0, 2, 3, 5, 7, 9, 10];
export const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];
export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
export const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
export const MINOR_PENTATONIC = [0, 3, 5, 7, 10];
export const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
export const DOUBLE_HARMONIC = [0, 1, 4, 5, 7, 8, 11];
export const BLUES = [0, 3, 5, 6, 7, 10];

export const MINOR_PROGRESSIONS: readonly number[][] = [
  [0, 5, 2, 6, 0, 5, 3, 4],
  [0, 6, 5, 6, 0, 5, 2, 6],
  [0, 3, 5, 4, 2, 6, 0, 4],
  [0, 5, 3, 4, 0, 6, 5, 4],
  [0, 4, 6, 2, 5, 3, 1, 4],
  [0, 2, 4, 6, 3, 5, 2, 0],
  [0, 3, 6, 4, 1, 5, 3, 4],
  [6, 5, 0, 3, 4, 2, 0, 5],
];

export const MAJOR_PROGRESSIONS: readonly number[][] = [
  [0, 4, 5, 3, 0, 4, 5, 4],
  [0, 4, 3, 5, 0, 4, 5, 3],
  [0, 3, 4, 5, 0, 3, 5, 4],
  [5, 3, 0, 4, 0, 4, 5, 3],
  [0, 2, 5, 4, 0, 3, 4, 5],
  [0, 5, 3, 4, 0, 2, 6, 4],
  [2, 5, 0, 4, 3, 0, 5, 4],
  [0, 3, 5, 1, 0, 4, 2, 5],
];

export const MIXOLYDIAN_PROGRESSIONS: readonly number[][] = [
  [0, 6, 3, 0, 0, 6, 3, 4],
  [0, 3, 6, 3, 0, 4, 6, 3],
  [0, 4, 6, 3, 0, 3, 6, 4],
  [0, 6, 5, 3, 0, 6, 3, 4],
  [0, 2, 5, 3, 0, 6, 4, 2],
  [0, 5, 4, 2, 0, 3, 6, 4],
  [2, 6, 0, 4, 3, 5, 0, 6],
  [0, 3, 5, 6, 0, 4, 2, 5],
];

export const PHRYGIAN_PROGRESSIONS: readonly number[][] = [
  [0, 1, 6, 5, 0, 1, 3, 4],
  [0, 6, 1, 0, 3, 1, 6, 5],
  [0, 1, 3, 1, 0, 6, 5, 4],
  [1, 0, 6, 0, 1, 3, 5, 4],
  [0, 3, 1, 6, 0, 5, 1, 4],
  [0, 1, 5, 6, 3, 0, 1, 4],
  [6, 1, 0, 3, 1, 6, 0, 5],
  [0, 5, 1, 6, 0, 1, 3, 4],
];

export const HARMONIC_MINOR_PROGRESSIONS: readonly number[][] = [
  [0, 4, 5, 3, 0, 4, 6, 3],
  [0, 5, 3, 4, 0, 6, 4, 3],
  [0, 3, 6, 4, 1, 5, 3, 4],
  [6, 4, 0, 3, 5, 4, 0, 3],
  [0, 4, 6, 2, 5, 3, 4, 0],
  [0, 6, 4, 5, 0, 3, 4, 6],
  [3, 0, 4, 6, 5, 0, 4, 3],
  [0, 5, 4, 3, 6, 4, 0, 5],
];

export const LYDIAN_PROGRESSIONS: readonly number[][] = [
  [0, 1, 4, 3, 0, 1, 4, 5],
  [0, 4, 1, 5, 0, 3, 4, 1],
  [1, 0, 4, 5, 1, 3, 0, 4],
  [0, 3, 1, 4, 0, 5, 1, 4],
  [0, 1, 5, 4, 2, 0, 4, 3],
  [4, 0, 1, 5, 3, 0, 4, 1],
  [0, 2, 4, 1, 0, 5, 3, 4],
  [1, 4, 0, 5, 1, 0, 3, 4],
];

export const DOUBLE_HARMONIC_PROGRESSIONS: readonly number[][] = [
  [0, 1, 4, 0, 3, 1, 4, 5],
  [0, 4, 1, 0, 5, 1, 3, 4],
  [1, 0, 4, 3, 1, 0, 5, 4],
  [0, 1, 3, 4, 0, 5, 1, 4],
  [0, 5, 1, 4, 0, 1, 3, 4],
  [4, 0, 1, 5, 3, 0, 1, 4],
  [0, 3, 1, 0, 4, 1, 5, 4],
  [1, 4, 0, 3, 1, 5, 0, 4],
];

export const BLUES_PROGRESSIONS: readonly number[][] = [
  [0, 0, 3, 0, 4, 3, 0, 4],
  [0, 3, 0, 4, 0, 3, 4, 0],
  [0, 4, 3, 0, 4, 0, 3, 4],
  [3, 0, 4, 0, 3, 4, 0, 3],
  [0, 3, 4, 3, 0, 4, 3, 0],
  [0, 0, 4, 3, 0, 3, 4, 0],
  [4, 0, 3, 0, 4, 3, 0, 4],
  [0, 4, 0, 3, 0, 4, 3, 4],
];

export const PENTATONIC_PROGRESSIONS: readonly number[][] = [
  [0, 2, 4, 2, 0, 3, 4, 2],
  [0, 3, 2, 4, 0, 2, 3, 4],
  [0, 4, 3, 2, 0, 4, 2, 3],
  [2, 0, 4, 3, 0, 2, 4, 0],
  [0, 2, 3, 4, 2, 0, 4, 3],
  [4, 2, 0, 3, 4, 0, 2, 4],
  [0, 3, 4, 0, 2, 4, 3, 2],
  [0, 4, 2, 0, 3, 2, 4, 0],
];

export const BASS_RIFFS: readonly BassHit[][] = [
  [
    { tone: 0, oct: 0 },
    { tone: 0, oct: 1 },
    { tone: 0, oct: 0 },
    { tone: 0, oct: 1 },
    { tone: 0, oct: 0 },
    { tone: 0, oct: 1 },
    { tone: 2, oct: 0 },
    { tone: 0, oct: 1 },
  ],
  [
    { tone: 0, oct: 0 },
    { tone: 0, oct: 0 },
    { tone: 0, oct: 0 },
    { tone: 2, oct: 0 },
    { tone: 0, oct: 0 },
    { tone: 0, oct: 0 },
    { tone: 0, oct: 1 },
    { tone: 2, oct: 0 },
  ],
  [
    { tone: 0, oct: 0 },
    null,
    { tone: 2, oct: 0 },
    { tone: 0, oct: 0 },
    null,
    { tone: 0, oct: 0 },
    { tone: 2, oct: 0 },
    { tone: 0, oct: 1 },
  ],
  [
    { tone: 0, oct: 0 },
    { tone: 0, oct: 0 },
    { tone: 0, oct: 1 },
    { tone: 0, oct: 0 },
    { tone: 2, oct: 0 },
    { tone: 0, oct: 0 },
    { tone: 0, oct: 1 },
    null,
  ],
  [
    { tone: 0, oct: 0 },
    { tone: 2, oct: 0 },
    { tone: 0, oct: 0 },
    { tone: 0, oct: 1 },
    { tone: 0, oct: 0 },
    { tone: 2, oct: 0 },
    { tone: 1, oct: 0 },
    { tone: 0, oct: 0 },
  ],
  [
    { tone: 0, oct: 0 },
    { tone: 0, oct: 1 },
    null,
    { tone: 3, oct: 0 },
    { tone: 0, oct: 0 },
    { tone: 2, oct: 1 },
    { tone: 0, oct: 0 },
    { tone: 0, oct: 1 },
  ],
  [
    { tone: 0, oct: 0 },
    null,
    { tone: 0, oct: 1 },
    { tone: 2, oct: 0 },
    { tone: 3, oct: 0 },
    null,
    { tone: 0, oct: 1 },
    { tone: 1, oct: 0 },
  ],
  [
    { tone: 0, oct: 0 },
    { tone: 1, oct: 0 },
    { tone: 2, oct: 0 },
    { tone: 0, oct: 1 },
    { tone: 0, oct: 0 },
    { tone: 2, oct: 0 },
    null,
    { tone: 0, oct: 1 },
  ],
  [
    { tone: 0, oct: 0 },
    { tone: 1, oct: 0 },
    { tone: 2, oct: 0 },
    { tone: 3, oct: 0 },
    { tone: 0, oct: 1 },
    { tone: 2, oct: 0 },
    { tone: 1, oct: 0 },
    { tone: 0, oct: 0 },
  ],
  [
    { tone: 0, oct: 0 },
    null,
    { tone: 0, oct: 0 },
    { tone: 4, oct: 0 },
    { tone: 0, oct: 0 },
    { tone: 0, oct: 1 },
    null,
    { tone: 3, oct: 0 },
  ],
];

export const VERSE_CONTOURS: readonly (number | null)[][] = [
  [0, 0, 2, 4, 2, 0, null],
  [0, 2, 3, 2, 0, 2, 4],
  [2, 0, 2, 4, 3, 2, 0],
  [0, 1, 3, 2, 4, 2, 0],
  [0, 2, 0, 4, 2, 3, 0],
  [4, 3, 2, 0, 2, 3, 4],
  [0, null, 3, 2, 4, null, 0],
  [4, 2, 0, 2, 4, 3, 1],
  [0, 1, 4, 3, 1, 0, null],
  [2, 4, 5, 4, 2, 0, 2],
  [0, 3, null, 4, 2, 5, 0],
  [5, 4, 2, 4, 0, 2, null],
  [1, 3, 4, 2, 0, 4, 3],
  [0, 4, null, 2, 5, 3, 0],
  [3, 5, 4, 2, 0, null, 2],
  [2, null, 4, 5, 3, 1, 0],
  [0, 2, 4, null, 5, 4, 2],
];

export const HOOK_CONTOURS: readonly (number | null)[][] = [
  [4, 4, 5, 2, 0],
  [7, 5, 4, 2, 0],
  [4, 6, 4, 0, 2],
  [5, 4, 7, 5, 4],
  [4, 2, 4, 5, 4],
  [2, 4, 7, 5, 4],
  [0, 2, 5, 4, 2],
  [7, 6, 4, 2, 0],
  [4, 5, 4, 2, 7],
  [5, 7, 4, 2, 0],
  [7, 4, 5, 2, 4],
  [4, 7, 5, 4, 2],
  [0, 4, 7, 4, 2],
  [5, 2, 4, 7, 0],
  [7, 5, 2, 4, 0],
];

export const VERSE_RHYTHMS: readonly number[][] = [
  [0, 2, 3, 6, 8, 10, 12],
  [0, 1, 4, 6, 8, 11, 12],
  [0, 2, 4, 7, 8, 10, 13],
  [0, 3, 5, 7, 10, 12, 15],
  [0, 1, 5, 8, 9, 12, 14],
  [0, 2, 6, 7, 11, 13, 15],
  [0, 4, 5, 8, 10, 12, 14],
  [1, 2, 6, 8, 9, 12, 15],
  [0, 3, 4, 8, 11, 12, 14],
  [1, 4, 6, 9, 10, 13, 15],
];

export const HOOK_RHYTHMS: readonly number[][] = [
  [0, 4, 8, 12, 14],
  [0, 3, 8, 12, 14],
  [0, 4, 7, 10, 12],
  [0, 2, 7, 11, 14],
  [0, 3, 6, 10, 15],
  [0, 5, 8, 11, 13],
  [0, 4, 6, 12, 15],
  [0, 2, 8, 10, 13],
];

// Compact figures for a hook that can be remembered after one pass. The
// broader contour pools remain available for development and atmosphere.
export const SIGNATURE_CONTOURS: readonly (number | null)[][] = [
  [0, 2, 4, 2, 0],
  [0, 2, 3, 2, 0],
  [0, 3, 4, 3, 2],
  [0, 2, 4, 5, 4],
  [2, 4, 5, 4, 2],
  [4, 2, 0, 2, 4],
  [0, 2, 4, 2, 4],
  [2, 0, 2, 4, 2],
];

export const SIGNATURE_RHYTHMS: readonly number[][] = [
  [0, 3, 7, 10, 14],
  [0, 4, 8, 11, 14],
  [0, 2, 6, 9, 12],
  [0, 4, 7, 11, 14],
  [1, 4, 8, 10, 14],
];

export const ARP_FIGURES: readonly number[][] = [
  [0, 2, 1, 2, 0, 1, 2, 0],
  [0, 1, 2, 1, 0, 2, 1, 2],
  [0, 2, 0, 2, 1, 2, 0, 1],
  [0, 1, 0, 2, 1, 0, 2, 1],
  [2, 1, 0, 1, 2, 0, 1, 2],
  [0, 2, 3, 2, 0, 1, 2, 0],
  [1, 2, 0, 2, 1, 0, 2, 1],
  [0, 0, 2, 1, 0, 2, 1, 2],
  [0, 3, 1, 2, 0, 2, 3, 1],
  [2, 0, 1, 0, 2, 3, 1, 0],
  [0, 1, 3, 1, 2, 0, 1, 3],
];

export const OPEN_HAT_FIGURES: readonly (readonly number[])[] = [
  [6, 14],
  [6],
  [14, 6],
  [2, 10],
  [6, 10, 14],
  [4, 12],
];

export const SECTION_ORDER: readonly MusicSectionName[] = [
  "intro",
  "groove",
  "hook",
  "development",
  "breakdown",
  "escalation",
  "climax",
  "turnaround",
];
