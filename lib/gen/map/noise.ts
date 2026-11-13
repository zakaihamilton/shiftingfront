import type { Rng } from "../../seed/rng";

export function hashNoise(x: number, y: number, salt: number): number {
  let n = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + salt, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number, salt: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const v00 = hashNoise(x0, y0, salt);
  const v10 = hashNoise(x0 + 1, y0, salt);
  const v01 = hashNoise(x0, y0 + 1, salt);
  const v11 = hashNoise(x0 + 1, y0 + 1, salt);
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fx;
  return a + (b - a) * fy;
}

export function fbm(x: number, y: number, salt: number): number {
  return (
    valueNoise(x / 8, y / 8, salt) * 0.55 +
    valueNoise(x / 4, y / 4, salt + 17) * 0.3 +
    valueNoise(x / 2, y / 2, salt + 31) * 0.15
  );
}

export function warpedFbm(x: number, y: number, salt: number): number {
  const wx = (valueNoise(x / 10, y / 10, salt + 401) - 0.5) * 6;
  const wy = (valueNoise(x / 10, y / 10, salt + 419) - 0.5) * 6;
  return fbm(x + wx, y + wy, salt);
}

export function mixSalt(rng: Rng): number {
  return 1 + rng.int(1_000_000);
}
