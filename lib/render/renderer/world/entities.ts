import { footprintOf, isAirUnit, UNIT_STATS } from "../../../catalog";
import { buildingSprite, unitSprite } from "../../../gen/assets";
import { generateVisualProfile } from "../../../gen/visualProfile";
import type { BuildingKind, Entity, SimState, UnitKind } from "../../../types";
import {
  animClock,
  buildingAnim,
  facingVector,
  selectionPulse,
  unitAnim,
} from "../../anim";
import { TILE_H, tileToScreen, type Camera } from "../../../iso";
import { drawSprite, isRasterReady, rasterize } from "../../sprites";
import { drawUnitShadow, movementDustFill, paintUnitMovementFx } from "../../unitMotion";
import { computeUnitDynamicTransform, updateUnitHistory } from "../../gl/unitTransformTracker";
import { isPerfHudEnabled, type WorldPhaseTimings } from "../../perfHud";
import {
  AIR_UNIT_RENDER_ELEVATION,
  entityElev,
  renderEntityOpacity,
} from "../../renderPicking";
import {
  drawBuildingFx,
  drawBuildingShadow,
  drawHarvestFx,
  drawTurretCannon,
  strokeFootprint,
} from "../../renderStructures";
import {
  drawFxLayer,
  isExtractableUnit,
  isScenarioTarget,
} from "../../renderCombat";
import {
  drawDamageOverlay,
  drawRescueHalo,
  drawUnitAmmoMeter,
  drawUnitGlow,
  drawUnitHealthMeter,
  entityHasWorldAmmoMeter,
  entityHasWorldHealthMeter,
  repairTargetIds,
  worldHealthMeterHeight,
  worldHealthMeterLayout,
} from "../../renderOverlays";
import {
  constructionStage,
  depthOf,
  entityVariant,
  facingFor as resolveFacing,
  renderDepthOf,
} from "../../renderEntities";

import {
  drawList,
  entityDrawOrder,
  entityById,
  lastReadySprite,
  spriteCacheKey,
  spriteSessionKey,
} from "../cache";

export function unitSpriteDrawPosition({
  screenX,
  groundY,
  anchorX,
  anchorY,
  bob,
  recoilX,
  recoilY,
  smooth,
}: {
  screenX: number;
  groundY: number;
  anchorX: number;
  anchorY: number;
  bob: number;
  recoilX: number;
  recoilY: number;
  smooth: boolean;
}): { dx: number; dy: number } {
  const rawX = screenX - anchorX + recoilX;
  const rawY = groundY - anchorY + bob + recoilY;
  return smooth
    ? { dx: rawX, dy: rawY }
    : { dx: Math.round(rawX), dy: Math.round(rawY) };
}

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

  const z = cam.zoom;
  const cullPad = Math.max(128, 140 * z);
  const repairTargets = repairTargetIds(state);

  for (const e of drawList) {
    const entityAlpha = renderEntityOpacity(state, e, timeMs);
    if (entityAlpha <= 0.01) continue;
    let cx = e.x;
    let cy = e.y;
    let elev = entityElev(state, e);
    const uAnim = e.class === "unit" ? unitAnim(e, state.tick, clock) : null;
    const bAnim = e.class === "building" ? buildingAnim(e, state.tick, clock) : null;
    const damageStage = bAnim?.damageStage ?? (e.hp / e.maxHp < 0.34 ? 2 : e.hp / e.maxHp < 0.67 ? 1 : 0);

    if (e.class === "unit") {
      const dyn = dynCache.get(e.id)!;
      cx = dyn.x;
      cy = dyn.y;
      elev = dyn.z + (e.class === "unit" && isAirUnit(e.kind)
        ? AIR_UNIT_RENDER_ELEVATION * dyn.airborneMix
        : 0);
    } else {
      const fp = footprintOf(e.kind as BuildingKind);
      cx = e.x + (fp.w - 1) / 2;
      cy = e.y + (fp.h - 1) / 2;
    }
    const s = tileToScreen(cx, cy, cam, elev);
    if (s.x < -cullPad || s.y < -cullPad || s.x > w + cullPad || s.y > h + cullPad) continue;
    const pal = state.factions[e.owner]!.palette;
    const profile = generateVisualProfile(state.seed, e.owner);
    const dyn = e.class === "unit" ? dynCache.get(e.id) : undefined;
    const aircraft = e.class === "unit" && isAirUnit(e.kind);
    const groundS = aircraft && dyn ? tileToScreen(cx, cy, cam, dyn.z) : s;
    const isWalker = e.class === "unit" && (e.kind === "infantry" || e.kind === "medic" || e.kind === "antiArmor");
    const isVehicle = e.class === "unit" && !isWalker;

    const facing = dyn ? dyn.baseFacing : resolveFacing(state, e, entityById, e.class === "unit" ? { x: cx, y: cy } : undefined);
    const variant = entityVariant(state, e);

    let spec = e.class === "unit"
      ? unitSprite(e.kind as UnitKind, pal, {
          variant,
          facing,
          animationFrame: uAnim?.frame,
          motion: uAnim?.pose === "move" ? "walk" : undefined,
          damageStage,
          profile,
        })
      : buildingSprite(e.kind as BuildingKind, pal, {
          variant,
          damageStage,
          constructionStage: constructionStage(e),
          profile,
        });


    if (isScenarioTarget(state, e)) drawRescueHalo(ctx, s.x, s.y, z, timeMs);
    let img = rasterize(spec);
    const cacheKey = spriteCacheKey(state, e);
    if (spec.imageSrc && !isRasterReady(spec)) {
      const previous = lastReadySprite.get(cacheKey);
      if (previous) {
        spec = previous.spec;
        img = previous.img;
      }
    } else {
      lastReadySprite.set(cacheKey, { spec, img });
    }

    const walkBlend = isWalker && uAnim?.pose === "move" ? Math.max(0, Math.min(1, uAnim.frameBlend ?? 1)) : 1;
    const previousWalkSpec = walkBlend < 1 && uAnim?.previousFrame !== undefined
      ? unitSprite(e.kind as UnitKind, pal, {
          variant,
          facing,
          animationFrame: uAnim.previousFrame,
          motion: "walk",
          damageStage,
          profile,
        })
      : undefined;
    const previousWalkImg = previousWalkSpec ? rasterize(previousWalkSpec) : undefined;
    const previousWalkReady = Boolean(previousWalkSpec && previousWalkImg && isRasterReady(previousWalkSpec));

    const dw = Math.round(spec.w * z);
    const dh = Math.round(spec.h * z);
    const ax = ((spec.anchorX ?? spec.w / 2) / spec.w) * dw;
    const ay = ((spec.anchorY ?? spec.h) / spec.h) * dh;

    const dir = facingVector(facing);
    const recoil = uAnim?.recoil ?? 0;
    const groundX = groundS.x;
    const groundY = groundS.y + (TILE_H / 2) * z;
    // tileToScreen returns the tile's top vertex. Every unit's logical world
    // anchor is the tile center, including the center-pivoted aircraft sprite;
    // the aircraft's extra elevation is already represented by `s.y`.
    const spriteGroundY = s.y + (TILE_H / 2) * z;

    if (e.class === "building") {
      drawBuildingShadow(ctx, state, cam, e, z);
    } else {
      drawUnitShadow(
        ctx,
        e.kind as UnitKind,
        groundX,
        groundY,
        z,
        entityAlpha,
        uAnim?.pose === "move",
        {
          stridePhase: isWalker && dyn ? (uAnim?.stridePhase ?? dyn.stridePhase) : undefined,
        },
      );
    }

    // Walk-sheet art carries the body motion; only the interpolated world
    // position should move the sprite's contact point between render frames.
    const bob = isWalker && uAnim?.pose === "move" && dyn ? (uAnim.bobY ?? dyn.gaitBobY) * z : 0;

    const spritePosition = unitSpriteDrawPosition({
      screenX: s.x,
      groundY: spriteGroundY,
      anchorX: ax,
      anchorY: ay,
      bob,
      recoilX: -dir.x * recoil * 3 * z,
      recoilY: -dir.y * recoil * 3 * z,
      smooth: isWalker && uAnim?.pose === "move",
    });
    const dx = spritePosition.dx;
    const dy = spritePosition.dy;

    if (uAnim?.pose === "move") {
      paintUnitMovementFx(
        ctx,
        e.kind as UnitKind,
        dx,
        dy,
        dw,
        dh,
        spriteGroundY,
        z,
        uAnim.frame,
        entityAlpha,
        {
          strideRatio: uAnim.strideRatio ?? dyn?.strideRatio,
          stridePhase: uAnim.stridePhase ?? dyn?.stridePhase,
          directionX: dir.x,
          directionY: dir.y,
          dustFill: movementDustFill(state.biome),
          reducedMotion: extras.reducedMotion,
          angularVelocity: isVehicle && dyn ? dyn.angularVelocity : undefined,
          footPlantSide: isWalker && dyn ? (uAnim.footPlantSide ?? dyn.footPlantSide) : undefined,
        },
      );
    }

    const spriteReady = !spec.imageSrc || isRasterReady(spec);
    const spriteAlpha = entityAlpha;
    if (spriteReady && isExtractableUnit(state, e)) {
      drawUnitGlow(ctx, spec, img, dx, dy, dw, dh, timeMs, spriteAlpha, z);
    }
    if (spriteReady) {
      if (previousWalkReady && previousWalkSpec && previousWalkImg && walkBlend < 1) {
        ctx.globalAlpha = spriteAlpha * (1 - walkBlend);
        drawSprite(ctx, previousWalkSpec, previousWalkImg, dx, dy, dw, dh);
        ctx.globalAlpha = spriteAlpha * walkBlend;
        drawSprite(ctx, spec, img, dx, dy, dw, dh);
      } else {
        ctx.globalAlpha = spriteAlpha;
        drawSprite(ctx, spec, img, dx, dy, dw, dh);
      }
      ctx.globalAlpha = 1;
    }
    if (spriteReady && e.class !== "building") {
      drawDamageOverlay(
        ctx,
        spec,
        dx,
        dy,
        dw,
        dh,
        damageStage,
        timeMs,
        e.id,
        spriteAlpha,
      );
    }

    if (bAnim) drawBuildingFx(ctx, e, s, z, bAnim, state);
    if ((e.kind === "turret" || e.kind === "antiAirTurret") && e.class === "building") {
      const targetEntity = e.attackTarget !== undefined ? entityById.get(e.attackTarget) : undefined;
      drawTurretCannon(ctx, e, s, z, state, cam, timeMs, targetEntity, extras.colorblindMode);
    }
    if (uAnim?.pose === "work") drawHarvestFx(ctx, state, e, cam, timeMs);

    if (selected.has(e.id)) {
      const pulse = selectionPulse(timeMs);
      ctx.strokeStyle = "#f5e6a8";
      ctx.globalAlpha = 0.6 + pulse * 0.4;
      ctx.lineWidth = 3;
      if (e.class === "building") {
        const fp = footprintOf(e.kind as BuildingKind);
        strokeFootprint(ctx, state, cam, e.x, e.y, fp.w, fp.h);
      } else {
        ctx.beginPath();
        ctx.ellipse(groundS.x, groundS.y + (TILE_H / 2) * z, (16 + pulse * 3) * z, (6 + pulse * 1.5) * z, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (entityHasWorldHealthMeter(e, repairTargets.has(e.id))) {
      const isSelected = selected.has(e.id);
      const { barW, meterY, centerX } = worldHealthMeterLayout(e, spec, dx, dy, s.y, z);
      drawUnitHealthMeter(
        ctx,
        centerX,
        meterY,
        e.hp,
        e.maxHp,
        z,
        spriteAlpha,
        isSelected,
        barW,
        repairTargets.has(e.id),
        extras.colorblindMode,
      );

      let secondaryMeterY = meterY + worldHealthMeterHeight(z) + 4;
      if (entityHasWorldAmmoMeter(e)) {
        const maxAmmo = e.maxAmmo ?? UNIT_STATS.strikePlane.ammoMax ?? 0;
        drawUnitAmmoMeter(
          ctx,
          centerX,
          secondaryMeterY,
          e.ammo ?? maxAmmo,
          maxAmmo,
          z,
          spriteAlpha,
          barW,
        );
        secondaryMeterY += worldHealthMeterHeight(z) + 3;
      }

      if (e.class === "unit" && (e.suppression ?? 0) > 0) {
        const suppW = barW;
        const suppX = Math.round(centerX - suppW / 2);
        const suppY = secondaryMeterY;
        ctx.save();
        ctx.globalAlpha = spriteAlpha;
        ctx.fillStyle = "rgba(8, 12, 14, 0.85)";
        ctx.fillRect(suppX - 1, suppY - 1, suppW + 2, 3);
        ctx.fillStyle = "#5b9ae8";
        ctx.fillRect(suppX, suppY, Math.round((suppW * (e.suppression ?? 0)) / 100), 2);
        ctx.restore();
      }
    }
  }

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
