import type { Viewport } from "next";

export const APP_NAME = "Shifting Front";
export const APP_SHORT_NAME = "Shifting Front";
export const APP_DESCRIPTION = "A seeded top-down RTS — one 4-digit code writes the war.";
export const APP_THEME_COLOR = "#05080e";

export const APP_VIEWPORT: Viewport = {
  themeColor: APP_THEME_COLOR,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://www.shiftingfront.com");
export const APP_VERSION = "1.1.6";
export const APP_REPO_URL = "https://github.com/zakaihamilton/shiftingfront";
export const APP_ISSUES_URL = "https://github.com/zakaihamilton/shiftingfront/issues";

export const VISITORING_SITE_KEY =
  process.env.NEXT_PUBLIC_VISITORING_SITE_KEY || "vk_Zp_7kjAOxdkBW4N3QKeXSc1gIiibCloq";

/** `/_vercel/insights` only exists on Vercel. Local `next start` (including Playwright) 404s it. */
export function shouldLoadVercelAnalytics(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.VERCEL === "1";
}

/** Load on production Vercel deployments or when an environment explicitly configures a public site key. */
export function shouldLoadVisitoring(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (env.NEXT_PUBLIC_DISABLE_ANALYTICS === "1" || env.PLAYWRIGHT_PORT) return false;
  const explicitlyConfigured = Boolean(env.NEXT_PUBLIC_VISITORING_SITE_KEY);
  const productionVercel = env.VERCEL === "1" && env.NODE_ENV === "production";
  return explicitlyConfigured || productionVercel;
}

const theme = Number.parseInt(APP_THEME_COLOR.slice(1), 16);

export const APP_THEME_RGB = {
  r: (theme >> 16) & 255,
  g: (theme >> 8) & 255,
  b: theme & 255,
  alpha: 1,
} as const;
