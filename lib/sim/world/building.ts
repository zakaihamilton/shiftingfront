import { footprintOf } from "../../catalog";
import { isBuildingEntity, type BuildingEntity, type BuildingKind, type Owner, type SimState, type Vec2 } from "../../types";
import { heightAt, inBounds } from "./queries";
import { isWalkable, terrainAccess } from "./terrain";
import { entitiesFor } from "../entities";

export function footprintFlat(state: SimState, x: number, y: number, w: number, h: number): boolean {
  const h0 = heightAt(state, x, y);
  for (let oy = 0; oy < h; oy++) {
    for (let ox = 0; ox < w; ox++) {
      if (!inBounds(state, x + ox, y + oy)) return false;
      if (heightAt(state, x + ox, y + oy) !== h0) return false;
    }
  }
  return true;
}

export const BUILDING_PLACEMENT_RADIUS = 8;
export const BUILDING_CLEARANCE = 1;
export const DEFAULT_BUILDING_CLEARANCE = 2;
export const INITIAL_BUILDING_EDGE_MARGIN = 3;

function withinMapMargin(
  state: SimState,
  x: number,
  y: number,
  w: number,
  h: number,
  edgeMargin: number,
): boolean {
  return (
    x >= edgeMargin &&
    y >= edgeMargin &&
    x + w <= state.width - edgeMargin &&
    y + h <= state.height - edgeMargin
  );
}

function hasBuildingClearance(
  state: SimState,
  x: number,
  y: number,
  w: number,
  h: number,
  clearance = BUILDING_CLEARANCE,
): boolean {
  const left = x - clearance;
  const top = y - clearance;
  const right = x + w + clearance;
  const bottom = y + h + clearance;

  for (const building of entitiesFor(state)) {
    if (building.hp <= 0 || !isBuildingEntity(building)) continue;
    const fp = footprintOf(building.kind);
    const separated =
      building.x >= right ||
      building.x + fp.w <= left ||
      building.y >= bottom ||
      building.y + fp.h <= top;
    if (!separated) return false;
  }
  return true;
}

function buildingNetworkDistance(
  state: SimState,
  owner: Owner,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  let nearest = Infinity;
  for (const building of entitiesFor(state)) {
    if (building.hp <= 0 || !isBuildingEntity(building) || building.owner !== owner) continue;
    const fp = footprintOf(building.kind);
    const dx = Math.max(building.x - (x + w), x - (building.x + fp.w), 0);
    const dy = Math.max(building.y - (y + h), y - (building.y + fp.h), 0);
    nearest = Math.min(nearest, Math.hypot(dx, dy));
  }
  return nearest;
}

export function canPlaceBuilding(
  state: SimState,
  kind: BuildingKind,
  x: number,
  y: number,
  owner: Owner = 0,
  requireNetwork = true,
  minClearance = BUILDING_CLEARANCE,
  edgeMargin = 0,
): boolean {
  const fp = footprintOf(kind);
  if (edgeMargin > 0 && !withinMapMargin(state, x, y, fp.w, fp.h, edgeMargin)) return false;
  if (!hasBuildingClearance(state, x, y, fp.w, fp.h, minClearance)) return false;
  if (requireNetwork && buildingNetworkDistance(state, owner, x, y, fp.w, fp.h) > BUILDING_PLACEMENT_RADIUS) return false;
  for (let oy = 0; oy < fp.h; oy++) {
    for (let ox = 0; ox < fp.w; ox++) {
      const tx = x + ox;
      const ty = y + oy;
      if (!inBounds(state, tx, ty)) return false;
      if (!terrainAccess(state, tx, ty).buildable) return false;
    }
  }
  return footprintFlat(state, x, y, fp.w, fp.h);
}

export function findBuildSite(
  state: SimState,
  kind: BuildingKind,
  nearX: number,
  nearY: number,
  maxR = 12,
  owner: Owner = 0,
  requireNetwork = true,
  minClearance = DEFAULT_BUILDING_CLEARANCE,
  edgeMargin = 0,
  siteFilter?: (x: number, y: number) => boolean,
): Vec2 | undefined {
  const cx = Math.round(nearX);
  const cy = Math.round(nearY);
  const canUseSite = (x: number, y: number) =>
    canPlaceBuilding(state, kind, x, y, owner, requireNetwork, minClearance, edgeMargin)
    && (siteFilter?.(x, y) ?? true);
  if (canUseSite(cx, cy)) return { x: cx, y: cy };
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (canUseSite(x, y)) return { x, y };
      }
    }
  }
  if (minClearance > BUILDING_CLEARANCE) {
    return findBuildSite(state, kind, nearX, nearY, maxR, owner, requireNetwork, BUILDING_CLEARANCE, edgeMargin, siteFilter);
  }
  return undefined;
}

export function openTileNear(
  state: SimState,
  x: number,
  y: number,
  fw = 1,
  fh = 1,
): { x: number; y: number } {
  const originH = heightAt(state, x, y);
  for (let r = 1; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        const inside = nx >= x && nx < x + fw && ny >= y && ny < y + fh;
        if (inside) continue;
        if (!isWalkable(state, nx, ny)) continue;
        if (Math.abs(heightAt(state, nx, ny) - originH) > 1) continue;
        return { x: nx, y: ny };
      }
    }
  }
  return { x, y };
}

function spawnCandidateOk(state: SimState, x: number, y: number, originH: number): boolean {
  if (!isWalkable(state, x, y)) return false;
  return Math.abs(heightAt(state, x, y) - originH) <= 1;
}

export function frontTileNear(state: SimState, e: BuildingEntity): Vec2 {
  const fp = footprintOf(e.kind);
  const x0 = Math.round(e.x);
  const y0 = Math.round(e.y);
  const originH = heightAt(state, x0, y0);
  const seen = new Set<string>();
  const front: Vec2[] = [];
  const behind: Vec2[] = [];
  const push = (list: Vec2[], x: number, y: number) => {
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push({ x, y });
  };

  const midX = Math.floor(fp.w / 2);
  const midY = Math.floor(fp.h / 2);
  push(front, x0 + midX, y0 + fp.h);
  for (let ox = 0; ox < fp.w; ox++) push(front, x0 + ox, y0 + fp.h);
  push(front, x0 + fp.w, y0 + fp.h);
  push(front, x0 + fp.w, y0 + midY);
  for (let oy = fp.h - 1; oy >= 0; oy--) push(front, x0 + fp.w, y0 + oy);
  for (let ox = 0; ox < fp.w; ox++) push(behind, x0 + ox, y0 - 1);
  for (let oy = 0; oy < fp.h; oy++) push(behind, x0 - 1, y0 + oy);
  push(behind, x0 - 1, y0 + fp.h);
  push(behind, x0 + fp.w, y0 - 1);
  push(behind, x0 - 1, y0 - 1);

  for (const candidate of front) {
    if (spawnCandidateOk(state, candidate.x, candidate.y, originH)) return candidate;
  }
  for (const candidate of behind) {
    if (spawnCandidateOk(state, candidate.x, candidate.y, originH)) return candidate;
  }
  return openTileNear(state, e.x, e.y, fp.w, fp.h);
}
