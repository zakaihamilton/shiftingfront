import { describe, expect, it, vi } from "vitest";
import { createCamera } from "../../lib/iso";
import { terrainContentKey } from "../../lib/render/renderer";
import {
  ORE_CRYSTAL_MIN_AMOUNT,
  ORE_GLINT_RIDGE,
  ORE_VEIN_PROBES,
  oreCrystalCluster,
  oreVeinAt,
  oreVeinPeak,
} from "../../lib/render/terrainAtlas";
import { WATER_COVER } from "../../lib/render/terrainPaint";
import {
  oreGlint,
  oreSparkle,
  paintWaterFx,
  visibleFxTileCoords,
  waterCaustic,
  waterFxNeedsClip,
  weatherKindForBiome,
  weatherParticleAt,
} from "../../lib/render/terrainWeather";
import { paintTerrainWeather } from "../../lib/render/terrainWeather/weather";
import { makeFixture, setTile } from "../../lib/sim/fixtures";
import { SURFACE_CONCRETE, TILE_CLEAR, TILE_RESOURCE, TILE_WATER } from "../../lib/types";

describe("ore veins", () => {
  it("is deterministic, bounded, and weaker after harvest", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    setTile(state, 3, 2, TILE_RESOURCE, 800);
    let mapX = 3.4;
    let mapY = 2.3;
    let a = oreVeinAt(state, mapX, mapY);
    for (let ly = 0; ly < 8; ly++) {
      for (let lx = 0; lx < 8; lx++) {
        const sample = oreVeinAt(state, 3 + (lx + 0.5) / 8, 2 + (ly + 0.5) / 8);
        if (sample.ridge > a.ridge) {
          a = sample;
          mapX = 3 + (lx + 0.5) / 8;
          mapY = 2 + (ly + 0.5) / 8;
        }
      }
    }
    expect(oreVeinAt(state, mapX, mapY)).toEqual(a);
    expect(a.ridge).toBeGreaterThan(0);
    expect(a.ridge).toBeLessThanOrEqual(1);
    expect(a.intensity).toBeGreaterThan(0);
    expect(a.intensity).toBeLessThanOrEqual(1);
    state.resourceAmount[2 * state.width + 3] = 120;
    const poor = oreVeinAt(state, mapX, mapY);
    expect(poor.ridge).toBe(a.ridge);
    expect(poor.intensity).toBeLessThan(a.intensity);
  });

  it("picks a deterministic peak that harvest can drop below the crystal cutoff", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    setTile(state, 3, 2, TILE_RESOURCE, 800);
    const peak = oreVeinPeak(state, 3, 2);
    expect(oreVeinPeak(state, 3, 2)).toEqual(peak);
    let best = 0;
    for (const [fx, fy] of ORE_VEIN_PROBES) {
      const intensity = oreVeinAt(state, 3 + fx, 2 + fy).intensity;
      if (intensity > best) best = intensity;
    }
    expect(peak.intensity).toBe(best);
    expect(peak.intensity).toBeGreaterThanOrEqual(ORE_GLINT_RIDGE);
    state.resourceAmount[2 * state.width + 3] = 50;
    expect(oreVeinPeak(state, 3, 2).intensity).toBeLessThan(ORE_GLINT_RIDGE);
  });

  it("builds a deterministic faceted cluster on a rich peak", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    setTile(state, 3, 2, TILE_RESOURCE, 800);
    const cluster = oreCrystalCluster(state, 3, 2);
    expect(cluster).not.toBeNull();
    expect(oreCrystalCluster(state, 3, 2)).toEqual(cluster);
    expect(cluster!.bursts.length).toBeGreaterThanOrEqual(2);
    expect(cluster!.bursts.length).toBeLessThanOrEqual(3);
    expect(cluster!.shards.length).toBeGreaterThanOrEqual(5);
    expect(cluster!.shards.length).toBeLessThanOrEqual(11);
    expect(Math.min(...cluster!.shards.map((s) => s.rise))).toBeGreaterThan(2);
    expect(Math.max(...cluster!.shards.map((s) => s.rise))).toBeGreaterThan(6);
    expect(Math.max(...cluster!.shards.map((s) => s.rise))).toBeLessThan(20);
    const lengths = cluster!.shards.map((s) => Math.hypot(s.lean, s.rise));
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThan(2);
    expect(Math.min(...cluster!.shards.map((s) => s.half))).toBeGreaterThan(2);
    expect(Math.max(...cluster!.shards.map((s) => s.half))).toBeLessThan(5);
    const spanX =
      Math.max(...cluster!.shards.map((s) => s.dx)) - Math.min(...cluster!.shards.map((s) => s.dx));
    const spanY =
      Math.max(...cluster!.shards.map((s) => s.dy)) - Math.min(...cluster!.shards.map((s) => s.dy));
    expect(Math.hypot(spanX, spanY)).toBeGreaterThan(16);
    const originSpan = Math.hypot(
      Math.max(...cluster!.bursts.map((b) => b.dx)) - Math.min(...cluster!.bursts.map((b) => b.dx)),
      Math.max(...cluster!.bursts.map((b) => b.dy)) - Math.min(...cluster!.bursts.map((b) => b.dy)),
    );
    expect(originSpan).toBeGreaterThan(14);
    const grouped = cluster!.bursts.every((burst) =>
      cluster!.shards.some((shard) => Math.hypot(shard.dx - burst.dx, shard.dy - burst.dy) < 6),
    );
    expect(grouped).toBe(true);
    state.resourceAmount[2 * state.width + 3] = 120;
    const depleted = oreCrystalCluster(state, 3, 2);
    expect(depleted).not.toBeNull();
    expect(depleted!.intensity).toBeLessThan(cluster!.intensity);
    expect(depleted!.shards.length).toBeLessThanOrEqual(cluster!.shards.length);
    state.resourceAmount[2 * state.width + 3] = ORE_CRYSTAL_MIN_AMOUNT;
    expect(oreCrystalCluster(state, 3, 2)).toBeNull();
  });

  it("varies burst layout across neighboring ore tiles", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    const clusters = [];
    for (let y = 1; y < 6; y++) {
      for (let x = 1; x < 6; x++) {
        setTile(state, x, y, TILE_RESOURCE, 800);
        const cluster = oreCrystalCluster(state, x, y);
        expect(cluster).not.toBeNull();
        expect(cluster!.shards.length).toBeGreaterThanOrEqual(4);
        clusters.push(cluster!);
      }
    }
    const signatures = new Set(
      clusters.map((cluster) =>
        JSON.stringify({
          bursts: cluster.bursts,
          shards: cluster.shards,
        }),
      ),
    );
    expect(signatures.size).toBe(clusters.length);
  });
});

describe("terrain weather and water motion", () => {
  it("keeps water terrain and shoreline effects inside the owning cell", () => {
    expect(WATER_COVER).toBe(1);
  });

  it("is deterministic for a given clock", () => {
    const a = weatherParticleAt(832, "tundra grid", 4, 1200, 640, 360);
    const b = weatherParticleAt(832, "tundra grid", 4, 1200, 640, 360);
    expect(a).toEqual(b);
    expect(weatherParticleAt(832, "tundra grid", 4, 2400, 640, 360)).not.toEqual(a);
    expect(waterCaustic(400, 3, 5)).toEqual(waterCaustic(400, 3, 5));
    expect(waterCaustic(800, 3, 5).offset).not.toBe(waterCaustic(400, 3, 5).offset);
    expect(waterCaustic(250, 3, 5).phase).not.toBe(waterCaustic(0, 3, 5).phase);
    expect(oreGlint(900, 2, 2)).toBeGreaterThan(0);
    expect(oreSparkle(900, 2, 2, 0)).toEqual(oreSparkle(900, 2, 2, 0));
    expect(oreSparkle(1800, 2, 2, 0).sweep).not.toBe(oreSparkle(900, 2, 2, 0).sweep);
    expect(oreSparkle(900, 2, 2, 1).twinkle).toBeGreaterThanOrEqual(0);
    expect(oreSparkle(900, 2, 2, 1).twinkle).toBeLessThanOrEqual(1);
    expect(weatherKindForBiome("tundra grid")).toBe("snow");
    expect(weatherKindForBiome("volcanic shelf")).toBe("ember");
    expect(weatherParticleAt(832, "glass desert", 4, 1200, 640, 360).trail).toBeGreaterThan(1);
    expect(weatherParticleAt(832, "glass desert", 4, 1200, 640, 360).rotation).not.toBeNaN();
  });

  it("renders a warm glow for ember weather particles", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    state.biome = "volcanic shelf";
    const compositingModes: GlobalCompositeOperation[] = [];
    const ctx = new Proxy(
      {
        canvas: { width: 640, height: 360 },
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        ellipse: vi.fn(),
        fill: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        globalAlpha: 1,
        fillStyle: "",
        globalCompositeOperation: "source-over",
      } as unknown as CanvasRenderingContext2D,
      {
        set(target, property, value) {
          if (property === "globalCompositeOperation")
            compositingModes.push(value as GlobalCompositeOperation);
          return Reflect.set(target, property, value);
        },
      },
    );

    paintTerrainWeather(ctx, state, createCamera(), 0);

    expect(compositingModes).toContain("screen");
    expect(ctx.ellipse).toHaveBeenCalled();
  });

  it("culls water and ore FX to the visible tile range", () => {
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" }, seed: 832 });
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        setTile(state, x, y, TILE_WATER);
      }
    }
    setTile(state, 2, 2, TILE_RESOURCE, 800);
    setTile(state, 46, 46, TILE_RESOURCE, 800);
    const cam = createCamera();
    cam.x = 400;
    cam.y = 80;
    cam.zoom = 1;
    const water = visibleFxTileCoords(state, cam, 800, 600, "water");
    const ore = visibleFxTileCoords(state, cam, 800, 600, "ore");
    expect(water.length).toBeGreaterThan(0);
    expect(water.length).toBeLessThan(48 * 48);
    expect(water.some((tile) => tile.x === 8 && tile.y === 8)).toBe(true);
    expect(water.some((tile) => tile.x === 46 && tile.y === 46)).toBe(false);
    expect(ore.some((tile) => tile.x === 2 && tile.y === 2)).toBe(true);
    expect(ore.some((tile) => tile.x === 46 && tile.y === 46)).toBe(false);
  });

  it("drops exhausted ore from the dynamic FX index without rescanning the map", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed: 832 });
    setTile(state, 2, 2, TILE_RESOURCE, 800);
    const cam = createCamera();
    expect(visibleFxTileCoords(state, cam, 800, 600, "ore")).toContainEqual({ x: 2, y: 2 });
    state.tiles[2 * state.width + 2] = TILE_CLEAR;
    state.tick += 1;
    expect(visibleFxTileCoords(state, cam, 800, 600, "ore")).not.toContainEqual({ x: 2, y: 2 });
  });

  it("skips caustic clipping on interior water tiles", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) {
        setTile(state, x, y, TILE_WATER);
      }
    }
    expect(waterFxNeedsClip(state, 3, 3)).toBe(false);
    expect(waterFxNeedsClip(state, 2, 3)).toBe(true);
  });

  it("balances the water pass and each per-tile clip", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) setTile(state, x, y, TILE_WATER);
    }
    const save = vi.fn();
    const restore = vi.fn();
    let contextDepth = 0;
    save.mockImplementation(() => {
      contextDepth += 1;
    });
    restore.mockImplementation(() => {
      contextDepth -= 1;
    });
    const ctx = new Proxy(
      {
        canvas: { width: 800, height: 600 },
        save,
        restore,
      },
      {
        get(target, property, receiver) {
          if (property in target) return Reflect.get(target, property, receiver);
          return vi.fn();
        },
      },
    ) as unknown as CanvasRenderingContext2D;

    paintWaterFx(ctx, state, createCamera(), 0);

    expect(save).toHaveBeenCalledTimes(restore.mock.calls.length);
    expect(restore).toHaveBeenCalledTimes(save.mock.calls.length);
    expect(contextDepth).toBe(0);
  });
});

describe("terrain scroll cache key", () => {
  it("ignores camera translation and changes with zoom or fog bucket", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    const cam = createCamera();
    const a = terrainContentKey(state, cam, 640, 360);
    expect(a).toContain("world-atlas-v35-isometric-projection");
    cam.x += 40;
    cam.y -= 18;
    expect(terrainContentKey(state, cam, 640, 360)).toBe(a);
    cam.zoom = 1.15;
    expect(terrainContentKey(state, cam, 640, 360)).not.toBe(a);
    cam.zoom = 1;
    state.tick = 16;
    expect(terrainContentKey(state, cam, 640, 360)).not.toBe(a);
  });

  it("invalidates when the terrain layout changes", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    const cam = createCamera();
    const ground = terrainContentKey(state, cam, 640, 360);

    setTile(state, 1, 1, TILE_WATER);
    const water = terrainContentKey(state, cam, 640, 360);
    expect(water).not.toBe(ground);

    state.surfaces[2 * state.width + 2] = SURFACE_CONCRETE;
    expect(terrainContentKey(state, cam, 640, 360)).not.toBe(water);
  });
});
