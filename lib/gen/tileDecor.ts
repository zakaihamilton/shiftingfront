import type { BiomeName, Palette, ShapeSpec } from "../types";
import { ell, irregularIso, line, poly } from "./shapePrimitives";
import { mixHex, pick, signed } from "./tilePalette";

const INK = "#202a32";

export function paintBiomeLandmark(
  shapes: ShapeSpec[],
  biome: BiomeName,
  p: Palette,
  v: number,
  cx: number,
  cy: number,
): void {
  const feature = pick(v, 263, 3);
  if (biome === "jungle wreckage") {
    if (feature === 0) {
      shapes.push(line(cx - 23, cy + 5, cx + 20, cy - 3, "#17271b", 4));
      shapes.push(line(cx - 8, cy + 2, cx - 2, cy - 9, "#4f7743", 2));
      shapes.push(ell(cx + 8, cy - 8, 16, 8, "#315b35", INK));
    } else if (feature === 1) {
      shapes.push(ell(cx - 20, cy - 7, 40, 14, "#18372f", "#10281f"));
      shapes.push(ell(cx - 11, cy - 5, 20, 7, "#397365"));
      shapes.push(ell(cx + 9, cy - 1, 8, 4, "#6a8458"));
    } else {
      shapes.push(poly([cx - 20, cy + 4, cx - 9, cy - 7, cx + 19, cy, cx + 7, cy + 7], "#5a4939", "#1b201c", 1));
      shapes.push(line(cx - 13, cy - 2, cx + 13, cy + 3, "#b0733d", 2));
      shapes.push(ell(cx - 14, cy - 7, 9, 5, "#3c633a"));
    }
  } else if (biome === "ash plains") {
    if (feature === 0) {
      shapes.push(ell(cx - 23, cy - 8, 46, 17, "#282b2e", "#16181a"));
      shapes.push(ell(cx - 12, cy - 4, 24, 8, "#101214"));
    } else if (feature === 1) {
      shapes.push(line(cx - 24, cy + 5, cx + 22, cy - 5, "#24262a", 5));
      shapes.push(line(cx - 18, cy + 3, cx + 18, cy - 4, "#7a7e84", 1));
    } else {
      shapes.push(poly(irregularIso(cx, cy, 42, 16, 3), "#62666c", "#1f2226", 1));
      shapes.push(line(cx - 12, cy + 4, cx + 9, cy - 5, "#303338", 2));
    }
  } else if (biome === "crystal flats") {
    for (let i = 0; i < 3 + feature; i++) {
      const ox = -16 + i * 8;
      shapes.push(poly([cx + ox - 4, cy + 5, cx + ox, cy - 10 - (i % 3) * 2, cx + ox + 4, cy + 4], i % 2 ? "#79b9ad" : "#9ce4d5", "#263c38", 1));
    }
  } else if (biome === "rust canyons") {
    shapes.push(line(cx - 25, cy + 5, cx + 23, cy - 5 + feature * 3, "#43281d", 5));
    shapes.push(line(cx - 20, cy + 3, cx + 19, cy - 4 + feature * 3, feature === 2 ? "#d38345" : "#8f4c2d", 2));
    if (feature === 1) shapes.push(poly([cx - 10, cy + 3, cx - 2, cy - 9, cx + 12, cy + 1], "#885334", "#2c1b14", 1));
  } else if (biome === "salt marshes") {
    shapes.push(ell(cx - 23, cy - 8, 46, 16, feature === 0 ? "#1e2e2a" : "#3e4842", "#14201c"));
    for (let i = 0; i < 4 + feature; i++) shapes.push(line(cx - 17 + i * 7, cy + 4, cx - 16 + i * 7, cy - 8 - (i % 2) * 3, "#7a887a", 1));
  } else if (biome === "glass desert") {
    shapes.push(poly([cx - 24, cy + 4, cx - 8, cy - 10 - feature, cx + 24, cy + 2, cx + 6, cy + 9], feature === 1 ? "#292f31" : "#75664f", "#b9aa8b", 1));
    shapes.push(line(cx - 7, cy - 9, cx + 14, cy, "#e3d4b2", 1));
  } else if (biome === "tundra grid") {
    shapes.push(poly(irregularIso(cx, cy, 48, 19, 2), feature === 0 ? "#85a4aa" : "#a6bcb9", "#39545b", 1));
    shapes.push(line(cx - 22, cy - 4, cx + 20, cy + 6, "#d4eeee", 2));
    if (feature === 2) shapes.push(line(cx - 13, cy + 5, cx + 4, cy - 7, "#526d72", 2));
  } else {
    shapes.push(line(cx - 24, cy - 4, cx - 3, cy + feature - 1, "#151313", 5));
    shapes.push(line(cx - 3, cy + feature - 1, cx + 23, cy - 4, feature === 1 ? "#8e2c22" : "#d04b2c", 3));
    shapes.push(line(cx - 2, cy + feature - 2, cx + 20, cy - 4, "#ff9a46", 1));
  }
  if (feature === 2) shapes.push(ell(cx + signed(v, 264, 12), cy + signed(v, 265, 4), 6, 3, p.dark));
}

export function paintBiomeSignature(
  shapes: ShapeSpec[],
  biome: BiomeName,
  p: Palette,
  v: number,
  cx: number,
  cy: number,
): void {
  const ox = signed(v, 270, 10);
  const oy = signed(v, 271, 3);
  if (biome === "ash plains") {
    shapes.push(ell(cx + ox - 6, cy + oy - 2, 12, 5, "#2a302c", "#667068"));
    shapes.push(ell(cx + ox - 3, cy + oy - 1, 6, 2.5, "#151a18"));
  } else if (biome === "crystal flats") {
    shapes.push(poly([cx + ox - 4, cy + oy + 3, cx + ox - 1, cy + oy - 6, cx + ox + 1, cy + oy + 2], "#92b8ac", "#263c38", 1));
    shapes.push(poly([cx + ox, cy + oy + 3, cx + ox + 5, cy + oy - 3, cx + ox + 4, cy + oy + 4], "#6f9188", "#263c38", 1));
  } else if (biome === "rust canyons") {
    shapes.push(line(cx + ox - 7, cy + oy, cx + ox + 7, cy + oy + 3, "#3d2b22", 3));
    shapes.push(line(cx + ox - 5, cy + oy - 1, cx + ox + 5, cy + oy + 1, "#a7683f", 1));
  } else if (biome === "salt marshes") {
    for (let i = -2; i <= 2; i++) shapes.push(line(cx + ox + i * 2, cy + oy + 3, cx + ox + i * 2 + (i % 2), cy + oy - 5 - Math.abs(i), "#778465", 1));
  } else if (biome === "glass desert") {
    shapes.push(poly([cx + ox - 8, cy + oy + 3, cx + ox - 2, cy + oy - 4, cx + ox + 8, cy + oy + 2, cx + ox + 1, cy + oy + 4], "#262b2c", "#9a9d95", 1));
    shapes.push(line(cx + ox - 2, cy + oy - 3, cx + ox + 5, cy + oy + 1, "#d0c4aa", 1));
  } else if (biome === "tundra grid") {
    shapes.push(poly([cx + ox - 9, cy + oy + 1, cx + ox - 4, cy + oy - 4, cx + ox + 8, cy + oy - 1, cx + ox + 2, cy + oy + 3], "#718f94", "#46545a", 1));
    shapes.push(ell(cx + ox - 3, cy + oy - 1, 7, 2, "#a7b7ba"));
  } else if (biome === "jungle wreckage") {
    shapes.push(line(cx + ox - 8, cy + oy, cx + ox + 8, cy + oy + 2, "#17271b", 2));
    shapes.push(ell(cx + ox - 5, cy + oy - 4, 8, 4, "#547448", INK));
    shapes.push(ell(cx + ox + 1, cy + oy - 3, 7, 4, "#385f3d", INK));
  } else if (biome === "volcanic shelf") {
    shapes.push(line(cx + ox - 8, cy + oy - 2, cx + ox, cy + oy + 1, "#1c1716", 3));
    shapes.push(line(cx + ox, cy + oy + 1, cx + ox + 8, cy + oy - 1, "#c54f2b", 2));
    shapes.push(line(cx + ox + 1, cy + oy + 1, cx + ox + 6, cy + oy, "#ff9a42", 1));
  }
  if (pick(v, 272, 5) === 0) shapes.push(ell(cx - ox * 0.4, cy - oy, 4, 2, p.light));
}

export function pushBush(shapes: ShapeSpec[], x: number, y: number, v: number, biome: BiomeName, p: Palette): void {
  const canopy = canopyColors(biome, p);
  const w = 9 + pick(v, 16, 6);
  const lean = signed(v, 18, 2) * 0.8;
  const edge = mixHex(canopy.dark, p.secondary, 0.32);
  shapes.push(ell(x - w * 0.5, y + 1, w, 3.2, mixHex(p.dark, p.secondary, 0.4)));
  shapes.push(poly([
    x - w * 0.52, y,
    x - w * 0.45 + lean, y - 5,
    x - w * 0.12 + lean, y - 8,
    x + w * 0.28 + lean, y - 7,
    x + w * 0.52 + lean, y - 3,
    x + w * 0.38, y + 1,
  ], canopy.dark, edge, 0.65));
  shapes.push(poly([
    x - w * 0.26 + lean, y - 1,
    x - w * 0.15 + lean, y - 6,
    x + w * 0.3 + lean, y - 6,
    x + w * 0.4 + lean, y - 2,
    x + w * 0.16, y,
  ], canopy.mid));
  if (pick(v, 17, 2) === 0) shapes.push(ell(x + w * 0.08 + lean, y - 5, w * 0.25, 2.4, canopy.hi));
}

function canopyColors(biome: BiomeName, p: Palette): { dark: string; mid: string; hi: string } {
  const dark = mixHex(p.secondary, p.dark, 0.34);
  const mid = mixHex(p.primary, p.secondary, biome === "salt marshes" ? 0.42 : 0.28);
  const hi = mixHex(p.light, p.primary, biome === "jungle wreckage" ? 0.34 : 0.42);
  switch (biome) {
    case "jungle wreckage": return { dark, mid, hi };
    case "salt marshes": return { dark, mid, hi };
    case "tundra grid": return { dark, mid, hi };
    case "crystal flats": return { dark, mid, hi };
    default: return { dark, mid, hi };
  }
}
