import { createRng } from "../../seed/rng";
import {
  SURFACE_NONE,
  TILE_BLOCKED,
  TILE_CLEAR,
  TILE_RESOURCE,
  TILE_WATER,
  type ReadonlyMissionDef,
  type SurfaceKind,
  type Vec2,
} from "../../types";
import { biomeTuning } from "./config";
import { terrainFeatureSamplerFor, type TerrainFeatureSample } from "./features";
import { resolveMissionProfile } from "../profile";
import { fbm, warpedFbm, mixSalt } from "./noise";
import {
  idx,
  meanderingRoute,
  carveRoute,
  paintBase,
  smoothWater,
  pruneWaterIslands,
  relaxHeights,
} from "./terrain";
import {
  type GeneratedMap,
  computeMapAffordances,
  routeLength,
  walkDistances,
  routeReachable,
  pickSpawnTopology,
  resolveDynamicSpawns,
  clampPoint,
} from "./generator/index";
import { rescueFlankCenter } from "./generator/rescuePlacement";
import { applyBiomeLandmark, generateLandmarkResourceVeins, landmarkForBiome } from "./landmarks";

export function generateMap(
  seed: number,
  mission: Pick<ReadonlyMissionDef, "index" | "win" | "mapSize" | "biome" | "profile">,
): GeneratedMap {
  const rng = createRng(seed, `map:${mission.index}`);
  const profile = resolveMissionProfile(seed, mission.index, mission.win.kind, mission.profile);
  const biome = mission.biome;
  const tuning = biomeTuning(biome);
  const width = mission.mapSize;
  const height = mission.mapSize;
  const tiles = new Array<number>(width * height).fill(TILE_CLEAR);
  const heights = new Array<number>(width * height).fill(1);
  const surfaces = new Array<SurfaceKind>(width * height).fill(SURFACE_NONE);
  const resourceAmount = new Array<number>(width * height).fill(0);
  const salt = mixSalt(rng);
  const terrainFeatures = new Array<TerrainFeatureSample>(width * height);
  const terrainWorld = { seed, missionIndex: mission.index, biome, width, height };
  const featureAt = terrainFeatureSamplerFor(terrainWorld);

  // 1. Dynamic Spawns & Frontlines (Corners, Cardinals, Center-vs-Edge)
  const topology = pickSpawnTopology(seed, mission.index);
  const spawns = resolveDynamicSpawns(topology, width, height, rng);
  const playerStart = spawns.playerStart;
  const enemyStart = spawns.enemyStart;
  const enemyOutposts = spawns.enemyOutposts;

  const startClear = 8;
  const protectedStart = (x: number, y: number) =>
    Math.hypot(x - playerStart.x, y - playerStart.y) < startClear ||
    Math.hypot(x - enemyStart.x, y - enemyStart.y) < startClear ||
    (enemyOutposts?.some((op) => Math.hypot(x - op.x, y - op.y) < 5) ?? false);

  // 2. Base Noise & Natural Terrain Generation
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y, width);
      const feature = featureAt(x, y);
      terrainFeatures[i] = feature;
      if (protectedStart(x, y)) {
        tiles[i] = TILE_CLEAR;
        continue;
      }
      const localWet = warpedFbm(x * 0.72, y * 0.72, salt);
      const basinWet = warpedFbm(x * 0.3, y * 0.3, salt + 13);
      const channel = Math.abs(warpedFbm(x * 0.16, y * 0.16, salt + 37) - 0.5);
      const waterScore = localWet * 0.48 + basinWet * 0.52;
      const basin = waterScore < tuning.water * 0.98 + feature.wetness * 0.045;
      const river = channel < 0.035 + tuning.water * 0.025 + feature.wetness * 0.007 && basinWet < tuning.water + 0.16;
      if (basin || river) tiles[i] = TILE_WATER;
    }
  }
  smoothWater(tiles, width, height, protectedStart);
  pruneWaterIslands(tiles, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y, width);
      const feature = terrainFeatures[i] ?? featureAt(x, y);
      const shore = warpedFbm(x * 0.72, y * 0.72, salt);
      if (tiles[i] === TILE_WATER) {
        heights[i] = 0;
        continue;
      }
      const plateau = warpedFbm(x * 0.38, y * 0.38, salt + 91);
      const ridge = warpedFbm(x * 0.16, y * 0.16, salt + 127);
      const shapedPlateau = plateau + feature.elevation * 0.12;
      const shapedRidge = ridge + feature.elevation * 0.08;
      if (shore < tuning.water + 0.07 + feature.wetness * 0.03) {
        heights[i] = 0;
      } else {
        if (shapedPlateau > tuning.mountain || shapedRidge > 0.69) heights[i] = 3;
        else if (shapedPlateau > tuning.mountain - 0.18 || shapedRidge > 0.59) heights[i] = 2;
        else heights[i] = 1;
      }
      const grove = warpedFbm(x * 0.3, y * 0.3, salt + 211);
      const detail = fbm(x * 1.55, y * 1.55, salt + 223);
      if (grove > tuning.blockers - 0.05 - feature.blockers * 0.045 && detail > 0.5 && heights[i]! < 3 && tiles[i] !== TILE_WATER) {
        tiles[i] = TILE_BLOCKED;
      }
    }
  }
  relaxHeights(heights, tiles, width, height);

  // 3. Biome-Specific Landmark Monument Injection
  const landmarkKind = landmarkForBiome(biome);
  const landmark = applyBiomeLandmark(
    landmarkKind,
    tiles,
    heights,
    surfaces,
    width,
    height,
    playerStart,
    enemyStart,
    rng,
  );

  // 4. Base Footprints
  paintBase(tiles, heights, surfaces, width, height, playerStart, startClear);
  paintBase(tiles, heights, surfaces, width, height, enemyStart, startClear);
  if (enemyOutposts) {
    for (const outpost of enemyOutposts) {
      paintBase(tiles, heights, surfaces, width, height, outpost, 4);
    }
  }

  // 5. Landmark Relaxation & Route Carving
  relaxHeights(heights, tiles, width, height);

  const upperRoute = meanderingRoute(playerStart, enemyStart, width, height, salt + 7);
  const lowerRoute = meanderingRoute(playerStart, enemyStart, width, height, salt + 17).map((point, i) =>
    i === 0 || i === 4
      ? point
      : {
          x: Math.max(2, Math.min(width - 3, point.x + Math.round(height * 0.12 * (i % 2 ? -1 : 1)))),
          y: Math.max(2, Math.min(height - 3, point.y + Math.round(width * 0.08 * (i % 2 ? 1 : -1)))),
        },
  );
  carveRoute(tiles, heights, surfaces, width, height, upperRoute, 1, salt);
  carveRoute(tiles, heights, surfaces, width, height, lowerRoute, 1, salt + 11);
  const routePlans = [upperRoute, lowerRoute];
  const scenarioRoutePlans: Vec2[][] = [];

  if (mission.index >= 4 || profile.variant === "crossfire") {
    const crossfireRoute = meanderingRoute(playerStart, enemyStart, width, height, salt + 27);
    carveRoute(tiles, heights, surfaces, width, height, crossfireRoute, 1, salt + 23);
    routePlans.push(crossfireRoute);
  }
  if (mission.win.kind === "rescue") {
    const rescueRoute = meanderingRoute(
      playerStart,
      rescueFlankCenter({ width, height, enemyStart, playerStart }),
      width,
      height,
      salt + 37,
    );
    carveRoute(tiles, heights, surfaces, width, height, rescueRoute, 1, salt + 29);
    scenarioRoutePlans.push(rescueRoute);
  }
  if (mission.win.kind === "extraction") {
    const extractionRegions = [
      { x: 0.33, y: 0.33 },
      { x: 0.67, y: 0.33 },
      { x: 0.33, y: 0.67 },
      { x: 0.67, y: 0.67 },
    ];
    for (const [index, region] of extractionRegions.entries()) {
      const extractionRoute = meanderingRoute(
        playerStart,
        { x: Math.round(width * region.x), y: Math.round(height * region.y) },
        width,
        height,
        salt + 47 + index * 13,
      );
      carveRoute(tiles, heights, surfaces, width, height, extractionRoute, 1, salt + 53 + index * 13);
      scenarioRoutePlans.push(extractionRoute);
    }
  }
  if (enemyOutposts && enemyOutposts.length > 0) {
    for (const [index, outpost] of enemyOutposts.entries()) {
      const outpostRoute = meanderingRoute(playerStart, outpost, width, height, salt + 61 + index * 17);
      carveRoute(tiles, heights, surfaces, width, height, outpostRoute, 1, salt + 71 + index * 17);
      scenarioRoutePlans.push(outpostRoute);
    }
  }

  const allRoutePlans = [...routePlans, ...scenarioRoutePlans];
  let distances = walkDistances(tiles, heights, width, height, playerStart);
  let routeRepaired = false;
  for (const [index, route] of allRoutePlans.entries()) {
    if (!routeReachable(distances, width, route)) {
      carveRoute(tiles, heights, surfaces, width, height, route, 2, salt + 101 + index, false);
      routeRepaired = true;
    }
  }
  if (routeRepaired) distances = walkDistances(tiles, heights, width, height, playerStart);
  if (distances[idx(enemyStart.x, enemyStart.y, width)] < 0) {
    carveRoute(tiles, heights, surfaces, width, height, [playerStart, enemyStart], 2, salt, false);
    distances = walkDistances(tiles, heights, width, height, playerStart);
  }

  const initialRouteLengths = allRoutePlans.map((route) => routeLength(route));
  const initialBaseline = Math.min(...initialRouteLengths);
  const initialAlternate = Math.max(...initialRouteLengths);
  if (initialBaseline > 0 && initialAlternate > initialBaseline * 1.8) {
    const dx = enemyStart.x - playerStart.x;
    const dy = enemyStart.y - playerStart.y;
    const lineLength = Math.hypot(dx, dy) || 1;
    const offset = Math.round(Math.min(width, height) * 0.06);
    const fallbackRoute: Vec2[] = [
      playerStart,
      {
        x: Math.max(2, Math.min(width - 3, Math.round((playerStart.x + enemyStart.x) / 2 - (dy / lineLength) * offset))),
        y: Math.max(2, Math.min(height - 3, Math.round((playerStart.y + enemyStart.y) / 2 + (dx / lineLength) * offset))),
      },
      enemyStart,
    ];
    carveRoute(tiles, heights, surfaces, width, height, fallbackRoute, 1, salt + 401, false);
    routePlans.push(fallbackRoute);
    distances = walkDistances(tiles, heights, width, height, playerStart);
  }

  pruneWaterIslands(tiles, width, height, heights);

  // 7. Landmark-Shaped Resource Distribution
  const resourceRace = profile.variant === "resourceRace";
  const forwardIndustry = profile.variant === "forwardIndustry";
  const totalPatches =
    5 +
    mission.index +
    (mission.win.kind === "harvestQuota" ? 3 : 0) +
    (resourceRace ? 2 : 0) -
    (forwardIndustry ? 1 : 0);

  generateLandmarkResourceVeins(
    tiles,
    heights,
    resourceAmount,
    surfaces,
    width,
    height,
    distances,
    landmark,
    playerStart,
    enemyStart,
    totalPatches,
    rng,
  );

  for (const [routeSalt, carveSalt] of [[137, 149], [173, 185], [211, 223]] as const) {
    if (surfaces.filter((s) => s === 1).length > width * 2) break;
    const extraRoute = meanderingRoute(playerStart, enemyStart, width, height, salt + routeSalt);
    carveRoute(tiles, heights, surfaces, width, height, extraRoute, 1, salt + carveSalt);
  }

  for (let i = 0; i < resourceAmount.length; i += 1) {
    if (tiles[i] !== TILE_RESOURCE) resourceAmount[i] = 0;
  }

  // 8. Marked Targets (destroyMarked)
  const towardEnemy = {
    x: Math.sign(enemyStart.x - playerStart.x),
    y: Math.sign(enemyStart.y - playerStart.y),
  };
  const towardPlayer = { x: -towardEnemy.x, y: -towardEnemy.y };
  const targetLateral = { x: -towardPlayer.y, y: towardPlayer.x };
  const markedSpots: Vec2[] = [];
  const markCount = mission.win.kind === "destroyMarked" ? mission.win.targetCount ?? 1 : 0;
  const markedDepth = profile.variant === "siege" ? 12 : 10;
  const markedSpacing = profile.variant === "siege" ? 4 : 3;

  for (let m = 0; m < markCount; m++) {
    const laneOffset = (m % 2 === 0 ? -1 : 1) * (profile.variant === "siege" ? 3 : 2);
    const spot = clampPoint(
      {
        x: enemyStart.x + towardPlayer.x * (markedDepth + m * markedSpacing) + targetLateral.x * laneOffset,
        y: enemyStart.y + towardPlayer.y * (markedDepth + m * markedSpacing) + targetLateral.y * laneOffset,
      },
      width,
      height,
    );
    paintBase(tiles, heights, surfaces, width, height, spot, 3);
    markedSpots.push(spot);
  }
  if (markCount > 0) {
    pruneWaterIslands(tiles, width, height, heights);
  }

  for (let i = 0; i < resourceAmount.length; i += 1) {
    if (tiles[i] !== TILE_RESOURCE) resourceAmount[i] = 0;
  }

  const requiredResources = Math.max(
    14_000 + mission.index * 3_000,
    mission.win.kind === "harvestQuota" ? Math.ceil((mission.win.target ?? 0) * 1.5) : 0,
  );
  const resourceTiles = resourceAmount.map((amount, i) => (amount > 0 ? i : -1)).filter((i) => i >= 0);
  let totalResources = resourceAmount.reduce((sum, amount) => sum + amount, 0);
  for (let i = 0; totalResources < requiredResources && resourceTiles.length; i++) {
    const ri = resourceTiles[i % resourceTiles.length]!;
    const add = Math.min(250, requiredResources - totalResources);
    resourceAmount[ri] = (resourceAmount[ri] ?? 0) + add;
    totalResources += add;
  }

  distances = walkDistances(tiles, heights, width, height, playerStart);
  const affordances = computeMapAffordances(distances, resourceAmount, routePlans, playerStart, enemyStart, width);

  return {
    width,
    height,
    tiles,
    heights,
    surfaces,
    biome,
    resourceAmount,
    playerStart,
    enemyStart,
    enemyOutposts,
    markedSpots,
    profileVariant: profile.variant,
    affordances,
    spawnTopology: topology,
    landmark: landmarkKind,
  };
}

export * from "./generator/index";
