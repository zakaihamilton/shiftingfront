export const MIN_RENDER_WIDTH = 1;
export const MIN_RENDER_HEIGHT = 1;
const MAX_TOUCH_RENDER_PIXELS = 1_500_000;

export function renderDimensions(host: HTMLElement): { width: number; height: number } {
  const width = Math.max(MIN_RENDER_WIDTH, Math.floor(host.clientWidth));
  const height = Math.max(MIN_RENDER_HEIGHT, Math.floor(host.clientHeight));
  const isTouchDevice = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  const pixelCount = width * height;
  if (!isTouchDevice || pixelCount <= MAX_TOUCH_RENDER_PIXELS) return { width, height };

  // Keep the canvas and its CSS box at the same aspect ratio while reducing
  // work on high-resolution touch screens.
  const scale = Math.sqrt(MAX_TOUCH_RENDER_PIXELS / pixelCount);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
