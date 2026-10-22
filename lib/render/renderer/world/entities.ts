import type { Entity, SimState } from "../../../types";
import { activeProducerFor, isSharedProducerKind } from "../../../sim/producerState";
import { animClock } from "../../anim";
import type { Camera } from "../../../iso";
import { computeUnitDynamicTransform, updateUnitHistory } from "../../gl/unitTransformTracker";
import { terrainLightRigForBiome } from "../../terrainLighting";
import { drawUnitGroundLights, unitLights } from "../../unitLighting";
import { drawUnitTrails, updateUnitTrails } from "../../unitTrails";
import { unitWeaponSockets } from "../../unitVehicleLayers";
import { isPerfHudEnabled, type WorldPhaseTimings } from "../../perfHud";
import { drawFxLayer } from "../../renderCombat";
import { repairTargetIds } from "../../renderOverlays";
import { depthOf, renderDepthOf } from "../../renderEntities";
import {
  drawList,
  entityDrawOrder,
  entityById,
  lastReadySprite,
  spriteSessionKey,
} from "../cache";
import { drawWorldEntity, unitSpriteDrawPosition } from "./drawWorldEntity";

export { unitSpriteDrawPosition };

const UNIT_DEPTH_STABILITY_EPSILON = 0.75;

/**
 * Sort entities by painter depth without letting a tight group of moving
 * units reorder itself as their interpolated positions cross by a fraction of
 * a tile. The near-depth units are sorted as a group after the raw depth sort;
 * doing this in two phases keeps the ordering transitive for groups of three
 * or more units.
 */
export function sortEntitiesForRender(
  entities: Entity[],
  depths: Map<number, number>,
  previousOrder: Map<number, number>,
  stabilityEpsilon = UNIT_DEPTH_STABILITY_EPSILON,
): void {
  entities.sort((a, b) => {
    const delta = depths.get(a.id)! - depths.get(b.id)!;
    return delta || (a.id - b.id);
  });

  let groupStart = 0;
  while (groupStart < entities.length) {
    if (entities[groupStart]!.class !== "unit") {
      groupStart += 1;
      continue;
    }

    let groupEnd = groupStart + 1;
    while (
      groupEnd < entities.length &&
      entities[groupEnd]!.class === "unit" &&
      Math.abs(depths.get(entities[groupEnd]!.id)! - depths.get(entities[groupEnd - 1]!.id)!) <= stabilityEpsilon
    ) {
      groupEnd += 1;
    }

    if (groupEnd - groupStart > 1) {
      const rawOrder = new Map<number, number>();
      for (let index = groupStart; index < groupEnd; index += 1) {
        rawOrder.set(entities[index]!.id, index);
      }
      entities
        .slice(groupStart, groupEnd)
        .sort((a, b) => {
          const orderA = previousOrder.get(a.id) ?? rawOrder.get(a.id)!;
          const orderB = previousOrder.get(b.id) ?? rawOrder.get(b.id)!;
          return orderA - orderB || a.id - b.id;
        })
        .forEach((entity, index) => {
          entities[groupStart + index] = entity;
        });
    }
    groupStart = groupEnd;
  }
}

export function renderEntityPhase(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  selected: Set<number>,
  w: number,
  h: number,
  clock: number | undefined,
  extras: {
    subTickAlpha?: number;
    fx?: import("../../renderOverlays").RenderExtras["fx"];
    reducedMotion?: boolean;
    colorblindMode?: import("../../renderOverlays").RenderExtras["colorblindMode"];
  },
): WorldPhaseTimings | null {
  const profile = isPerfHudEnabled();
  const timings: WorldPhaseTimings = { terrain: 0, fx: 0, entities: 0, combat: 0 };

  const timeMs = animClock(state.tick, clock);

  entityById.clear();
  drawList.length = 0;
  for (const e of state.entities) {
    if (e.hp <= 0) continue;
    entityById.set(e.id, e);
    drawList.push(e);
  }

  // Pre-compute interpolated positions for units so the sort uses visual depth,
  // not coarse integer tile coords.
  updateUnitHistory(state, timeMs);
  const dynCache = new Map<number, ReturnType<typeof computeUnitDynamicTransform>>();
  for (const e of drawList) {
    if (e.class === "unit") {
      dynCache.set(e.id, computeUnitDynamicTransform(e, state, extras.subTickAlpha ?? 0, timeMs, entityById));
    }
  }

  const depthCache = new Map<number, number>();
  for (const e of drawList) {
    depthCache.set(e.id, e.class === "unit" ? renderDepthOf(e, dynCache.get(e.id)) : depthOf(e));
  }

  sortEntitiesForRender(drawList, depthCache, entityDrawOrder);
  drawList.forEach((e, index) => entityDrawOrder.set(e.id, index));

  drawFxLayer(ctx, state, cam, extras.fx, timeMs, "ground", extras.reducedMotion);
  unitWeaponSockets.clear();
  drawUnitTrails(ctx, state, cam, updateUnitTrails(state, dynCache, timeMs, extras.reducedMotion), timeMs);
  const lightRig = terrainLightRigForBiome(state.seed, state.biome);
  const lights = unitLights(state, cam, extras.fx ?? [], timeMs, extras.reducedMotion);
  drawUnitGroundLights(ctx, lights);

  const z = cam.zoom;
  const cullPad = Math.max(128, 140 * z);
  const repairTargets = repairTargetIds(state);
  const activeProducingIds = new Set<number>();
  for (const entity of drawList) {
    if (entity.class !== "building" || !isSharedProducerKind(entity.kind)) continue;
    if (!state.productionQueues?.[entity.owner]?.[entity.kind]?.producing) continue;
    if (activeProducerFor(state, entity.owner, entity.kind)?.id === entity.id) activeProducingIds.add(entity.id);
  }

  const frame = {
    ctx,
    state,
    cam,
    selected,
    w,
    h,
    clock,
    extras,
    timeMs,
    z,
    cullPad,
    dynCache,
    repairTargets,
    activeProducingIds,
    lights,
    lightRig,
  };
  for (const e of drawList) drawWorldEntity(e, frame);
  const currentSessionPrefix = `${spriteSessionKey(state)}:`;
  for (const key of lastReadySprite.keys()) {
    if (!key.startsWith(currentSessionPrefix)) {
      lastReadySprite.delete(key);
      continue;
    }
    const id = Number(key.slice(currentSessionPrefix.length));
    if (!entityById.has(id) || (entityById.get(id)?.hp ?? 0) <= 0) lastReadySprite.delete(key);
  }

  return profile ? timings : null;
}
