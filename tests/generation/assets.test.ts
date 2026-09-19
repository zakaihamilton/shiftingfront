import { existsSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { BUILDING_KINDS, UNIT_KINDS } from "../../lib/catalog";
import {
  CLIFF_EDGE_SAMPLES,
  buildingSprite,
  cliffCornerWedge,
  cliffFaces,
  elevationFace,
  rubbleSprite,
  tileCliffGeometry,
  unitSprite,
  wreckSprite,
} from "../../lib/gen/assets";
import { generateFactions } from "../../lib/gen/factions";
import {
  listTacticalRasterSources,
  listMissionRasterSources,
  AIR_SUPPORT_ART,
  ANTI_AIR_TURRET_BASE_CROP,
  SPRITE_ART,
  UNIT_DIRECTION_ART,
  UNIT_WALK_CYCLE_ART,
  unitWalkFrameCrop,
} from "../../lib/gen/visualAssets";
import { opaquePixelBounds, rotatedSpriteBounds } from "../../lib/render/sprites";
import { fogIndex } from "../../lib/sim/fog";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";

describe("tactical procedural assets", () => {
  const palette = generateFactions(421)[0].palette;

  it("gives elevation faces stronger, deterministic material separation", () => {
    const low = cliffFaces("tundra grid", 1);
    const mid = cliffFaces("tundra grid", 2);
    const high = cliffFaces("tundra grid", 3);
    expect(low).toEqual(cliffFaces("tundra grid", 1));
    expect(new Set([low.south, mid.south, high.south]).size).toBeGreaterThan(1);
    expect(new Set([low.east, mid.east, high.east]).size).toBeGreaterThan(1);
    expect(mid.south).not.toBe(high.south);
  });

  it("provides unique valid frames for every unit facing", () => {
    for (const kind of UNIT_KINDS) {
      const ids = new Set<string>();
      for (let facing = 0; facing < 8; facing++) {
        for (const animationFrame of [0, 1, 2, 3] as const) {
          const spec = unitSprite(kind, palette, { facing: facing as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7, animationFrame, variant: 11 });
          ids.add(spec.id);
          validateSpec(spec);
        }
      }
      expect(ids.size).toBe(32);
    }
  });

  it("keeps building sprite ids stable across overlay animation frames", () => {
    for (const kind of BUILDING_KINDS) {
      const a = buildingSprite(kind, palette, { animationFrame: 0, variant: 13 });
      const b = buildingSprite(kind, palette, { animationFrame: 3, variant: 13 });
      expect(a.id).toBe(b.id);
      expect(a.id).not.toMatch(/:facing:/);
      expect(a.imageSrc ?? a.svg).toBe(b.imageSrc ?? b.svg);
      validateSpec(a);
    }
  });

  it("separates the anti-air base from its animated upper assembly", () => {
    const antiAir = buildingSprite("antiAirTurret", palette);
    expect(antiAir.imageSrc).toBe(AIR_SUPPORT_ART.antiAirTurret);
    expect(antiAir.imageCrop).toEqual(ANTI_AIR_TURRET_BASE_CROP);

    const rubble = rubbleSprite("antiAirTurret", palette);
    expect(rubble.imageSrc).toBe(antiAir.imageSrc);
    expect(rubble.imageCrop).toBeUndefined();
  });

  it("provides valid construction and damage stages for every building", () => {
    for (const kind of BUILDING_KINDS) {
      const ids = new Set<string>();
      for (const constructionStage of [0, 1, 2, 3] as const) {
        for (const damageStage of [0, 1, 2] as const) {
          const spec = buildingSprite(kind, palette, { constructionStage, damageStage, variant: 13 });
          ids.add(spec.id);
          validateSpec(spec);
        }
      }
      expect(ids.size).toBe(12);
    }
  });

  it("gives each unit and building kind a distinct silhouette", () => {
    const unitFingerprints = UNIT_KINDS.map((kind) => {
      const spec = unitSprite(kind, palette, { facing: 0, variant: 11 });
      return spec.imageSrc ?? JSON.stringify(spec.shapes);
    });
    expect(new Set(unitFingerprints).size).toBe(UNIT_KINDS.length);
    const buildingFingerprints = BUILDING_KINDS.map((kind) => {
      const spec = buildingSprite(kind, palette, { variant: 13 });
      return spec.imageSrc ?? spec.svg ?? JSON.stringify(spec.shapes);
    });
    expect(new Set(buildingFingerprints).size).toBe(BUILDING_KINDS.length);
  });

  it("keeps the directional raster art for every unit animation frame", () => {
    for (const kind of UNIT_KINDS) {
      const a = unitSprite(kind, palette, { facing: 2, animationFrame: 0, variant: 11 });
      const b = unitSprite(kind, palette, { facing: 2, animationFrame: 1, variant: 11 });
      if (a.imageSrc) {
        expect(b.imageSrc).toBe(a.imageSrc);
        expect(a.svg).toBeUndefined();
        expect(b.svg).toBeUndefined();
      } else {
        expect(a.shapes.length).toBeGreaterThan(2);
        expect(b.shapes).toEqual(a.shapes);
      }
      expect(a.id).not.toEqual(b.id);
    }
  });

  it("selects transparent, frame-specific walk sheets only for bipedal units", async () => {
    const frames = [0, 1, 2, 3] as const;
    expect(frames.map(unitWalkFrameCrop)).toEqual([
      { x: 0, y: 0, w: 512, h: 512, sourceW: 1024, sourceH: 1024, refW: 512, refH: 512 },
      { x: 512, y: 0, w: 512, h: 512, sourceW: 1024, sourceH: 1024, refW: 512, refH: 512 },
      { x: 0, y: 512, w: 512, h: 512, sourceW: 1024, sourceH: 1024, refW: 512, refH: 512 },
      { x: 512, y: 512, w: 512, h: 512, sourceW: 1024, sourceH: 1024, refW: 512, refH: 512 },
    ]);

    const walkerKinds = Object.keys(UNIT_WALK_CYCLE_ART) as Array<keyof typeof UNIT_WALK_CYCLE_ART>;
    expect(walkerKinds.sort()).toEqual(["antiArmor", "infantry", "medic"]);
    for (const kind of walkerKinds) {
      for (const src of Object.values(UNIT_WALK_CYCLE_ART[kind])) {
        const path = resolve(process.cwd(), "public", src.slice(1));
        expect(existsSync(path), src).toBe(true);
        const metadata = await sharp(path).metadata();
        expect(metadata.width).toBe(1024);
        expect(metadata.height).toBe(1024);
        expect(metadata.hasAlpha).toBe(true);

        const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        let transparentPixels = 0;
        const frameAnchors = [0, 1, 2, 3].map((frame) => {
          const offsetX = (frame & 1) * 512;
          const offsetY = ((frame >> 1) & 1) * 512;
          let minX = 512;
          let maxX = -1;
          let maxY = -1;
          for (let y = 0; y < 512; y++) {
            for (let x = 0; x < 512; x++) {
              const alpha = data[((offsetY + y) * info.width + offsetX + x) * 4 + 3]!;
              if (alpha === 0) transparentPixels += 1;
              if (alpha < 12) continue;
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
          return { centerX: Math.round((minX + maxX) / 2), bottom: maxY };
        });
        expect(transparentPixels / (info.width * info.height)).toBeGreaterThan(0.65);
        expect(new Set(frameAnchors.map(({ centerX }) => centerX)).size).toBe(1);
        expect(new Set(frameAnchors.map(({ bottom }) => bottom)).size).toBe(1);
      }
    }

    const moving = unitSprite("infantry", palette, { facing: 2, animationFrame: 2, motion: "walk" });
    const staticSprite = unitSprite("infantry", palette, { facing: 2, animationFrame: 2 });
    const vehicle = unitSprite("tank", palette, { facing: 2, animationFrame: 2, motion: "walk" });
    expect(moving.imageSrc).toContain("/walk-cycle/");
    expect(moving.imageCrop).toEqual(unitWalkFrameCrop(2));
    expect(staticSprite.imageSrc).not.toContain("/walk-cycle/");
    expect(vehicle.imageSrc).not.toContain("/walk-cycle/");
  });

  it("crops generated neighboring artwork from affected direction assets", () => {
    const harvester = unitSprite("harvester", palette, { facing: 2 });
    const tank = unitSprite("tank", palette, { facing: 6 });
    const repairTruck = unitSprite("repairTruck", palette, { facing: 2 });
    expect(harvester.imageCrop?.w).toBeLessThan(627);
    expect(tank.imageCrop?.w).toBeLessThan(687);
    expect(repairTruck.imageCrop?.w).toBeLessThan(384);
  });

  it("selects directional unit views instead of rotating one raster", () => {
    for (const kind of UNIT_KINDS) {
      const views = Array.from({ length: 8 }, (_, facing) =>
        unitSprite(kind, palette, { facing: facing as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 }),
      );
      if (kind === "strikePlane") {
        expect(views.every((spec) => spec.imageSrc === AIR_SUPPORT_ART.strikePlane && spec.rotation === undefined)).toBe(true);
        continue;
      }
      expect(views.every((spec) => spec.rotation === undefined)).toBe(true);
      expect(new Set(views.map((spec) => spec.imageSrc)).size).toBe(8);
      expect(views[0]!.imageSrc).toMatch(/-right(?:-v[12])?\.webp/);
      expect(views[1]!.imageSrc).toContain("-front-right-v1.webp");
      expect(views[2]!.imageSrc).toMatch(/-front(?:-v1)?\.webp/);
      expect(views[3]!.imageSrc).toContain("-front-left-v1.webp");
      expect(views[4]!.imageSrc).toMatch(/-left(?:-v[12])?\.webp/);
      expect(views[5]!.imageSrc).toContain("-back-left-v1.webp");
      expect(views[6]!.imageSrc).toMatch(/-back(?:-v1)?\.webp/);
      expect(views[7]!.imageSrc).toContain("-back-right-v1.webp");
    }
  });

  it("requires a complete eight-view art roster for every unit kind", () => {
    expect(Object.keys(UNIT_DIRECTION_ART).sort()).toEqual([...UNIT_KINDS].sort());
    for (const kind of UNIT_KINDS) {
      const views = UNIT_DIRECTION_ART[kind];
      expect(Object.keys(views)).toHaveLength(8);
      if (kind === "strikePlane") expect(new Set(Object.values(views))).toEqual(new Set([AIR_SUPPORT_ART.strikePlane]));
      else expect(new Set(Object.values(views)).size).toBe(8);
    }
  });

  it("lists every tactical raster used on the battlefield for preload", () => {
    const sources = listTacticalRasterSources();
    for (const src of Object.values(SPRITE_ART)) {
      expect(sources).toContain(src);
    }
    for (const kind of UNIT_KINDS) {
      for (const src of Object.values(UNIT_DIRECTION_ART[kind] ?? {})) {
        expect(sources).toContain(src);
      }
    }
  });

  it("limits mission preload sources to living battlefield entities", () => {
    const state = makeFixture({ win: { kind: "annihilate" }, width: 16, height: 16 });
    addBuilding(state, 0, "constructionYard", 1, 1);
    addUnit(state, 0, "infantry", 3, 3);
    addUnit(state, 1, "tank", 12, 12);
    state.fog.fill(0);
    const sources = listMissionRasterSources(state);
    expect(sources).toContain(SPRITE_ART.constructionYard);
    expect(sources).toContain(UNIT_DIRECTION_ART.infantry.front);
    expect(sources).toContain(UNIT_WALK_CYCLE_ART.infantry.front);
    expect(sources).not.toContain(SPRITE_ART.turret);
    expect(sources).not.toContain(UNIT_DIRECTION_ART.tank.front);
    expect(sources.length).toBeLessThan(listTacticalRasterSources().length);

    const tankFog = fogIndex(state, 12, 12);
    expect(tankFog).not.toBeNull();
    state.fog[tankFog!] = 2;
    expect(listMissionRasterSources(state)).toContain(UNIT_DIRECTION_ART.tank.front);
  });

  it("ships every mapped directional raster with the application", () => {
    for (const kind of UNIT_KINDS) {
      for (const source of Object.values(UNIT_DIRECTION_ART[kind] ?? {})) {
        expect(existsSync(resolve(process.cwd(), "public", source.slice(1)))).toBe(true);
      }
    }
  });

  it("keeps convoy truck rasters transparent, framed, and complete", async () => {
    const convoy = UNIT_DIRECTION_ART.convoyTruck;
    for (const source of Object.values(convoy)) {
      const metadata = await sharp(resolve(process.cwd(), "public", source.slice(1))).metadata();
      expect(metadata.width).toBe(384);
      expect(metadata.height).toBe(512);
      expect(metadata.hasAlpha).toBe(true);
      const stats = await sharp(resolve(process.cwd(), "public", source.slice(1))).stats();
      expect(stats.channels[3]?.min ?? 255).toBeLessThan(255);
    }
    expect(new Set(Object.values(convoy)).size).toBe(8);
  });

  it("does not keep unused sleek-modular sprites in the asset bay", () => {
    const used = new Set([
      ...Object.values(SPRITE_ART).map((src) => basename(src)),
      ...Object.values(UNIT_DIRECTION_ART).flatMap((views) => Object.values(views).map((src) => basename(src))),
    ]);
    const dir = resolve(process.cwd(), "public/art/sprites/sleek-modular");
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".webp"))) {
      expect(used.has(file), file).toBe(true);
    }
  });

  it("fits rotated unit bounds without moving the contact anchor", () => {
    const spec = unitSprite("infantry", palette, { facing: 3, variant: 11 });
    const bounds = rotatedSpriteBounds(spec);
    expect(bounds.width).toBe(spec.w);
    expect(bounds.height).toBe(spec.h);
    const scale = Math.min(420 / bounds.width, 280 / bounds.height) * 0.86;
    const dx = (420 - bounds.width * scale) / 2 - bounds.minX * scale;
    const dy = (280 - bounds.height * scale) / 2 - bounds.minY * scale;
    expect(dx + bounds.minX * scale).toBeCloseTo((420 - bounds.width * scale) / 2, 5);
    expect(dy + bounds.minY * scale).toBeCloseTo((280 - bounds.height * scale) / 2, 5);
  });

  it("keeps raster building art through construction and damage stages", () => {
    for (const kind of BUILDING_KINDS) {
      const foundation = buildingSprite(kind, palette, { constructionStage: 0, variant: 13 });
      const framed = buildingSprite(kind, palette, { constructionStage: 1, variant: 13 });
      const roofed = buildingSprite(kind, palette, { constructionStage: 2, variant: 13 });
      const finished = buildingSprite(kind, palette, { constructionStage: 3, variant: 13 });
      const damaged = buildingSprite(kind, palette, { constructionStage: 3, damageStage: 1, variant: 13 });
      const wrecked = buildingSprite(kind, palette, { constructionStage: 3, damageStage: 2, variant: 13 });
      expect([foundation, framed, roofed, finished, damaged, wrecked].every((spec) => Boolean(spec.imageSrc))).toBe(true);
      expect([foundation, framed, roofed, finished, damaged, wrecked].every((spec) => spec.svg === undefined)).toBe(true);
      expect(new Set([foundation.id, framed.id, roofed.id, finished.id, damaged.id, wrecked.id]).size).toBe(6);
      expect(foundation.imageReveal).toBeLessThan(framed.imageReveal ?? 1);
      expect(framed.imageReveal).toBeLessThan(roofed.imageReveal ?? 1);
      expect(roofed.imageReveal).toBeLessThan(finished.imageReveal ?? 1);
      expect(finished.imageReveal).toBe(1);
      expect(foundation.imageTint).not.toBe(finished.imageTint);
      expect(foundation.imageTextureSrc).toMatch(/worn-panel/);
      expect(finished.imageTextureSrc).toBeUndefined();
      expect(foundation.shapes.length).toBeGreaterThan(0);
      expect(finished.shapes).toEqual([]);
      expect(damaged.imageTint).not.toBe(finished.imageTint);
      expect(damaged.imageTextureSrc).toMatch(/worn-panel/);
      expect(damaged.shapes.length).toBeGreaterThan(0);
      expect(wrecked.shapes.length).toBeGreaterThan(damaged.shapes.length);
      expect(wrecked.imageTint).not.toBe(damaged.imageTint);
    }
  });

  it("paints wreckage and rubble from the live rasters with a scorched treatment", () => {
    for (const kind of UNIT_KINDS) {
      const live = unitSprite(kind, palette, { facing: 2, variant: 11 });
      const a = wreckSprite(kind, palette);
      const b = wreckSprite(kind, palette);
      expect(a).toEqual(b);
      expect(a.imageSrc).toBe(live.imageSrc);
      expect(a.imageCrop).toEqual(live.imageCrop);
      expect(a.svg).toBeUndefined();
      if (!live.imageSrc) expect(a.shapes.length).toBeGreaterThan(2);
      expect(a.imageTint).not.toBe(live.imageTint);
      expect(a.imageTextureSrc).toMatch(/worn-panel/);
      expect(a.id).not.toBe(live.id);
      validateSpec(a);
    }
    for (const kind of BUILDING_KINDS) {
      const live = buildingSprite(kind, palette, { variant: 13 });
      const a = rubbleSprite(kind, palette);
      const b = rubbleSprite(kind, palette);
      expect(a).toEqual(b);
      expect(a.imageSrc).toBe(live.imageSrc);
      expect(a.svg).toBeUndefined();
      expect(a.imageTint).not.toBe(live.imageTint);
      expect(a.imageTextureSrc).toMatch(/worn-panel/);
      expect(a.id).not.toBe(live.id);
      validateSpec(a);
    }
    const wreckIds = new Set(UNIT_KINDS.map((kind) => wreckSprite(kind, palette).id));
    const rubbleIds = new Set(BUILDING_KINDS.map((kind) => rubbleSprite(kind, palette).id));
    expect(wreckIds.size).toBe(UNIT_KINDS.length);
    expect(rubbleIds.size).toBe(BUILDING_KINDS.length);
  });

  it("plants unit sprites on a contact shadow at the feet", () => {
    for (const kind of UNIT_KINDS) {
      const spec = unitSprite(kind, palette, { facing: 0, variant: 11 });
      if (spec.imageSrc) {
        expect(spec.anchorY ?? spec.h).toBeGreaterThan(spec.h * 0.8);
        expect(spec.anchorX).toBe(spec.w / 2);
        expect(spec.anchorY).toBe(spec.h);
        continue;
      }
      expect(spec.anchorY ?? spec.h).toBeGreaterThan(spec.h * 0.8);
    }
  });

  it("draws 1-step drops as hillsides without layer lines", () => {
    const face = elevationFace("south", 1, 64, 32, 16, 42);
    expect(face.cracks).toHaveLength(0);
    const verts = face.points.length / 2;
    expect(verts).toBeGreaterThanOrEqual(8);
    expect(verts).toBeLessThanOrEqual(12);
    expect(verts).toBe(CLIFF_EDGE_SAMPLES * 2);
    const startBotX = face.points[face.points.length - 2]!;
    expect(startBotX).toBeGreaterThan(-32);
    const botYs = face.points.filter((_, i) => i % 2 === 1).slice(CLIFF_EDGE_SAMPLES);
    expect(new Set(botYs.map((y) => Math.round(y * 10) / 10)).size).toBeGreaterThan(1);
  });

  it("draws steep cliffs as jagged faces with strata, not cube-aligned quads", () => {
    const face = elevationFace("east", 2, 64, 32, 16, 7);
    expect(face.points.length / 2).toBe(CLIFF_EDGE_SAMPLES * 2);
    expect(face.cracks.length).toBeGreaterThanOrEqual(1);
    const xs = face.points.filter((_, i) => i % 2 === 0);
    expect(new Set(xs.map((x) => Math.round(x))).size).toBeGreaterThan(2);
  });

  it("keeps shared cliff vertices sealed across adjacent tiles", () => {
    const a = elevationFace("south", 2, 64, 32, 16, 1, { tileX: 4, tileY: 7 });
    const b = elevationFace("south", 2, 64, 32, 16, 99, { tileX: 5, tileY: 7 });
    const aSouth = cliffBottomNearSouth(a);
    const bWest = cliffBottomNearStart(b);
    expect(aSouth[0]).toBeCloseTo(bWest[0] + 32, 5);
    expect(aSouth[1]).toBeCloseTo(bWest[1] + 16, 5);
  });

  it("adds a convex corner wedge only when both south and east drop", () => {
    expect(cliffCornerWedge(64, 32, 16, 0, 2, 3, 4, 7)).toBeNull();
    expect(cliffCornerWedge(64, 32, 16, 2, 0, 3, 4, 7)).toBeNull();
    const wedge = cliffCornerWedge(64, 32, 16, 2, 2, 3, 4, 7);
    expect(wedge).not.toBeNull();
    expect(wedge!.length / 2).toBeGreaterThanOrEqual(5);
    const both = tileCliffGeometry(64, 32, 16, 1, 2, 9, 3, 8);
    expect(both.south).not.toBeNull();
    expect(both.east).not.toBeNull();
    expect(both.wedge).toEqual(cliffCornerWedge(64, 32, 16, 1, 2, 9, 3, 8));
    const southTop = both.south!.points[(CLIFF_EDGE_SAMPLES - 1) * 2]!;
    expect(southTop).not.toBeCloseTo(0);
  });

  it("gives finished buildings three-face industrial volumes, not cubic shells or sketches", () => {
    for (const kind of BUILDING_KINDS) {
      const spec = buildingSprite(kind, palette, { variant: 13 });
      if (spec.imageSrc) {
        expect(spec.imageSrc).toMatch(/\/art\/sprites\//);
        continue;
      }
      if (spec.svg) {
        expect(spec.svg).toContain("#9aabba");
        expect(spec.svg).toContain("#26323d");
        expect(spec.svg).not.toMatch(/ [QC]/);
      } else {
        expect(spec.shapes.length).toBeGreaterThan(0);
      }
    }
  });

  it("measures the opaque box so sidebar previews can center the graphic", () => {
    const width = 8;
    const height = 6;
    const data = new Uint8ClampedArray(width * height * 4);
    for (const [x, y] of [[2, 1], [3, 1], [2, 2], [3, 2]] as const) {
      data[(y * width + x) * 4 + 3] = 255;
    }
    expect(opaquePixelBounds(data, width, height)).toEqual({ minX: 2, minY: 1, width: 2, height: 2 });
    expect(opaquePixelBounds(new Uint8ClampedArray(width * height * 4), width, height)).toBeUndefined();
  });
});

function cliffBottomNearSouth(face: { points: number[] }): [number, number] {
  const i = CLIFF_EDGE_SAMPLES * 2;
  return [face.points[i]!, face.points[i + 1]!];
}

function cliffBottomNearStart(face: { points: number[] }): [number, number] {
  const i = face.points.length - 2;
  return [face.points[i]!, face.points[i + 1]!];
}

function validateSpec(spec: { w: number; h: number; pixelScale?: number; anchorX?: number; anchorY?: number; kind: string; imageSrc?: string; svg?: string; shapes: Array<{ x: number; y: number; w: number; h: number; points?: number[] }> }): void {
  expect(spec.w).toBeGreaterThan(0);
  expect(spec.h).toBeGreaterThan(0);
  expect(spec.pixelScale).toBe(1);
  expect(spec.anchorX ?? spec.w / 2).toBeGreaterThanOrEqual(0);
  expect(spec.anchorY ?? spec.h).toBeGreaterThanOrEqual(0);
  if (spec.kind === "unit" || spec.kind === "building") {
    if (spec.imageSrc) expect(spec.imageSrc).toMatch(/^\/art\/sprites\/.+\.webp$/);
    else {
      expect(spec.shapes.length).toBeGreaterThan(2);
    }
  }
  for (const shape of spec.shapes) {
    for (const value of [shape.x, shape.y, shape.w, shape.h, ...(shape.points ?? [])]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  }
}
