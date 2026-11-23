import { lumaBuffer } from "./luma";
import type { PortraitClip } from "./types";
import { PORTRAIT_MOUTH_CLIP } from "./types";

export function detectPortraitMouthClip(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  talkRgba?: ArrayLike<number> | null,
): PortraitClip {
  const viseme = talkRgba ? detectMouthFromViseme(rgba, talkRgba, width, height) : null;
  if (viseme) return viseme;
  return detectMouthFromLipLine(rgba, width, height);
}

function detectMouthFromViseme(
  idleRgba: ArrayLike<number>,
  talkRgba: ArrayLike<number>,
  width: number,
  height: number,
): PortraitClip | null {
  const idle = lumaBuffer(idleRgba, width, height);
  const talk = lumaBuffer(talkRgba, width, height);
  const x0 = Math.floor(width * 0.32);
  const x1 = Math.ceil(width * 0.68);
  const y0 = Math.floor(height * 0.54);
  // Some portrait crops place the mouth below the legacy .72 boundary. Keep
  // the search in the face/neck transition, where the viseme still has strong
  // central contrast, instead of latching onto eyes or collar details.
  const y1 = Math.ceil(height * 0.9);
  if (x1 <= x0 || y1 <= y0) return null;

  const midX = width * 0.5;
  const sigmaX = width * 0.1;
  const twoSigmaX2 = 2 * sigmaX * sigmaX;
  const rowScore = new Float64Array(height);
  let bestRawMean = 0;

  for (let y = y0; y < y1; y += 1) {
    let weighted = 0;
    let raw = 0;
    let center = 0;
    let sides = 0;
    const row = y * width;
    for (let x = x0; x < x1; x += 1) {
      const d = Math.abs(idle[row + x] - talk[row + x]);
      const nx = x - midX;
      weighted += d * Math.exp((-nx * nx) / twoSigmaX2);
      raw += d;
      if (x >= width * 0.42 && x < width * 0.58) center += d;
      else sides += d;
    }
    const count = x1 - x0;
    const mean = raw / count;
    if (mean > bestRawMean) bestRawMean = mean;
    rowScore[y] = 0.3 * weighted + Math.max(0, center - 0.55 * sides);
  }

  if (bestRawMean < 4) return null;

  const smooth = new Float64Array(height);
  let bestY = Math.round(height * PORTRAIT_MOUTH_CLIP.cy);
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let y = y0; y < y1; y += 1) {
    const prev = y > y0 ? rowScore[y - 1]! : rowScore[y]!;
    const next = y + 1 < y1 ? rowScore[y + 1]! : rowScore[y]!;
    const score = prev + rowScore[y]! + next;
    smooth[y] = score;
    if (score > bestScore) {
      bestScore = score;
      bestY = y;
    }
  }

  const radius = Math.max(4, Math.round(height * 0.07));
  let weightedY = 0;
  let rowWeight = 0;
  const local0 = Math.max(y0, bestY - radius);
  const local1 = Math.min(y1, bestY + radius + 1);
  for (let y = local0; y < local1; y += 1) {
    const score = Math.max(0, smooth[y]!);
    weightedY += y * score;
    rowWeight += score;
  }
  if (rowWeight > 0) bestY = Math.round(weightedY / rowWeight);

  let weightedX = 0;
  let weight = 0;
  const rowStart = Math.max(y0, bestY - 3);
  const rowEnd = Math.min(y1, bestY + 4);
  for (let y = rowStart; y < rowEnd; y += 1) {
    const row = y * width;
    for (let x = x0; x < x1; x += 1) {
      const d = Math.abs(idle[row + x] - talk[row + x]);
      const nx = x - midX;
      const w = d * d * Math.exp((-nx * nx) / twoSigmaX2);
      weightedX += x * w;
      weight += w;
    }
  }

  const cx = weight > 0 ? weightedX / weight / width : PORTRAIT_MOUTH_CLIP.cx;
  return {
    cx: Math.min(0.58, Math.max(0.42, cx)),
    cy: bestY / height,
    rx: PORTRAIT_MOUTH_CLIP.rx,
    ry: PORTRAIT_MOUTH_CLIP.ry,
  };
}

function detectMouthFromLipLine(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): PortraitClip {
  const luma = lumaBuffer(rgba, width, height);
  const x0 = Math.floor(width * 0.36);
  const x1 = Math.ceil(width * 0.64);
  const y0 = Math.floor(height * 0.5);
  const y1 = Math.ceil(height * 0.68);
  let bestY = Math.round(height * PORTRAIT_MOUTH_CLIP.cy);
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let y = y0; y < y1; y += 1) {
    let row = 0;
    let above = 0;
    let below = 0;
    let center = 0;
    let sides = 0;
    const yAbove = Math.max(0, y - 3);
    const yBelow = Math.min(height - 1, y + 3);
    for (let x = x0; x < x1; x += 1) {
      const value = luma[y * width + x];
      row += value;
      above += luma[yAbove * width + x];
      below += luma[yBelow * width + x];
      if (x >= width * 0.44 && x < width * 0.56) center += 140 - value;
      else sides += 140 - value;
    }
    const count = x1 - x0;
    const contrast = (above + below) / count - (2 * row) / count;
    const compact = (center - 0.45 * sides) / count;
    const score = contrast + compact;
    if (score > bestScore) {
      bestScore = score;
      bestY = y;
    }
  }

  let weightedX = 0;
  let weight = 0;
  const rowStart = Math.max(y0, bestY - 2);
  const rowEnd = Math.min(y1, bestY + 3);
  for (let y = rowStart; y < rowEnd; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const darkness = Math.max(0, 140 - luma[y * width + x]);
      weightedX += x * darkness;
      weight += darkness;
    }
  }

  const cx = weight > 0 ? weightedX / weight / width : PORTRAIT_MOUTH_CLIP.cx;
  return {
    cx: Math.min(0.58, Math.max(0.42, cx)),
    cy: bestY / height,
    rx: PORTRAIT_MOUTH_CLIP.rx,
    ry: PORTRAIT_MOUTH_CLIP.ry,
  };
}
