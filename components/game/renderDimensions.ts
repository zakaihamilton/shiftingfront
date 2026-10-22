export const MIN_RENDER_WIDTH = 1;
export const MIN_RENDER_HEIGHT = 1;
const MAX_TOUCH_RENDER_PIXELS = 1_500_000;
const MAX_DESKTOP_RENDER_PIXELS = 4_000_000;

export function renderDimensions(host: HTMLElement): { width: number; height: number } {
  const width = Math.max(MIN_RENDER_WIDTH, Math.floor(host.clientWidth));
  const height = Math.max(MIN_RENDER_HEIGHT, Math.floor(host.clientHeight));
  return { width, height };
}

export function renderPixelRatio(
  viewport: { width: number; height: number },
  devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio,
  touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0,
  entityCount = 0,
): number {
  const density = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const budget = touch ? MAX_TOUCH_RENDER_PIXELS : MAX_DESKTOP_RENDER_PIXELS;
  // Preserve simulation and input cadence as large armies fill the view.
  // Only raster resolution changes; the camera and hit targets stay fixed.
  // Coarse tiers avoid reallocating every canvas whenever one unit is lost.
  const armyLimit = entityCount > 200 ? 1 : entityCount > 80 ? 1.5 : 2;
  return Math.min(density, armyLimit, touch ? 1.5 : 2, Math.sqrt(budget / Math.max(1, viewport.width * viewport.height)));
}
