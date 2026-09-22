import { describe, expect, it } from "vitest";
import { generateMap, sceneryAt, skirtSample, featureEdgeMask, isMountainScenery, MAP_SKIRT, MAP_SKIRT_ALPHA, skirtAlpha, terrainFeatureAt } from "../../lib/gen/map";
import { createCampaign } from "../../lib/gen/campaign";
import { createMission } from "../../lib/sim/api";
import { validMap } from "../../lib/sim/balance";
import { buildingAt, groundHeight, INITIAL_BUILDING_EDGE_MARGIN } from "../../lib/sim/world";
import { makeFixture } from "../../lib/sim/fixtures";
import { BUILDING_STATS, footprintOf } from "../../lib/catalog";
import type { BuildingKind } from "../../lib/types";
import { TILE_BLOCKED, TILE_RESOURCE, TILE_WATER } from "../../lib/types";
import { cameraViewQuad, createCamera, TILE_H, tileToScreen } from "../../lib/iso";
import {
  cameraPanBounds,
  canPan,
  clampCamera,
  MINIMAP_DRAG_THRESHOLD,
  minimapPoint,
  panAvailability,
  panCameraByMinimapDelta,
} from "../../lib/render/camera";
import { visibleTileRange } from "../../lib/render/terrainPaint";

const EXHAUSTIVE_TEST_TIMEOUT = 60_000;
const IS_COVERAGE = Boolean(process.env.NODE_V8_COVERAGE || process.env.VITEST_COVERAGE);

describe("terrain height", () => {
  it("interpolates unit elevation between neighboring tiles", () => {
    const s = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    s.heights[1 * s.width + 1] = 1;
    s.heights[1 * s.width + 2] = 2;
    expect(groundHeight(s, 1, 1)).toBe(1);
    expect(groundHeight(s, 2, 1)).toBe(2);
    expect(groundHeight(s, 1.5, 1)).toBeCloseTo(1.5);
  });

  it("generated maps have a heightmap with varied elevation", () => {
    const map = generateMap(0, { index: 0, win: { kind: "annihilate" }, mapSize: 48, biome: "ash plains" });
    expect(map.heights).toHaveLength(48 * 48);
    const stats = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const h of map.heights) {
      const k = Math.max(0, Math.min(3, h)) as 0 | 1 | 2 | 3;
      stats[k] += 1;
    }
    expect(stats[0] + stats[1]).toBeGreaterThan(0);
    expect(stats[1]).toBeGreaterThan(0);
    expect(stats[2] + stats[3]).toBeGreaterThan(0);
  });

  it("start areas are flat enough to place a construction yard", () => {
    const map = generateMap(42, { index: 0, win: { kind: "razeAll" }, mapSize: 48, biome: "ash plains" });
    const fp = BUILDING_STATS.constructionYard.footprint;
    const h0 = map.heights[map.playerStart.y * map.width + map.playerStart.x];
    for (let oy = 0; oy < fp.h; oy++) {
      for (let ox = 0; ox < fp.w; ox++) {
        expect(map.heights[(map.playerStart.y + oy) * map.width + map.playerStart.x + ox]).toBe(h0);
      }
    }
  });

  it.skipIf(IS_COVERAGE)("generates deterministic, funded, traversable maps across campaigns", () => {
    for (let seed = 0; seed < 32; seed++) {
      const campaign = createCampaign(seed);
      for (const mission of campaign.missions) {
        const a = generateMap(seed, mission);
        const b = generateMap(seed, mission);
        expect(a).toEqual(b);
        expect(routeExists(a)).toBe(true);
        expect(a.surfaces.filter((surface) => surface === 1).length).toBeGreaterThan(mission.mapSize * 2);
        expect(a.affordances.alternateRouteLength).toBeLessThanOrEqual(a.affordances.baselineRouteLength * 1.8);
        expect(a.resourceAmount.every((amount, index) => amount === 0 || a.tiles[index] === TILE_RESOURCE)).toBe(true);
        const total = a.resourceAmount.reduce((sum, amount) => sum + amount, 0);
        const required = Math.max(
          14_000 + mission.index * 3_000,
          mission.win.kind === "harvestQuota" ? Math.ceil((mission.win.target ?? 0) * 1.5) : 0,
        );
        expect(total).toBeGreaterThanOrEqual(required);
        expect(nearestResource(a, a.playerStart)).toBeLessThanOrEqual(14);
        expect(nearestResource(a, a.enemyStart)).toBeLessThanOrEqual(14);
        for (const spot of a.markedSpots) {
          expect(a.tiles[spot.y * a.width + spot.x]).toBe(0);
          expect(a.heights[spot.y * a.width + spot.x]).toBe(1);
        }
      }
    }
  }, EXHAUSTIVE_TEST_TIMEOUT);

  it("keeps extraction routes out of base-route fairness metrics", () => {
    const campaign = createCampaign(4);
    const mission = campaign.missions[3]!;
    const map = generateMap(4, mission);

    expect(mission.win.kind).toBe("extraction");
    expect(validMap(map)).toBe(true);
  });
});

function nearestResource(map: ReturnType<typeof generateMap>, start: { x: number; y: number }): number {
  let best = Infinity;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if ((map.resourceAmount[y * map.width + x] ?? 0) <= 0) continue;
      best = Math.min(best, Math.hypot(x - start.x, y - start.y));
    }
  }
  return best;
}

function routeExists(map: ReturnType<typeof generateMap>): boolean {
  const seen = new Uint8Array(map.width * map.height);
  const queue = new Int32Array(map.width * map.height);
  let head = 0;
  let tail = 0;
  const startKey = map.playerStart.y * map.width + map.playerStart.x;
  seen[startKey] = 1;
  queue[tail++] = startKey;
  while (head < tail) {
    const currentKey = queue[head++]!;
    const currentX = currentKey % map.width;
    const currentY = Math.floor(currentKey / map.width);
    if (currentX === map.enemyStart.x && currentY === map.enemyStart.y) return true;
    const currentHeight = map.heights[currentKey] ?? 1;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const x = currentX + ox;
        const y = currentY + oy;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        const i = y * map.width + x;
        if (seen[i] || map.tiles[i] === TILE_WATER || map.tiles[i] === TILE_BLOCKED) continue;
        if (Math.abs((map.heights[i] ?? 1) - currentHeight) > 1) continue;
        seen[i] = 1;
        queue[tail++] = i;
      }
    }
  }
  return false;
}

describe("mission footprints", () => {
  it("starting buildings do not overlap", () => {
    const s = createMission({ seed: 0, missionIndex: 0 });
    const buildings = s.entities.filter((e) => e.class === "building" && e.hp > 0);
    for (const b of buildings) {
      const fp = footprintOf(b.kind as BuildingKind);
      for (let oy = 0; oy < fp.h; oy++) {
        for (let ox = 0; ox < fp.w; ox++) {
          const hit = buildingAt(s, b.x + ox, b.y + oy);
          expect(hit?.id).toBe(b.id);
        }
      }
    }
  });

  it("keeps initial ally and enemy buildings clear of the map edge", () => {
    for (let seed = 0; seed < 32; seed++) {
      const campaign = createCampaign(seed);
      for (const mission of campaign.missions) {
        const state = createMission({ seed, missionIndex: mission.index });
        for (const building of state.entities.filter((entity) => entity.class === "building" && entity.hp > 0)) {
          const footprint = footprintOf(building.kind as BuildingKind);
          expect(building.x).toBeGreaterThanOrEqual(INITIAL_BUILDING_EDGE_MARGIN);
          expect(building.y).toBeGreaterThanOrEqual(INITIAL_BUILDING_EDGE_MARGIN);
          expect(building.x + footprint.w).toBeLessThanOrEqual(state.width - INITIAL_BUILDING_EDGE_MARGIN);
          expect(building.y + footprint.h).toBeLessThanOrEqual(state.height - INITIAL_BUILDING_EDGE_MARGIN);
        }
      }
    }
  });
});

describe("map skirt scenery", () => {
  it("generates deterministic mountains and water outside the playable map", () => {
    const map = generateMap(42, { index: 0, win: { kind: "annihilate" }, mapSize: 24, biome: "ash plains" });
    const world = { ...map, seed: 42 };
    const a = skirtSample(42, map.biome, -3, 8, map.width, map.height);
    const b = skirtSample(42, map.biome, -3, 8, map.width, map.height);
    expect(a).toEqual(b);
    let water = 0;
    let mountain = 0;
    for (let y = -8; y < map.height + 8; y++) {
      for (let x = -8; x < map.width + 8; x++) {
        if (x >= 0 && y >= 0 && x < map.width && y < map.height) continue;
        const sample = sceneryAt(world, x, y);
        if (sample.kind === TILE_WATER) water += 1;
        if (sample.kind === TILE_BLOCKED || sample.elev >= 2) mountain += 1;
      }
    }
    expect(water).toBeGreaterThan(0);
    expect(mountain).toBeGreaterThan(0);
    expect(sceneryAt(world, map.playerStart.x, map.playerStart.y).kind).toBe(map.tiles[map.playerStart.y * map.width + map.playerStart.x]);
  });

  it("draws outside the playable map at a lower opacity", () => {
    const w = 24;
    const h = 24;
    expect(skirtAlpha(0, 0, w, h)).toBe(1);
    expect(skirtAlpha(w - 1, h - 1, w, h)).toBe(1);
    expect(skirtAlpha(-1, 8, w, h)).toBe(MAP_SKIRT_ALPHA);
    const midSkirtAlpha = skirtAlpha(-4, 8, w, h);
    expect(midSkirtAlpha).toBeLessThan(skirtAlpha(-1, 8, w, h));
    expect(midSkirtAlpha).toBe(skirtAlpha(-4, 8, w, h));
    expect(skirtAlpha(w + MAP_SKIRT - 1, 8, w, h)).toBeLessThan(MAP_SKIRT_ALPHA);
    expect(skirtAlpha(w + MAP_SKIRT - 1, 8, w, h)).toBeGreaterThan(0);
    expect(MAP_SKIRT_ALPHA).toBeGreaterThan(0);
    expect(MAP_SKIRT_ALPHA).toBeLessThan(1);
  });

  it("marks river banks and mountain ridges on region edges", () => {
    const map = generateMap(42, { index: 0, win: { kind: "annihilate" }, mapSize: 24, biome: "ash plains" });
    const world = { ...map, seed: 42 };
    let banked = 0;
    let ridged = 0;
    let interiorWater = 0;
    let interiorMountain = 0;
    for (let y = -6; y < map.height + 6; y++) {
      for (let x = -6; x < map.width + 6; x++) {
        const sample = sceneryAt(world, x, y);
        const mask = featureEdgeMask(world, x, y);
        if (sample.kind === TILE_WATER) {
          if (mask.bank) banked += 1;
          else interiorWater += 1;
        }
        if (isMountainScenery(sample)) {
          if (mask.ridge) ridged += 1;
          else interiorMountain += 1;
        }
      }
    }
    expect(banked).toBeGreaterThan(0);
    expect(ridged).toBeGreaterThan(0);
    expect(interiorWater + interiorMountain).toBeGreaterThan(0);
  });
});

describe("organic map generation", () => {
  it("forms blob-like water instead of isolated speckle", () => {
    const map = generateMap(0, { index: 0, win: { kind: "annihilate" }, mapSize: 48, biome: "ash plains" });
    let water = 0;
    let neighborSum = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y * map.width + x] !== TILE_WATER) continue;
        water += 1;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
            if (map.tiles[ny * map.width + nx] === TILE_WATER) neighborSum += 1;
          }
        }
      }
    }
    expect(water).toBeGreaterThan(0);
    expect(neighborSum / water).toBeGreaterThan(3);
  });

  it("removes tiny water remnants after pads and routes are carved", () => {
    for (let seed = 0; seed < 32; seed++) {
      const campaign = createCampaign(seed);
      for (const mission of campaign.missions) {
        const components = waterComponentSizes(generateMap(seed, mission));
        expect(components.every((size) => size >= 4)).toBe(true);
      }
    }
  }, 30_000);

  it("forms broad elevation regions and non-linear surface routes", () => {
    const map = generateMap(832, { index: 0, win: { kind: "annihilate" }, mapSize: 48, biome: "ash plains" });
    let elevated = 0;
    let adjacentElevated = 0;
    const roadDiagonals = new Set<number>();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const i = y * map.width + x;
        if ((map.heights[i] ?? 1) >= 2) {
          elevated += 1;
          if (x + 1 < map.width && (map.heights[i + 1] ?? 1) >= 2) adjacentElevated += 1;
          if (y + 1 < map.height && (map.heights[i + map.width] ?? 1) >= 2) adjacentElevated += 1;
        }
        if (map.surfaces[i] === 1) roadDiagonals.add(x - y);
      }
    }
    expect(elevated).toBeGreaterThan(0);
    expect(adjacentElevated / elevated).toBeGreaterThan(0.25);
    expect(roadDiagonals.size).toBeGreaterThan(8);
  });
});

describe("biome terrain regions", () => {
  it("selects deterministic, coherent feature regions for a mission", () => {
    const world = { seed: 832, missionIndex: 3, biome: "rust canyons" as const, width: 72, height: 72 };
    const first = terrainFeatureAt(world, 22, 31);
    expect(terrainFeatureAt(world, 22, 31)).toEqual(first);

    const active = [] as ReturnType<typeof terrainFeatureAt>[];
    let matchingNeighbors = 0;
    let comparableNeighbors = 0;
    for (let y = 2; y < world.height - 2; y += 2) {
      for (let x = 2; x < world.width - 2; x += 2) {
        const here = terrainFeatureAt(world, x, y);
        if (here.intensity < 0.16) continue;
        active.push(here);
        const east = terrainFeatureAt(world, x + 2, y);
        if (east.intensity < 0.16) continue;
        comparableNeighbors += 1;
        if (east.kind === here.kind) matchingNeighbors += 1;
      }
    }
    expect(active.length).toBeGreaterThan(24);
    expect(new Set(active.map((sample) => sample.kind)).size).toBeGreaterThanOrEqual(2);
    expect(matchingNeighbors / comparableNeighbors).toBeGreaterThan(0.7);
  });

  it("uses the same mission-scoped feature field beyond the playable edge", () => {
    const world = { seed: 421, missionIndex: 5, biome: "volcanic shelf" as const, width: 96, height: 96 };
    const outside = terrainFeatureAt(world, -4, 38);
    expect(terrainFeatureAt(world, -4, 38)).toEqual(outside);
    expect(skirtSample(world.seed, world.biome, -4, 38, world.width, world.height, world.missionIndex))
      .toEqual(skirtSample(world.seed, world.biome, -4, 38, world.width, world.height, world.missionIndex));
  });
});

function waterComponentSizes(map: ReturnType<typeof generateMap>): number[] {
  const seen = new Uint8Array(map.tiles.length);
  const components: number[] = [];
  for (let i = 0; i < map.tiles.length; i++) {
    if (seen[i] || map.tiles[i] !== TILE_WATER) continue;
    const queue = [i];
    seen[i] = 1;
    let size = 0;
    while (queue.length) {
      const current = queue.pop()!;
      size += 1;
      const x = current % map.width;
      const y = Math.floor(current / map.width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const next = ny * map.width + nx;
        if (seen[next] || map.tiles[next] !== TILE_WATER) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    components.push(size);
  }
  return components;
}

describe("minimap camera view", () => {
  it("projects screen corners around the focused isometric tile", () => {
    const cam = createCamera();
    cam.zoom = 1;
    const w = 640;
    const h = 480;
    const tx = 10;
    const ty = 12;
    const anchor = tileToScreen(tx, ty, { x: 0, y: 0, zoom: 1 }, 0);
    cam.x = w / 2 - anchor.x;
    cam.y = h / 2 - anchor.y - TILE_H / 2;
    const quad = cameraViewQuad(cam, w, h);
    const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
    const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
    expect(cx).toBeCloseTo(tx, 5);
    expect(cy).toBeCloseTo(ty, 5);
    const xs = quad.map((p) => p.x);
    const ys = quad.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(8);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(8);
  });
});

describe("minimap camera interaction", () => {
  it("maps pointer coordinates into clamped map space", () => {
    expect(minimapPoint(-4, 120, 200, 100, 48, 64)).toEqual({ x: 0, y: 64 });
    expect(minimapPoint(100, 50, 200, 100, 48, 64)).toEqual({ x: 24, y: 32 });
    expect(minimapPoint(240, -20, 200, 100, 48, 64)).toEqual({ x: 48, y: 0 });
  });

  it("translates the camera by the same map-space drag delta", () => {
    const cam = createCamera();
    cam.x = 500;
    cam.y = 300;
    panCameraByMinimapDelta(cam, 2, 1);
    expect(cam.x).toBe(468);
    expect(cam.y).toBe(252);
    expect(MINIMAP_DRAG_THRESHOLD).toBeGreaterThan(0);
  });

  it("clamps minimap drag movement to camera bounds", () => {
    const cam = createCamera();
    const bounds = cameraPanBounds(cam, 48, 48, 640, 480);
    panCameraByMinimapDelta(cam, 10_000, -10_000, bounds);
    expect(cam.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(cam.x).toBeLessThanOrEqual(bounds.maxX);
    expect(cam.y).toBeGreaterThanOrEqual(bounds.minY);
    expect(cam.y).toBeLessThanOrEqual(bounds.maxY);
  });
});

describe("camera pan bounds", () => {
  it("hides further panning once the camera sits on a bound", () => {
    const cam = createCamera();
    cam.zoom = 1;
    const bounds = cameraPanBounds(cam, 48, 48, 640, 480);
    expect(bounds.minX).toBeLessThan(bounds.maxX);
    expect(bounds.minY).toBeLessThan(bounds.maxY);
    cam.x = bounds.maxX;
    cam.y = bounds.maxY;
    clampCamera(cam, bounds);
    expect(canPan(cam, bounds, "left")).toBe(false);
    expect(canPan(cam, bounds, "up")).toBe(false);
    expect(canPan(cam, bounds, "right")).toBe(true);
    expect(canPan(cam, bounds, "down")).toBe(true);
    cam.x = bounds.minX;
    cam.y = bounds.minY;
    expect(canPan(cam, bounds, "right")).toBe(false);
    expect(canPan(cam, bounds, "down")).toBe(false);
    expect(canPan(cam, bounds, "left")).toBe(true);
    expect(canPan(cam, bounds, "up")).toBe(true);
  });

  it("locks all directions when the map already fits the view", () => {
    const cam = createCamera();
    cam.zoom = 1;
    const bounds = cameraPanBounds(cam, 4, 4, 2000, 1600, 0);
    clampCamera(cam, bounds);
    const avail = panAvailability(cam, bounds);
    expect(avail.left).toBe(false);
    expect(avail.right).toBe(false);
    expect(avail.up).toBe(false);
    expect(avail.down).toBe(false);
  });
});

describe("visible tile range", () => {
  it("includes on-screen tiles and excludes far-off map cells", () => {
    const cam = createCamera();
    cam.x = 400;
    cam.y = 80;
    cam.zoom = 1;
    const range = visibleTileRange(cam, 800, 600, 48, 48);
    const onScreen = tileToScreen(8, 8, cam);
    expect(onScreen.x).toBeGreaterThan(0);
    expect(onScreen.x).toBeLessThan(800);
    expect(onScreen.y).toBeGreaterThan(0);
    expect(onScreen.y).toBeLessThan(600);
    expect(8).toBeGreaterThanOrEqual(range.x0);
    expect(8).toBeLessThan(range.x1);
    expect(8).toBeGreaterThanOrEqual(range.y0);
    expect(8).toBeLessThan(range.y1);
    expect(range.x1 - range.x0).toBeLessThan(48 + 14 * 2);
    expect(40 >= range.x1 || 40 >= range.y1 || 40 < range.x0 || 40 < range.y0).toBe(true);
  });
});
