/**
 * Run-length encoding (RLE) helpers for compacting dense map arrays
 * (tiles, heights, surfaces, resourceAmount, fog) in saved states.
 *
 * Encoded format: a tagged payload containing flat alternating pairs
 * [count, value, count, value, ...]. Decoders also handle the earlier flat-pair
 * format, string format ("countxvalue,..."), and existing uncompressed arrays.
 */

export type EncodedRle = {
  encoding: "rle";
  runs: number[];
};

export function encodeRle(arr: readonly number[]): EncodedRle {
  if (!Array.isArray(arr) || arr.length === 0) return { encoding: "rle", runs: [] };
  const runs: number[] = [];
  let cur = arr[0]!;
  let count = 1;
  for (let i = 1; i < arr.length; i++) {
    const v = arr[i]!;
    if (v === cur) {
      count++;
    } else {
      runs.push(count, cur);
      cur = v;
      count = 1;
    }
  }
  runs.push(count, cur);
  return { encoding: "rle", runs };
}

export function isRleEncoded(raw: unknown): raw is EncodedRle {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const candidate = raw as { encoding?: unknown; runs?: unknown };
  if (candidate.encoding !== "rle" || !Array.isArray(candidate.runs) || candidate.runs.length % 2 !== 0) return false;
  for (let i = 0; i < candidate.runs.length; i += 2) {
    const count = candidate.runs[i];
    const value = candidate.runs[i + 1];
    if (typeof count !== "number" || !Number.isInteger(count) || count <= 0 ||
      typeof value !== "number" || !Number.isFinite(value)) return false;
  }
  return true;
}

export function isRleString(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  if (!raw) return true;
  return raw.split(",").every((part) => {
    const sep = part.indexOf("x");
    if (sep === -1) return part.trim().length > 0 && Number.isFinite(Number(part));
    const count = Number(part.slice(0, sep));
    const value = Number(part.slice(sep + 1));
    return Number.isInteger(count) && count > 0 && Number.isFinite(value);
  });
}

function decodePairs(raw: readonly number[], expectedLength: number): number[] {
  const out: number[] = new Array(expectedLength);
  let outIdx = 0;
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const count = raw[i]!;
    const value = raw[i + 1]!;
    if (!Number.isInteger(count) || count < 0 || !Number.isFinite(value)) continue;
    for (let c = 0; c < count && outIdx < expectedLength; c++) out[outIdx++] = value;
  }
  while (outIdx < expectedLength) out[outIdx++] = 0;
  return out;
}

export function decodeRle(raw: unknown, expectedLength: number, alternateLength?: number): number[] {
  if (!raw) return new Array(expectedLength).fill(0);
  if (isRleEncoded(raw)) return decodePairs(raw.runs, expectedLength);
  if (Array.isArray(raw)) {
    if (raw.length === expectedLength || (alternateLength !== undefined && raw.length === alternateLength)) {
      return [...raw];
    }
    return decodePairs(raw as number[], expectedLength);
  }
  if (typeof raw === "string") {
    const out: number[] = new Array(expectedLength);
    let outIdx = 0;
    if (!isRleString(raw)) return out.fill(0);
    const parts = raw.split(",");
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!;
      const sep = p.indexOf("x");
      if (sep === -1) {
        if (outIdx < expectedLength) out[outIdx++] = Number(p);
      } else {
        const count = Number(p.slice(0, sep));
        const val = Number(p.slice(sep + 1));
        for (let c = 0; c < count && outIdx < expectedLength; c++) {
          out[outIdx++] = val;
        }
      }
    }
    while (outIdx < expectedLength) out[outIdx++] = 0;
    return out;
  }
  return new Array(expectedLength).fill(0);
}
