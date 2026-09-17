import { describe, expect, it } from "vitest";
import {
  blockerPropPrims,
  type BlockerTone,
  type PropPrim,
} from "../../lib/gen/blockerPropArt";
import { blockerPropKind } from "../../lib/gen/terrainDecorKinds";

const TONE: BlockerTone = {
  dark: "#1d2420",
  mid: "#4e6354",
  high: "#6f8a62",
  light: "#c8d4c0",
  blocked: "#2a332c",
  ore: "#c4a040",
};

const BIOMES = [
  "ash plains",
  "crystal flats",
  "rust canyons",
  "salt marshes",
  "glass desert",
  "tundra grid",
  "jungle wreckage",
  "volcanic shelf",
] as const;

function ofKind<K extends PropPrim["k"]>(prims: PropPrim[], k: K): Array<Extract<PropPrim, { k: K }>> {
  return prims.filter((prim): prim is Extract<PropPrim, { k: K }> => prim.k === k);
}

describe("blocker prop art", () => {
  it("gives every tree variant a trunk and a highlight canopy lobe", () => {
    for (const v of [0, 1, 2, 3, 4, 5]) {
      const prims = blockerPropPrims("tree", v, TONE, "jungle wreckage");
      const ells = ofKind(prims, "ell");
      const canopy = ells.filter((prim) => prim.alpha !== 0.22);
      expect(ofKind(prims, "curve").length).toBeGreaterThanOrEqual(1);
      expect(canopy.length).toBeGreaterThanOrEqual(5);
      expect(canopy.some((prim) => prim.alpha === 0.2)).toBe(true);
    }
  });

  it("paints pine as an upward trunk plus five needle tiers", () => {
    const prims = blockerPropPrims("pine", 3, TONE, "tundra grid");
    const trunk = ofKind(prims, "line")[0];
    expect(trunk).toBeDefined();
    expect(trunk!.y1).toBeLessThan(trunk!.y0);
    expect(ofKind(prims, "poly").filter((prim) => prim.pts.length === 6).length).toBeGreaterThanOrEqual(4);
  });

  it("keeps tree and pine silhouettes distinct", () => {
    const tree = blockerPropPrims("tree", 3, TONE, "ash plains");
    const pine = blockerPropPrims("pine", 3, TONE, "ash plains");
    expect(tree).not.toEqual(pine);
    expect(ofKind(tree, "ell").length).toBeGreaterThan(ofKind(pine, "ell").length);
    expect(ofKind(pine, "poly").length).toBeGreaterThan(ofKind(tree, "poly").length);
  });

  it("gives neighboring tree variants distinct bounded silhouettes", () => {
    const signatures = new Set<string>();
    for (let v = 0; v < 32; v++) {
      const prims = blockerPropPrims("tree", v, TONE, "jungle wreckage");
      signatures.add(JSON.stringify(prims));
      for (const prim of prims) {
        if (prim.k === "ell") {
          expect(prim.x - prim.rx).toBeGreaterThanOrEqual(-24);
          expect(prim.x + prim.rx).toBeLessThanOrEqual(24);
          expect(prim.y - prim.ry).toBeGreaterThanOrEqual(-36);
          expect(prim.y + prim.ry).toBeLessThanOrEqual(16);
        } else if (prim.k === "poly") {
          for (let i = 0; i < prim.pts.length; i += 2) {
            expect(prim.pts[i]).toBeGreaterThanOrEqual(-24);
            expect(prim.pts[i]).toBeLessThanOrEqual(24);
            expect(prim.pts[i + 1]).toBeGreaterThanOrEqual(-36);
            expect(prim.pts[i + 1]).toBeLessThanOrEqual(16);
          }
        } else if (prim.k === "line") {
          expect(Math.min(prim.x0, prim.x1)).toBeGreaterThanOrEqual(-24);
          expect(Math.max(prim.x0, prim.x1)).toBeLessThanOrEqual(24);
          expect(Math.min(prim.y0, prim.y1)).toBeGreaterThanOrEqual(-36);
          expect(Math.max(prim.y0, prim.y1)).toBeLessThanOrEqual(16);
        } else {
          expect(Math.min(prim.x0, prim.cx, prim.x1)).toBeGreaterThanOrEqual(-24);
          expect(Math.max(prim.x0, prim.cx, prim.x1)).toBeLessThanOrEqual(24);
          expect(Math.min(prim.y0, prim.cy, prim.y1)).toBeGreaterThanOrEqual(-36);
          expect(Math.max(prim.y0, prim.cy, prim.y1)).toBeLessThanOrEqual(16);
        }
      }
    }
    expect(signatures.size).toBeGreaterThanOrEqual(16);
  });

  it("stacks sandstone as at least three band polygons", () => {
    const prims = blockerPropPrims("sandstone", 2, TONE, "glass desert");
    expect(ofKind(prims, "poly").length).toBeGreaterThanOrEqual(4);
  });

  it("keeps geological and dry-shrub profiles visibly varied", () => {
    const cases = [
      ["boulder", "glass desert"],
      ["sandstone", "glass desert"],
      ["crystalOutcrop", "crystal flats"],
      ["wreckage", "rust canyons"],
      ["spire", "volcanic shelf"],
      ["deadShrub", "glass desert"],
    ] as const;
    for (const [kind, biome] of cases) {
      const signatures = new Set<string>();
      for (let v = 0; v < 64; v++) signatures.add(JSON.stringify(blockerPropPrims(kind, v, TONE, biome)));
      expect(signatures.size, `${kind} profiles`).toBeGreaterThanOrEqual(2);
    }
  });

  it("stays deterministic for a biome variant", () => {
    const kind = blockerPropKind("volcanic shelf", 4);
    expect(blockerPropPrims(kind, 4, TONE, "volcanic shelf")).toEqual(
      blockerPropPrims(kind, 4, TONE, "volcanic shelf"),
    );
  });

  it("keeps every biome's blocker variants muted, bounded, and non-black", () => {
    for (const biome of BIOMES) {
      const kinds = new Set<string>();
      for (let v = 0; v < 64; v++) {
        const kind = blockerPropKind(biome, v);
        kinds.add(kind);
        const prims = blockerPropPrims(kind, v, TONE, biome);
        expect(blockerPropPrims(kind, v, TONE, biome)).toEqual(prims);
        for (const prim of prims) {
          const color = prim.k === "line" || prim.k === "curve" ? prim.stroke : prim.fill;
          expect(color.toLowerCase()).not.toBe("#000000");
          if (prim.alpha !== undefined) expect(prim.alpha).toBeLessThanOrEqual(0.72);
        }
      }
      expect(kinds.size).toBeGreaterThanOrEqual(2);
    }
  });
});
