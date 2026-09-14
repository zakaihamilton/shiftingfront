import { footprintOf } from "../../../catalog";
import { buildingSprite, unitSprite } from "../../../gen/assets";
import { generateVisualProfile } from "../../../gen/visualProfile";
import type { BuildingKind, SimState, UnitKind } from "../../../types";
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
  drawUnitGlow,
  drawUnitHealthMeter,
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
  // not coarse integer tile coords. Without this, grouped units on the same
  // isometric diagonal flip z-order every sub-tick (visible flickering).
  updateUnitHistory(state, timeMs);
  const dynCache = new Map<number, ReturnType<typeof computeUnitDynamicTransform>>();
  for (const e of drawList) {
    if (e.class === "unit") {
      dynCache.set(e.id, computeUnitDynamicTransform(e, state, extras.subTickAlpha ?? 0, timeMs, entityById));
    }
  }

  const depthCache = new Map<number, number>();
  for (const e of drawList) {
    depthCache.set(e.id, e.class === "unit" ? (dynCache.get(e.id)!.x + dynCache.get(e.id)!.y) : depthOf(e));
  }

  // Keep nearly-overlapping grouped units in their established painter order.
  // Their interpolated depths can cross by tiny amounts while they move, which
  // otherwise makes the sprites swap z-order from frame to frame and flicker.
  const UNIT_DEPTH_STABILITY_EPSILON = 0.75;
  drawList.sort((a, b) => {
    const da = depthCache.get(a.id)!;
    const db = depthCache.get(b.id)!;
    const delta = da - db;
    if (a.class === "unit" && b.class === "unit" && Math.abs(delta) <= UNIT_DEPTH_STABILITY_EPSILON) {
      const previousA = entityDrawOrder.get(a.id);
      const previousB = entityDrawOrder.get(b.id);
      if (previousA !== undefined && previousB !== undefined && previousA !== previousB) {
        return previousA - previousB;
      }
    }
    return delta || (a.id - b.id);
  });
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
      elev = dyn.z;
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
    const groundX = s.x;
    const groundY = s.y + (TILE_H / 2) * z;

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
      groundY,
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
        groundY,
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

    if (bAnim) drawBuildingFx(ctx, e, s, z, bAnim);
    if (e.kind === "turret" && e.class === "building") {
      const targetEntity = e.attackTarget !== undefined ? entityById.get(e.attackTarget) : undefined;
      drawTurretCannon(ctx, e, s, z, state, cam, timeMs, targetEntity);
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
        ctx.ellipse(s.x, s.y + (TILE_H / 2) * z, (16 + pulse * 3) * z, (6 + pulse * 1.5) * z, 0, 0, Math.PI * 2);
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
      );

      if (e.class === "unit" && (e.suppression ?? 0) > 0) {
        const suppW = barW;
        const suppX = Math.round(centerX - suppW / 2);
        const suppY = meterY + worldHealthMeterHeight(z) + 2;
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
