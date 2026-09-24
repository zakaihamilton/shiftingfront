export const APP_NAME = "Shifting Front";
export const APP_SHORT_NAME = "Shifting Front";
export const APP_DESCRIPTION = "A seeded isometric RTS — one 4-digit code writes the war.";
export const APP_THEME_COLOR = "#05080e";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://www.shiftingfront.com");
export const APP_VERSION = "1.1.3";
export const APP_REPO_URL = "https://github.com/zakaihamilton/shiftingfront";
export const APP_ISSUES_URL = "https://github.com/zakaihamilton/shiftingfront/issues";

/** `/_vercel/insights` only exists on Vercel. Local `next start` (including Playwright) 404s it. */
export function shouldLoadVercelAnalytics(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.VERCEL === "1";
}

const theme = Number.parseInt(APP_THEME_COLOR.slice(1), 16);

export const APP_THEME_RGB = {
  r: (theme >> 16) & 255,
  g: (theme >> 8) & 255,
  b: theme & 255,
  alpha: 1,
} as const;
