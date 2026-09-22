import type { MapSpawnTopology, Vec2 } from "../../../types";
import { createRng, type Rng } from "../../../seed/rng";
import type { MapCorner } from "./types";

export const ALL_SPAWN_TOPOLOGIES: readonly MapSpawnTopology[] = [
  "corner-nw-se",
  "corner-se-nw",
  "corner-sw-ne",
  "corner-ne-sw",
  "edge-w-e",
  "edge-e-w",
  "edge-n-s",
  "edge-s-n",
  "center-player",
  "center-enemy",
];

export function pickSpawnTopology(seed: number, missionIndex: number): MapSpawnTopology {
  const rng = createRng(seed, `spawn-topology:${missionIndex}`);
  return ALL_SPAWN_TOPOLOGIES[rng.int(ALL_SPAWN_TOPOLOGIES.length)]!;
}

export type SpawnResolution = {
  playerStart: Vec2;
  enemyStart: Vec2;
  topology: MapSpawnTopology;
  enemyOutposts?: Vec2[];
};

export function resolveDynamicSpawns(
  topology: MapSpawnTopology,
  width: number,
  height: number,
  rng: Rng,
): SpawnResolution {
  const insetMin = 6;
  const insetMax = 8;
  const pJitterX = rng.int(3);
  const pJitterY = rng.int(3);
  const eJitterX = rng.int(3);
  const eJitterY = rng.int(3);

  const nw: Vec2 = { x: insetMin + pJitterX, y: insetMin + pJitterY };
  const se: Vec2 = { x: width - 1 - (insetMax + eJitterX), y: height - 1 - (insetMax + eJitterY) };
  const sw: Vec2 = { x: insetMin + pJitterX, y: height - 1 - (insetMax + pJitterY) };
  const ne: Vec2 = { x: width - 1 - (insetMax + eJitterX), y: insetMin + eJitterY };

  const westEdge: Vec2 = { x: insetMin + pJitterX, y: Math.round(height / 2) + rng.int(5) - 2 };
  const eastEdge: Vec2 = { x: width - 1 - (insetMax + eJitterX), y: Math.round(height / 2) + rng.int(5) - 2 };
  const northEdge: Vec2 = { x: Math.round(width / 2) + rng.int(5) - 2, y: insetMin + pJitterY };
  const southEdge: Vec2 = { x: Math.round(width / 2) + rng.int(5) - 2, y: height - 1 - (insetMax + eJitterY) };

  const center: Vec2 = { x: Math.round(width / 2), y: Math.round(height / 2) };

  switch (topology) {
    case "corner-nw-se":
      return { playerStart: clampPoint(nw, width, height), enemyStart: clampPoint(se, width, height), topology };
    case "corner-se-nw":
      return { playerStart: clampPoint(se, width, height), enemyStart: clampPoint(nw, width, height), topology };
    case "corner-sw-ne":
      return { playerStart: clampPoint(sw, width, height), enemyStart: clampPoint(ne, width, height), topology };
    case "corner-ne-sw":
      return { playerStart: clampPoint(ne, width, height), enemyStart: clampPoint(sw, width, height), topology };
    case "edge-w-e":
      return { playerStart: clampPoint(westEdge, width, height), enemyStart: clampPoint(eastEdge, width, height), topology };
    case "edge-e-w":
      return { playerStart: clampPoint(eastEdge, width, height), enemyStart: clampPoint(westEdge, width, height), topology };
    case "edge-n-s":
      return { playerStart: clampPoint(northEdge, width, height), enemyStart: clampPoint(southEdge, width, height), topology };
    case "edge-s-n":
      return { playerStart: clampPoint(southEdge, width, height), enemyStart: clampPoint(northEdge, width, height), topology };
    case "center-player": {
      // Player defends the center, enemy has main base on perimeter plus 2 perimeter outpost garrisons
      const mainEnemy = southEdge;
      const outpost1 = clampPoint(northEdge, width, height);
      const outpost2 = clampPoint(westEdge, width, height);
      return {
        playerStart: clampPoint(center, width, height),
        enemyStart: clampPoint(mainEnemy, width, height),
        enemyOutposts: [outpost1, outpost2],
        topology,
      };
    }
    case "center-enemy": {
      // Player assaults the enemy stronghold in the center
      const playerPos = nw;
      return {
        playerStart: clampPoint(playerPos, width, height),
        enemyStart: clampPoint(center, width, height),
        topology,
      };
    }
    default:
      return { playerStart: clampPoint(nw, width, height), enemyStart: clampPoint(se, width, height), topology: "corner-nw-se" };
  }
}

export function startPointForCorner(
  corner: MapCorner,
  width: number,
  height: number,
  xInset: number,
  yInset: number,
): Vec2 {
  return {
    x: corner === "bottomLeft" ? xInset : width - 1 - xInset,
    y: corner === "topRight" ? yInset : height - 1 - yInset,
  };
}

export function clampPoint(point: Vec2, width: number, height: number): Vec2 {
  return {
    x: Math.max(3, Math.min(width - 4, Math.round(point.x))),
    y: Math.max(3, Math.min(height - 4, Math.round(point.y))),
  };
}

export function mapSizeForMission(index: number): number {
  if (index <= 1) return 48;
  if (index <= 3) return 72;
  return 96;
}
