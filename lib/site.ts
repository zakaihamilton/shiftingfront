export const APP_NAME = "Shifting Front";
export const APP_SHORT_NAME = "Shifting Front";
export const APP_DESCRIPTION = "A seeded isometric RTS — one 4-digit code writes the war.";
export const APP_THEME_COLOR = "#05080e";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://www.shiftingfront.com");
export const APP_VERSION = "1.0.0";
export const APP_REPO_URL = "https://github.com/zakaihamilton/shiftingfront";
export const APP_ISSUES_URL = "https://github.com/zakaihamilton/shiftingfront/issues";

const theme = Number.parseInt(APP_THEME_COLOR.slice(1), 16);

export const APP_THEME_RGB = {
  r: (theme >> 16) & 255,
  g: (theme >> 8) & 255,
  b: theme & 255,
  alpha: 1,
} as const;
