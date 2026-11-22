import type { Palette } from "../../types";
import { mixHex, ORE } from "../tilePalette";

export type BlockerTone = {
  dark: string;
  mid: string;
  high: string;
  light: string;
  blocked: string;
  ore: string;
};

export type PropPrim =
  | {
      k: "ell";
      x: number;
      y: number;
      rx: number;
      ry: number;
      rot: number;
      fill: string;
      alpha?: number;
    }
  | {
      k: "poly";
      pts: number[];
      fill: string;
      alpha?: number;
    }
  | {
      k: "line";
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      stroke: string;
      width: number;
      minWidth?: number;
      cap?: "butt" | "round" | "square";
      alpha?: number;
    }
  | {
      k: "curve";
      x0: number;
      y0: number;
      cx: number;
      cy: number;
      x1: number;
      y1: number;
      stroke: string;
      width: number;
      minWidth?: number;
      cap?: "butt" | "round" | "square";
      alpha?: number;
    };

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((n) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function mutedHex(value: string, amount: number): string {
  const r = Number.parseInt(value.slice(1, 3), 16);
  const g = Number.parseInt(value.slice(3, 5), 16);
  const b = Number.parseInt(value.slice(5, 7), 16);
  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  return mixHex(value, toHex(luma, luma, luma), amount);
}

export function hexRgb(c: { r: number; g: number; b: number }): string {
  return toHex(c.r, c.g, c.b);
}

export function blockerToneFromRgb(m: {
  dark: { r: number; g: number; b: number };
  mid: { r: number; g: number; b: number };
  high: { r: number; g: number; b: number };
  light: { r: number; g: number; b: number };
  blocked: { r: number; g: number; b: number };
  ore: { r: number; g: number; b: number };
}): BlockerTone {
  return {
    dark: hexRgb(m.dark),
    mid: hexRgb(m.mid),
    high: hexRgb(m.high),
    light: hexRgb(m.light),
    blocked: hexRgb(m.blocked),
    ore: hexRgb(m.ore),
  };
}

export function blockerToneFromPalette(p: Palette): BlockerTone {
  const dark = mutedHex(p.dark, 0.14);
  const mid = mutedHex(p.primary, 0.12);
  const high = mutedHex(p.accent, 0.16);
  const light = mutedHex(p.light, 0.14);
  const blocked = mixHex(mutedHex(p.secondary, 0.12), mid, 0.16);
  return {
    dark: mixHex(dark, mid, 0.08),
    mid,
    high,
    light,
    blocked,
    ore: mutedHex(mixHex(p.accent, ORE.stain, 0.38), 0.14),
  };
}
