import type { GeneratedMap } from "../../gen/map";
import { clampPoint } from "../../gen/map/generator/placement";
import { inRescueFlank, rescueFlankCenter } from "../../gen/map/generator/rescuePlacement";
import type { Rng } from "../../seed/rng";
import { inObjectiveZone, RESCUE_CONTACT_RADIUS } from "../../types";
import type { Entity, SimState, Vec2 } from "../../types";
import { tileInPlayerVision } from "../fog";
import { tryFindPathDetailed } from "../pathBudget";
import { routePendingFor } from "../pathfinding";
import { closestApproach, distToEntity, isWalkable } from "../world";

const EXTRACTION_PLAYER_BASE_CLEARANCE = 8;
const EXTRACTION_ENEMY_BASE_CLEARANCE = 14;
const EXTRACTION_TARGET_SEPARATION = 6;
const RESCUE_TARGET_SEPARATION = 6;

type ExtractionRegion = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  center: { x: number; y: number };
};

const EXTRACTION_REGIONS: readonly ExtractionRegion[] = [
  { minX: 0.18, maxX: 0.48, minY: 0.18, maxY: 0.48, center: { x: 0.33, y: 0.33 } },
  { minX: 0.52, maxX: 0.82, minY: 0.18, maxY: 0.48, center: { x: 0.67, y: 0.33 } },
  { minX: 0.18, maxX: 0.48, minY: 0.52, maxY: 0.82, center: { x: 0.33, y: 0.67 } },
  { minX: 0.52, maxX: 0.82, minY: 0.52, maxY: 0.82, center: { x: 0.67, y: 0.67 } },
];

const EXTRACTION_REGION_ORDERS: readonly (readonly number[])[] = [
  [0, 3, 1, 2],
  [1, 2, 0, 3],
];

export function rescuePoint(
  map: Pick<GeneratedMap, "enemyStart" | "width" | "height">,
  index: number,
  count: number,
): Vec2 {
  const center = rescueFlankCenter(map);
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const column = index % columns;
  const row = Math.floor(index / columns);
  const horizontalDirection = map.enemyStart.x >= map.width / 2 ? 1 : -1;
  const verticalDirection = map.enemyStart.y < map.height / 2 ? 1 : -1;
  const horizontalSpan = Math.max(6, Math.round(map.width * 0.2));
  const verticalSpan = Math.max(6, Math.round(map.height * 0.2));
  const horizontalOffset = columns <= 1 ? 0 : Math.round((column / (columns - 1)) * horizontalSpan);
  const verticalOffset = rows <= 1 ? 0 : Math.round((row / (rows - 1)) * verticalSpan);
  return clampPoint({
    x: center.x + horizontalDirection * horizontalOffset,
    y: center.y + verticalDirection * verticalOffset,
  }, map.width, map.height);
}

function rescuePointCandidates(
  state: SimState,
  map: Pick<GeneratedMap, "enemyStart" | "width" | "height">,
  reachable: Uint8Array | undefined,
): Vec2[] {
  const candidates: Vec2[] = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (reachable && reachable[y * map.width + x] !== 1) continue;
      if (!inRescueFlank(map, x, y) || !isWalkable(state, x, y) || tileInPlayerVision(state, x, y)) continue;
      candidates.push({ x, y });
    }
  }
  return candidates;
}

function nearestRescueCandidate(
  candidates: readonly Vec2[],
  desired: Vec2,
  selected: readonly Vec2[],
  minimumSeparation: number,
): Vec2 | undefined {
  let best: Vec2 | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (selected.some((point) => point.x === candidate.x && point.y === candidate.y)) continue;
    if (selected.some((point) => pointDistance(candidate, point) < minimumSeparation)) continue;
    const distance = pointDistance(candidate, desired);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** Selects reachable rescue targets across the mirrored enemy flank. */
export function rescuePoints(
  state: SimState,
  map: Pick<GeneratedMap, "enemyStart" | "width" | "height">,
  count: number,
  reachable: Uint8Array | undefined,
): Vec2[] {
  const candidates = rescuePointCandidates(state, map, reachable);
  const selected: Vec2[] = [];
  for (let index = 0; index < count; index += 1) {
    const point = nearestRescueCandidate(
      candidates,
      rescuePoint(map, index, count),
      selected,
      RESCUE_TARGET_SEPARATION,
    );
    if (!point) break;
    selected.push(point);
  }
  return selected;
}

function extractionRegionContains(region: ExtractionRegion, point: Vec2, width: number, height: number): boolean {
  const x = point.x / Math.max(1, width - 1);
  const y = point.y / Math.max(1, height - 1);
  return x >= region.minX && x <= region.maxX && y >= region.minY && y <= region.maxY;
}

function pointDistance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function minDistanceToPoints(point: Vec2, points: readonly Vec2[]): number {
  return points.length ? Math.min(...points.map((other) => pointDistance(point, other))) : Infinity;
}

function extractionPointCandidates(
  state: SimState,
  map: Pick<GeneratedMap, "playerStart" | "enemyStart" | "width" | "height">,
  reachable: Uint8Array | undefined,
): Vec2[] {
  const playerBuildings = state.entities.filter((entity) =>
    entity.owner === 0 && entity.class === "building" && entity.hp > 0,
  );
  const enemyBuildings = state.entities.filter((entity) =>
    entity.owner === 1 && entity.class === "building" && entity.hp > 0,
  );
  const candidates: Vec2[] = [];
  for (let y = 3; y < map.height - 3; y += 1) {
    for (let x = 3; x < map.width - 3; x += 1) {
      const point = { x, y };
      if (reachable && reachable[y * map.width + x] !== 1) continue;
      if (!isWalkable(state, x, y) || tileInPlayerVision(state, x, y)) continue;
      if (pointDistance(point, map.playerStart) < EXTRACTION_PLAYER_BASE_CLEARANCE) continue;
      if (playerBuildings.some((building) => distToEntity(point, building) < EXTRACTION_PLAYER_BASE_CLEARANCE)) continue;
      if (pointDistance(point, map.enemyStart) < EXTRACTION_ENEMY_BASE_CLEARANCE) continue;
      if (enemyBuildings.some((building) => distToEntity(point, building) < EXTRACTION_ENEMY_BASE_CLEARANCE)) continue;
      candidates.push(point);
    }
  }
  return candidates;
}

function nearestCandidate(
  candidates: readonly Vec2[],
  region: ExtractionRegion | undefined,
  selected: readonly Vec2[],
  basePoints: readonly Vec2[],
  width: number,
  height: number,
  enforceSeparation: boolean,
): Vec2 | undefined {
  let best: Vec2 | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (selected.some((point) => point.x === candidate.x && point.y === candidate.y)) continue;
    if (region && !extractionRegionContains(region, candidate, width, height)) continue;
    if (enforceSeparation && minDistanceToPoints(candidate, selected) < EXTRACTION_TARGET_SEPARATION) continue;
    const distance = region
      ? Math.hypot(
        candidate.x - region.center.x * (width - 1),
        candidate.y - region.center.y * (height - 1),
      )
      : -minDistanceToPoints(candidate, [...basePoints, ...selected]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/**
 * Selects extraction cargo locations from distinct map regions instead of
 * placing every target along the player-to-enemy centerline.
 */
export function extractionPoints(
  state: SimState,
  map: Pick<GeneratedMap, "playerStart" | "enemyStart" | "width" | "height">,
  count: number,
  reachable: Uint8Array | undefined,
  rng: Rng,
): Vec2[] {
  const candidates = extractionPointCandidates(state, map, reachable);
  const placementRng = rng.fork("extraction-placement");
  const order = EXTRACTION_REGION_ORDERS[placementRng.int(EXTRACTION_REGION_ORDERS.length)]!;
  const selected: Vec2[] = [];
  const usedRegions = new Set<number>();
  const basePoints = [map.playerStart, map.enemyStart];

  for (const regionIndex of order.slice(0, count)) {
    let chosenRegion = regionIndex;
    let point = nearestCandidate(
      candidates,
      usedRegions.has(regionIndex) ? undefined : EXTRACTION_REGIONS[regionIndex],
      selected,
      basePoints,
      map.width,
      map.height,
      true,
    );
    if (!point) {
      for (const alternativeIndex of order) {
        if (usedRegions.has(alternativeIndex) || alternativeIndex === regionIndex) continue;
        point = nearestCandidate(
          candidates,
          EXTRACTION_REGIONS[alternativeIndex],
          selected,
          basePoints,
          map.width,
          map.height,
          true,
        );
        if (point) {
          chosenRegion = alternativeIndex;
          break;
        }
      }
    }
    point = point
      ?? nearestCandidate(candidates, undefined, selected, basePoints, map.width, map.height, true)
      ?? nearestCandidate(candidates, undefined, selected, basePoints, map.width, map.height, false);
    if (!point) break;
    selected.push(point);
    usedRegions.add(chosenRegion);
  }

  return selected;
}

function returnStrandedUnitToBase(state: SimState, unit: Entity, yard: Entity | undefined, zone: Vec2 | undefined): void {
  const destination = yard ? closestApproach(state, unit, yard) : zone;
  if (!destination) return;
  unit.attackTarget = undefined;
  unit.flowGoal = undefined;
  unit.orderMode = "move";
  unit.orderDestination = { x: destination.x, y: destination.y };
  unit.gatherX = undefined;
  unit.gatherY = undefined;
  unit.idle = false;
  const result = tryFindPathDetailed(state, unit, destination);
  if (result) {
    unit.path = result.path;
    unit.routePending = routePendingFor(result.status);
    unit.idle = result.status === "unreachable";
  } else {
    unit.path = [];
    unit.routePending = true;
  }
}

function strandedUnitContacted(target: Entity, rescuers: readonly Entity[]): boolean {
  // Revealing a stranded unit only makes its blue contact halo visible. The
  // rescue starts when a player unit actually enters that halo.
  return rescuers.some((rescuer) => Math.hypot(rescuer.x - target.x, rescuer.y - target.y) <= RESCUE_CONTACT_RADIUS);
}

export function tickRescueExtraction(state: SimState): void {
  const runtime = state.runtime;
  if (!runtime || (runtime.kind !== "rescue" && runtime.kind !== "extraction")) return;

  const yard = state.entities.find((e) => e.owner === 0 && e.kind === "constructionYard" && e.hp > 0);
  if (yard) {
    runtime.zone = { x: yard.x, y: yard.y };
  }

  if (runtime.kind === "rescue" && (runtime.contactedIds !== undefined || runtime.rescuedIds !== undefined)) {
    const contacted = runtime.contactedIds ?? [];
    const rescued = runtime.rescuedIds ?? [];
    const contactedSet = new Set(contacted);
    const rescuedSet = new Set(rescued);

    // Capture this list before contacting targets. A newly contacted target
    // may not contact another stranded unit until the next simulation tick.
    const rescuers = state.entities.filter(
      (e) => e.owner === 0 && e.class === "unit" && e.hp > 0 && !e.neutral && !runtime.targetIds.includes(e.id),
    );
    for (const id of runtime.targetIds) {
      if (contactedSet.has(id)) continue;
      const target = state.entities.find((item) => item.id === id && item.hp > 0);
      if (!target?.neutral) continue;
      target.path = [];
      target.routePending = false;
      target.idle = true;
      if (strandedUnitContacted(target, rescuers)) {
        target.neutral = false;
        returnStrandedUnitToBase(state, target, yard, runtime.zone);
        contacted.push(id);
        contactedSet.add(id);
        runtime.phase = "extraction";
      }
    }

    if (runtime.zone) {
      for (const id of contacted) {
        if (rescuedSet.has(id)) continue;
        const target = state.entities.find((item) => item.id === id && item.hp > 0);
        if (target && !target.neutral && inObjectiveZone(target.x, target.y, runtime.zone)) {
          rescued.push(id);
          rescuedSet.add(id);
        }
      }
    }
    runtime.contactedIds = contacted;
    runtime.rescuedIds = rescued;
    runtime.rescued = rescued.length;
    return;
  }

  // Capture this list before contacting targets. A newly rescued target may
  // not rescue another target until the next simulation tick.
  const rescuers = state.entities.filter(
    (e) => e.owner === 0 && e.class === "unit" && e.hp > 0 && !e.neutral,
  );
  for (const id of runtime.targetIds) {
    const e = state.entities.find((item) => item.id === id && item.hp > 0);
    if (!e?.neutral) continue;
    e.path = [];
    e.routePending = false;
    e.idle = true;
    if (runtime.kind === "rescue" && strandedUnitContacted(e, rescuers)) {
      e.neutral = false;
      returnStrandedUnitToBase(state, e, yard, runtime.zone);
      runtime.rescued += 1;
    } else if (runtime.kind === "extraction" && rescuers.some((rescuer) => Math.hypot(rescuer.x - e.x, rescuer.y - e.y) <= RESCUE_CONTACT_RADIUS)) {
      e.neutral = false;
      runtime.phase = "extraction";
    }
  }

  if (runtime.kind === "extraction" && runtime.zone) {
    const extracted = runtime.extractedIds ?? [];
    for (const id of runtime.targetIds) {
      if (extracted.includes(id)) continue;
      const e = state.entities.find((item) => item.id === id && item.hp > 0);
      if (!e || e.neutral || !inObjectiveZone(e.x, e.y, runtime.zone)) continue;
      extracted.push(id);
      e.marked = false;
    }
    runtime.extractedIds = extracted;
    runtime.rescued = extracted.length;
  }
}
