export const SHROUD_RGB = { r: 8, g: 13, b: 17 } as const;
export const SHROUD_FILL = `#${[SHROUD_RGB.r, SHROUD_RGB.g, SHROUD_RGB.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
export const TERRAIN_COVER = 1.08;
/** Shroud stamps expand a little more than terrain so rounded corners still overlap. */
export const SHROUD_COVER = 1.16;
/** Corner radius as a fraction of min(stamp width, stamp height). */
export const SHROUD_CORNER_RADIUS_FRAC = 0.45;
export const SHROUD_CORE_COVER = 0.7;
