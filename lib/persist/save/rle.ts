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

function expandRuns(raw: readonly number[], expectedLength: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const count = raw[i]!;
    const value = raw[i + 1]!;
    if (!Number.isInteger(count) || count <= 0 || !Number.isFinite(value)) throw new Error("Invalid map data");
    for (let c = 0; c < count; c++) {
      if (out.length >= expectedLength) throw new Error("Invalid map data");
      out.push(value);
    }
  }
  if (out.length !== expectedLength) throw new Error("Invalid map data");
  return out;
}

function decodeExact(raw: unknown, expectedLength: number): number[] {
  if (isRleEncoded(raw)) return expandRuns(raw.runs, expectedLength);
  if (Array.isArray(raw)) {
    if (raw.length === expectedLength) return [...raw];
    return expandRuns(raw as number[], expectedLength);
  }
  if (typeof raw === "string") {
    if (!isRleString(raw)) throw new Error("Invalid map data");
    const pairs: number[] = [];
    for (const part of raw.split(",")) {
      if (!part) continue;
      const sep = part.indexOf("x");
      if (sep === -1) pairs.push(1, Number(part));
      else pairs.push(Number(part.slice(0, sep)), Number(part.slice(sep + 1)));
    }
    return expandRuns(pairs, expectedLength);
  }
  throw new Error("Invalid map data");
}

export function decodeRle(raw: unknown, expectedLength: number, alternateLength?: number): number[] {
  if (!raw) return new Array(expectedLength).fill(0);
  if (Array.isArray(raw) && alternateLength !== undefined && raw.length === alternateLength) return [...raw];
  try {
    return decodeExact(raw, expectedLength);
  } catch (error) {
    if (alternateLength !== undefined && alternateLength !== expectedLength) return decodeExact(raw, alternateLength);
    throw error;
  }
}
