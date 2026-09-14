import { footprintOf, NEW_MISSION_KINDS } from "../../../lib/catalog";
import { createCampaign } from "../../../lib/gen/campaign";
import { generateMap, mapSizeForMission } from "../../../lib/gen/map";
import { createMission } from "../../../lib/sim/api";
import { inRescueFlank } from "../../../lib/gen/map/generator/rescuePlacement";
import { canClimb, distToEntity, footprintFlat, inBounds, isStaticWalkable, terrainAccess } from "../../../lib/sim/world";
import { diagonalCornerBlocked, PATH_DIRS } from "../../../lib/sim/pathfinding";
import type { Entity, MissionKind, SimState, Vec2 } from "../../../lib/types";

export const SEED_COUNT = 10_000;
export const EXHAUSTIVE_TEST_TIMEOUT = 180_000;
export const IS_COVERAGE = Boolean(process.env.NODE_V8_COVERAGE || process.env.VITEST_COVERAGE);
export const SCENARIO_SAMPLE_COUNT = 1_024;
export const REPRESENTATIVE_SEEDS = Array.from(
  { length: SCENARIO_SAMPLE_COUNT },
  (_, index) => Math.floor((index * (SEED_COUNT - 1)) / (SCENARIO_SAMPLE_COUNT - 1)),
);
export const SCENARIO_KINDS = new Set<MissionKind>(["escort", "sabotage", "rescue", "extraction"]);

function reachableCells(state: SimState, from: Vec2): Uint8Array {
  const startX = Math.round(from.x);
  const startY = Math.round(from.y);
  const seen = new Uint8Array(state.width * state.height);
  const queue = new Int32Array(state.width * state.height);
  let head = 0;
  let tail = 0;
  const startKey = startY * state.width + startX;
  seen[startKey] = 1;
  queue[tail++] = startKey;

  while (head < tail) {
    const currentKey = queue[head++]!;
    const currentX = currentKey % state.width;
    const currentY = Math.floor(currentKey / state.width);
    for (const dir of PATH_DIRS) {
      const nextX = currentX + dir.x;
      const nextY = currentY + dir.y;
      if (!inBounds(state, nextX, nextY)) continue;
      const index = nextY * state.width + nextX;
      if (seen[index] || !isStaticWalkable(state, nextX, nextY)) continue;
      if (!canClimb(state, currentX, currentY, nextX, nextY)) continue;
      if (diagonalCornerBlocked(state, currentX, currentY, nextX, nextY)) continue;
      seen[index] = 1;
      queue[tail++] = index;
    }
  }
  return seen;
}

function reachableTarget(state: SimState, seen: Uint8Array, target: Entity): boolean {
  if (target.class !== "building") {
    const x = Math.round(target.x);
    const y = Math.round(target.y);
    return inBounds(state, x, y) && seen[y * state.width + x] === 1;
  }
  const footprint = footprintOf(target.kind as Parameters<typeof footprintOf>[0]);
  for (let y = target.y - 1; y <= target.y + footprint.h; y++) {
    for (let x = target.x - 1; x <= target.x + footprint.w; x++) {
      const inside = x >= target.x && x < target.x + footprint.w && y >= target.y && y < target.y + footprint.h;
      if (inside || !inBounds(state, x, y) || !isStaticWalkable(state, x, y)) continue;
      if (seen[y * state.width + x] === 1) return true;
    }
  }
  return false;
}

function livingEntity(state: SimState, id: number): Entity | undefined {
  return state.entities.find((entity) => entity.id === id && entity.hp > 0);
}

function assertExtractionDistribution(state: SimState, targetIds: number[], seed: number, missionIndex: number): void {
  const targets = targetIds
    .map((id) => livingEntity(state, id))
    .filter((target): target is Entity => target !== undefined);
  const playerBuildings = state.entities.filter((entity) => entity.owner === 0 && entity.class === "building" && entity.hp > 0);
  const enemyBuildings = state.entities.filter((entity) => entity.owner === 1 && entity.class === "building" && entity.hp > 0);
  const pairDistances = targets.flatMap((target, index) => targets
    .slice(index + 1)
    .map((other) => Math.hypot(target.x - other.x, target.y - other.y)));
  const minimumSeparation = Math.min(...pairDistances);
  const maximumSeparation = Math.max(...pairDistances);
  if (minimumSeparation < 6) {
    throw new Error(`Seed ${seed} mission ${missionIndex} clustered extraction targets at ${minimumSeparation.toFixed(1)} tiles`);
  }
  if (maximumSeparation < state.width * 0.25) {
    throw new Error(`Seed ${seed} mission ${missionIndex} did not spread extraction targets across the map`);
  }
  if (targets.some((target) => playerBuildings.some((building) => distToEntity(target, building) < 8))) {
    throw new Error(`Seed ${seed} mission ${missionIndex} placed extraction cargo too close to the player base`);
  }
  if (targets.some((target) => enemyBuildings.some((building) => distToEntity(target, building) < 14))) {
    throw new Error(`Seed ${seed} mission ${missionIndex} placed extraction cargo too close to the enemy base`);
  }
  if (targets.length < 3) return;

  let maximumTriangleArea = 0;
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      for (let k = j + 1; k < targets.length; k += 1) {
        const first = targets[i]!;
        const second = targets[j]!;
        const third = targets[k]!;
        maximumTriangleArea = Math.max(
          maximumTriangleArea,
          Math.abs(
            (second.x - first.x) * (third.y - first.y)
              - (second.y - first.y) * (third.x - first.x),
          ),
        );
      }
    }
  }
  if (maximumTriangleArea < 9) {
    throw new Error(`Seed ${seed} mission ${missionIndex} placed extraction cargo on one line`);
  }
}

export function assertCampaignTopology(start: number, end: number): void {
  for (let seed = start; seed < end; seed++) {
    const campaign = createCampaign(seed);
    const missions = campaign.missions;
    const kinds = missions.map((mission) => mission.win.kind);
    const scenarioKinds = kinds.filter((kind) => SCENARIO_KINDS.has(kind));
    const classicKinds = kinds.filter((kind) => !NEW_MISSION_KINDS.includes(kind as typeof NEW_MISSION_KINDS[number]));

    if (missions.length !== 6) throw new Error(`Seed ${seed} generated ${missions.length} missions`);
    if (new Set(kinds).size !== 6) throw new Error(`Seed ${seed} generated duplicate mission kinds`);
    if (scenarioKinds.length !== 3 || new Set(scenarioKinds).size !== 3) {
      throw new Error(`Seed ${seed} generated invalid scenario mix: ${scenarioKinds.join(", ")}`);
    }
    if (classicKinds.length !== 3 || new Set(classicKinds).size !== 3) {
      throw new Error(`Seed ${seed} generated invalid classic mix: ${classicKinds.join(", ")}`);
    }
    if (missions.some((mission) => mission.biome !== campaign.world.biome)) {
      throw new Error(`Seed ${seed} generated a mission outside campaign biome ${campaign.world.biome}`);
    }
    for (const [index, mission] of missions.entries()) {
      if (mission.index !== index || mission.mapSize !== mapSizeForMission(index) || mission.kind !== mission.win.kind) {
        throw new Error(`Seed ${seed} generated inconsistent mission metadata at index ${index}`);
      }
    }
  }
}

export function assertScenarioTargets(start: number, end: number): void {
  for (const seed of REPRESENTATIVE_SEEDS.slice(start, end)) {
    const campaign = createCampaign(seed);
    for (const mission of campaign.missions) {
      if (!SCENARIO_KINDS.has(mission.win.kind)) continue;
      const state = createMission({ seed, missionIndex: mission.index });
      const rescueMap = mission.win.kind === "rescue" ? generateMap(seed, mission) : undefined;
      const targetIds = state.runtime?.targetIds ?? [];
      const expected = mission.win.targetCount ?? 0;
      if (targetIds.length !== expected || state.runtime?.required !== expected) {
        throw new Error(`Seed ${seed} mission ${mission.index} spawned ${targetIds.length}/${expected} targets`);
      }

      const playerUnit = state.entities.find((entity) => entity.owner === 0 && entity.class === "unit" && !entity.neutral);
      if (!playerUnit) throw new Error(`Seed ${seed} mission ${mission.index} has no player unit`);
      const reachableFromPlayer = reachableCells(state, playerUnit);
      for (const id of targetIds) {
        const target = livingEntity(state, id);
        if (!target) throw new Error(`Seed ${seed} mission ${mission.index} has missing target ${id}`);
        const x = Math.round(target.x);
        const y = Math.round(target.y);
        const footprint = target.class === "building"
          ? footprintOf(target.kind as Parameters<typeof footprintOf>[0])
          : { w: 1, h: 1 };
        const validSpawn = Array.from({ length: footprint.h }, (_, oy) =>
          Array.from({ length: footprint.w }, (_, ox) => {
            const tx = x + ox;
            const ty = y + oy;
            const access = inBounds(state, tx, ty) ? terrainAccess(state, tx, ty) : undefined;
            return target.class === "building" ? access?.buildable === true : access?.traversable === true;
          }).every(Boolean),
        ).every(Boolean) && footprintFlat(state, x, y, footprint.w, footprint.h);
        if (!validSpawn) {
          throw new Error(`Seed ${seed} mission ${mission.index} placed target ${id} on invalid terrain`);
        }
        if (!reachableTarget(state, reachableFromPlayer, target)) {
          throw new Error(`Seed ${seed} mission ${mission.index} placed unreachable target ${id}`);
        }
        if (mission.win.kind === "rescue" && rescueMap && !inRescueFlank(rescueMap, target.x, target.y)) {
          throw new Error(`Seed ${seed} mission ${mission.index} staged rescue target ${id} outside mirrored flank`);
        }
      }
      if (mission.win.kind === "extraction") {
        assertExtractionDistribution(state, targetIds, seed, mission.index);
      }
    }
  }
}
