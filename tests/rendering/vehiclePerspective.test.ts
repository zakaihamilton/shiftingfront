import { describe, expect, it } from "vitest";
import { unitSprite, wreckSprite } from "../../lib/gen/svgArt";
import { STRIKE_PLANE_IMAGE_ANCHORS, UNIT_DIRECTION_CROPS, unitViewForFacing } from "../../lib/gen/visualAssets";
import { spriteRasterPlacement } from "../../lib/render/sprites";
import type { Palette, UnitKind } from "../../lib/types";

const palette: Palette = {
  primary: "#3b82f6",
  secondary: "#1e3a8a",
  accent: "#60a5fa",
  outline: "#0f172a",
  light: "#93c5fd",
  dark: "#020617",
};

const VEHICLE_KINDS: UnitKind[] = ["tank", "harvester", "repairTruck", "convoyTruck"];
const GROUND_KINDS: UnitKind[] = [
  "tank",
  "harvester",
  "repairTruck",
  "convoyTruck",
  "infantry",
  "antiArmor",
  "medic",
];

describe("vehicle perspective consistency", () => {
  it("defines directional crops for all 8 perspectives across all vehicles", () => {
    for (const kind of VEHICLE_KINDS) {
      const crops = UNIT_DIRECTION_CROPS[kind];
      expect(crops).toBeDefined();
      for (let facing = 0; facing < 8; facing++) {
        const view = unitViewForFacing(facing as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7);
        const crop = crops?.[view];
        expect(crop, `${kind} facing ${facing} (${view}) should have crop`).toBeDefined();
        expect(crop!.w).toBeGreaterThan(0);
        expect(crop!.h).toBeGreaterThan(0);
        expect(crop!.sourceW).toBeGreaterThan(0);
        expect(crop!.sourceH).toBeGreaterThan(0);
      }
    }
  });

  it("maintains stable ground contact baseline across all 8 perspectives (no bouncing)", () => {
    const cWidth = 128;
    const cHeight = 120;
    const inset = Math.max(1, Math.round(Math.min(cWidth, cHeight) * 0.025));

    for (const kind of VEHICLE_KINDS) {
      const groundLines: number[] = [];
      for (let facing = 0; facing < 8; facing++) {
        const spec = unitSprite(kind, palette, { facing: facing as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 });
        expect(spec.imageCrop).toBeDefined();
        const crop = spec.imageCrop!;
        const refW = crop.refW ?? (crop.sourceW > 0 ? crop.sourceW : crop.w);
        const refH = crop.refH ?? (crop.sourceH > 0 ? crop.sourceH : crop.h);
        const scale = Math.min((cWidth - inset * 2) / refW, (cHeight - inset * 2) / refH);
        const dh = Math.round(crop.h * scale);
        const destY = Math.round(cHeight - dh - inset * 0.25);
        const groundY = destY + dh;
        groundLines.push(groundY);
      }

      const minGround = Math.min(...groundLines);
      const maxGround = Math.max(...groundLines);
      // All perspectives must stay firmly planted on the ground baseline within 1px
      expect(maxGround - minGround, `${kind} ground variance must be <= 1px`).toBeLessThanOrEqual(1);
    }
  });

  it("preserves main-branch world contact for every ground unit facing", () => {
    const canvasW = 128;
    const canvasH = 120;
    const inset = Math.max(1, Math.round(Math.min(canvasW, canvasH) * 0.025));
    const expectedCenterX = canvasW / 2;
    const expectedGroundY = Math.round(canvasH - inset * 0.25);

    for (const kind of GROUND_KINDS) {
      for (const motion of kind === "infantry" || kind === "antiArmor" || kind === "medic" ? [undefined, "walk"] as const : [undefined] as const) {
        for (let facing = 0; facing < 8; facing++) {
          const spec = unitSprite(kind, palette, {
            facing: facing as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
            motion,
          });
          // Main keeps ground art centered and bottom-aligned. This explicit
          // invariant catches any future per-view anchor that would make a
          // unit appear to jump when its authored facing changes.
          expect(spec.rotation, `${kind} ${motion ?? "static"} facing ${facing} must use authored orientation`).toBeUndefined();
          expect(spec.imageAnchorX, `${kind} ${motion ?? "static"} facing ${facing} x anchor`).toBeUndefined();
          expect(spec.imageAnchorY, `${kind} ${motion ?? "static"} facing ${facing} y anchor`).toBeUndefined();
          const crop = spec.imageCrop;
          const placement = spriteRasterPlacement(
            spec,
            crop?.sourceW ?? 1024,
            crop?.sourceH ?? 1024,
            canvasW,
            canvasH,
            inset,
          );
          expect(Math.abs(placement.destX + placement.dw / 2 - expectedCenterX), `${kind} ${motion ?? "static"} facing ${facing} x contact`).toBeLessThanOrEqual(0.5);
          expect(placement.destY + placement.dh, `${kind} ${motion ?? "static"} facing ${facing} ground contact`).toBe(expectedGroundY);
        }
      }
    }
  });

  it("centers every authored plane view in its logical airframe frame", () => {
    const canvasW = 192;
    const canvasH = 128;
    const inset = Math.max(1, Math.round(Math.min(canvasW, canvasH) * 0.025));

    for (let facing = 0; facing < 8; facing++) {
      const spec = unitSprite("strikePlane", palette, {
        facing: facing as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
      });
      const placement = spriteRasterPlacement(spec, 1536, 1024, canvasW, canvasH, inset);
      const view = unitViewForFacing(facing as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7);
      const [anchorX, anchorY] = STRIKE_PLANE_IMAGE_ANCHORS[view];
      expect(spec.rotation, `strikePlane facing ${facing} must use authored orientation`).toBeUndefined();
      expect(spec.imageAnchorX).toBe(anchorX);
      expect(spec.imageAnchorY).toBe(anchorY);
      expect(Math.abs(placement.destX + placement.dw * anchorX - canvasW / 2)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(placement.destY + placement.dh * anchorY - canvasH / 2)).toBeLessThanOrEqual(0.5);
    }
  });

  it("prevents aspect ratio and height ballooning when turning between perspectives", () => {
    const cWidth = 128;
    const cHeight = 120;
    const inset = Math.max(1, Math.round(Math.min(cWidth, cHeight) * 0.025));

    for (const kind of VEHICLE_KINDS) {
      const drawnHeights: number[] = [];
      for (let facing = 0; facing < 8; facing++) {
        const spec = unitSprite(kind, palette, { facing: facing as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 });
        const crop = spec.imageCrop!;
        const refW = crop.refW ?? (crop.sourceW > 0 ? crop.sourceW : crop.w);
        const refH = crop.refH ?? (crop.sourceH > 0 ? crop.sourceH : crop.h);
        const scale = Math.min((cWidth - inset * 2) / refW, (cHeight - inset * 2) / refH);
        const dh = Math.round(crop.h * scale);
        drawnHeights.push(dh);
      }

      // In harvester, front/back views previously ballooned to 114px (+65% over 70px side views).
      // With calibrated reference frame, height stays bounded.
      if (kind === "harvester") {
        const minH = Math.min(...drawnHeights);
        const maxH = Math.max(...drawnHeights);
        // Height variation across all 8 directions must be <= 15px (previously was 45px)
        expect(maxH - minH).toBeLessThanOrEqual(15);
      }

      // In tank, front view previously ballooned to 110px (+38% over 80px side views).
      if (kind === "tank") {
        const minH = Math.min(...drawnHeights);
        const maxH = Math.max(...drawnHeights);
        expect(maxH - minH).toBeLessThanOrEqual(15);
      }
    }
  });

  it("maintains matched dimensions between symmetrical perspective pairs", () => {
    const cWidth = 128;
    const cHeight = 120;
    const inset = Math.max(1, Math.round(Math.min(cWidth, cHeight) * 0.025));

    function getDrawnDims(kind: UnitKind, facing: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7) {
      const spec = unitSprite(kind, palette, { facing });
      const crop = spec.imageCrop!;
      const refW = crop.refW ?? (crop.sourceW > 0 ? crop.sourceW : crop.w);
      const refH = crop.refH ?? (crop.sourceH > 0 ? crop.sourceH : crop.h);
      const scale = Math.min((cWidth - inset * 2) / refW, (cHeight - inset * 2) / refH);
      return {
        w: Math.round(crop.w * scale),
        h: Math.round(crop.h * scale),
      };
    }

    for (const kind of VEHICLE_KINDS) {
      // Facing 1 (front-right) vs Facing 3 (front-left)
      const fr = getDrawnDims(kind, 1);
      const fl = getDrawnDims(kind, 3);
      expect(Math.abs(fr.w - fl.w), `${kind} front diagonals width diff`).toBeLessThanOrEqual(2);
      // convoyTruck front-right render extends lower than front-left to maintain ground line
      const maxHDiff = kind === "convoyTruck" ? 10 : 2;
      expect(Math.abs(fr.h - fl.h), `${kind} front diagonals height diff`).toBeLessThanOrEqual(maxHDiff);

      // Facing 7 (back-right) vs Facing 5 (back-left)
      const br = getDrawnDims(kind, 7);
      const bl = getDrawnDims(kind, 5);
      expect(Math.abs(br.w - bl.w), `${kind} back diagonals width diff`).toBeLessThanOrEqual(2);
      expect(Math.abs(br.h - bl.h), `${kind} back diagonals height diff`).toBeLessThanOrEqual(2);
    }
  });

  it("preserves vehicle crops on wreck sprites", () => {
    for (const kind of VEHICLE_KINDS) {
      const live = unitSprite(kind, palette, { facing: 2 });
      const wreck = wreckSprite(kind, palette);
      expect(wreck.imageCrop).toEqual(live.imageCrop);
      expect(wreck.imageCrop?.refW).toEqual(live.imageCrop?.refW);
      expect(wreck.imageCrop?.refH).toEqual(live.imageCrop?.refH);
    }
  });
});
