import { lumaBuffer, lumaSad, lumaSadSubpixel } from "./luma";
import { detectPortraitMouthClip } from "./mouthDetection";
import type { PortraitClip, PortraitOffset, PortraitSearchWindow } from "./types";
import {
  PORTRAIT_DRIFT_THRESHOLD,
  PORTRAIT_EYE_CLIPS,
  PORTRAIT_MOUTH_CLIP,
  PORTRAIT_OFFSET_NONE,
} from "./types";

export function portraitClipWindow(
  clips: readonly PortraitClip[],
  width: number,
  height: number,
  pad = 8,
): PortraitSearchWindow {
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  for (const clip of clips) {
    x0 = Math.min(x0, width * (clip.cx - clip.rx));
    y0 = Math.min(y0, height * (clip.cy - clip.ry));
    x1 = Math.max(x1, width * (clip.cx + clip.rx));
    y1 = Math.max(y1, height * (clip.cy + clip.ry));
  }
  return {
    x0: Math.max(0, Math.floor(x0) - pad),
    y0: Math.max(0, Math.floor(y0) - pad),
    x1: Math.min(width, Math.ceil(x1) + pad),
    y1: Math.min(height, Math.ceil(y1) + pad),
  };
}

export function scalePortraitOffset(
  offset: PortraitOffset,
  fromWidth: number,
  toWidth: number,
): PortraitOffset {
  if (fromWidth <= 0 || fromWidth === toWidth) return offset;
  const scale = toWidth / fromWidth;
  return { dx: offset.dx * scale, dy: offset.dy * scale };
}

export function portraitRegistrationWindow(width: number, height: number): PortraitSearchWindow {
  return {
    x0: Math.floor(width * 0.12),
    y0: Math.floor(height * 0.08),
    x1: Math.ceil(width * 0.88),
    y1: Math.ceil(height * 0.9),
  };
}

export function portraitHasDrift(
  offset: PortraitOffset,
  threshold = PORTRAIT_DRIFT_THRESHOLD,
): boolean {
  return Math.abs(offset.dx) >= threshold || Math.abs(offset.dy) >= threshold;
}

export function choosePortraitMouthClip(
  detected: PortraitClip,
  fallback = PORTRAIT_MOUTH_CLIP,
): PortraitClip {
  if (detected.cy < 0.56 || detected.cy > 0.7 || Math.abs(detected.cx - fallback.cx) > 0.1) {
    return fallback;
  }
  const minCy = 0.52 + fallback.ry;
  return { ...fallback, cx: detected.cx, cy: Math.max(detected.cy, minCy) };
}

export function resolvePortraitAnimation(
  idleRgba: ArrayLike<number>,
  blinkRgba: ArrayLike<number> | null,
  talkRgba: ArrayLike<number> | null,
  width: number,
  height: number,
): { blink: PortraitOffset; talk: PortraitOffset; mouthClip: PortraitClip } {
  const faceWindow = portraitRegistrationWindow(width, height);
  const blinkDrift = blinkRgba
    ? measurePortraitOffset(idleRgba, blinkRgba, width, height, 16, faceWindow)
    : PORTRAIT_OFFSET_NONE;
  const talkDrift = talkRgba
    ? measurePortraitOffset(idleRgba, talkRgba, width, height, 16, faceWindow)
    : PORTRAIT_OFFSET_NONE;
  const mouthClip = choosePortraitMouthClip(
    detectPortraitMouthClip(idleRgba, width, height, talkRgba),
  );

  if (!portraitHasDrift(blinkDrift) && !portraitHasDrift(talkDrift)) {
    return { blink: PORTRAIT_OFFSET_NONE, talk: PORTRAIT_OFFSET_NONE, mouthClip };
  }

  const eyeWindow = portraitClipWindow(PORTRAIT_EYE_CLIPS, width, height);
  return {
    blink: blinkRgba
      ? refinePortraitOffset(
          idleRgba,
          blinkRgba,
          width,
          height,
          measurePortraitOffset(idleRgba, blinkRgba, width, height, 16, eyeWindow),
          eyeWindow,
        )
      : PORTRAIT_OFFSET_NONE,
    talk: {
      dx: Math.max(-2, Math.min(2, talkDrift.dx)),
      dy: Math.max(-3, Math.min(0.5, talkDrift.dy)),
    },
    mouthClip,
  };
}

/**
 * Resolve only the blink registration used by the live portrait renderer.
 * Mouth registration is asset metadata because viseme pixels are too noisy
 * to use as a runtime landmark.
 */
export function resolvePortraitBlinkAlignment(
  idleRgba: ArrayLike<number>,
  blinkRgba: ArrayLike<number> | null,
  width: number,
  height: number,
): PortraitOffset {
  if (!blinkRgba) return PORTRAIT_OFFSET_NONE;
  const faceWindow = portraitRegistrationWindow(width, height);
  const blinkDrift = measurePortraitOffset(idleRgba, blinkRgba, width, height, 16, faceWindow);
  if (!portraitHasDrift(blinkDrift)) return PORTRAIT_OFFSET_NONE;
  const eyeWindow = portraitClipWindow(PORTRAIT_EYE_CLIPS, width, height);
  return refinePortraitOffset(
    idleRgba,
    blinkRgba,
    width,
    height,
    measurePortraitOffset(idleRgba, blinkRgba, width, height, 16, eyeWindow),
    eyeWindow,
  );
}

export function refinePortraitOffset(
  idleRgba: ArrayLike<number>,
  otherRgba: ArrayLike<number>,
  width: number,
  height: number,
  coarse: PortraitOffset,
  window?: PortraitSearchWindow,
  step = 0.25,
): PortraitOffset {
  const idle = lumaBuffer(idleRgba, width, height);
  const other = lumaBuffer(otherRgba, width, height);
  let best = coarse;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let iy = -4; iy <= 4; iy += 1) {
    for (let ix = -4; ix <= 4; ix += 1) {
      const dx = coarse.dx + ix * step;
      const dy = coarse.dy + iy * step;
      const score = lumaSadSubpixel(idle, other, width, height, dx, dy, window);
      if (score < bestScore) {
        bestScore = score;
        best = { dx, dy };
      }
    }
  }
  return best;
}

export function measurePortraitOffset(
  idleRgba: ArrayLike<number>,
  otherRgba: ArrayLike<number>,
  width: number,
  height: number,
  radius = 16,
  window?: PortraitSearchWindow,
): PortraitOffset {
  const idle = lumaBuffer(idleRgba, width, height);
  const other = lumaBuffer(otherRgba, width, height);
  let bestDx = 0;
  let bestDy = 0;
  let best = Number.POSITIVE_INFINITY;
  const maxRadius = Math.max(0, Math.min(radius, width - 1, height - 1));

  for (let dy = -maxRadius; dy <= maxRadius; dy += 1) {
    for (let dx = -maxRadius; dx <= maxRadius; dx += 1) {
      const score = lumaSad(idle, other, width, height, dx, dy, window);
      if (score < best) {
        best = score;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  return { dx: bestDx, dy: bestDy };
}
