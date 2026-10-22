import { transformedCanvasPoint } from "../../canvasViewport";
import { drawInfantryMarker } from "../../unitReadability";
import { footprintOf, isAirUnit, UNIT_STATS } from "../../../catalog";
import { isSharedProducerKind } from "../../../sim/producerState";
import { buildingSprite, unitSprite } from "../../../gen/assets";
import { generateVisualProfile } from "../../../gen/visualProfile";
import type { BuildingKind, Entity, SimState, UnitKind } from "../../../types";
import { TILE_H, tileToScreen, type Camera } from "../../../iso";
import { buildingAnim, facingVector, selectionPulse, unitAnim } from "../../anim";
import { drawSprite, isRasterReady, rasterize, spriteContentBounds } from "../../sprites";
import { drawUnitShadow, movementDustFill, paintUnitMovementFx } from "../../unitMotion";
import { unitFacingLayers } from "../../unitFacingBlend";
import { drawBlendedUnitSprites, type UnitSpriteLayer } from "../../unitSpriteBlend";
import { type UnitDynamicTransform } from "../../gl/unitTransformTracker";
import { type TerrainLightRig } from "../../terrainLighting";
import { litUnitRaster, type UnitLight, unitLightStrength } from "../../unitLighting";
import { activeUnitGathering, activeUnitSupport, drawUnitWorkFx, unitBodyMotion } from "../../unitPresentation";
import { drawLayeredVehicle, unitWeaponSockets } from "../../unitVehicleLayers";
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
import { isExtractableUnit, isScenarioTarget } from "../../renderCombat";
import {
  drawDamageOverlay,
  drawRescueHalo,
  drawUnitAmmoMeter,
  drawUnitGlow,
  drawUnitHealthMeter,
  entityHasWorldAmmoMeter,
  entityHasWorldHealthMeter,
  worldHealthMeterHeight,
  worldHealthMeterLayout,
} from "../../renderOverlays";
import { constructionStage, entityVariant, facingFor as resolveFacing } from "../../renderEntities";
import type { RenderExtras } from "../../renderOverlays";
import { entityById, lastReadySprite, spriteCacheKey } from "../cache";

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

export type WorldEntityFrame = {
  ctx: CanvasRenderingContext2D;
  state: SimState;
  cam: Camera;
  selected: Set<number>;
  w: number;
  h: number;
  clock: number | undefined;
  extras: {
    reducedMotion?: boolean;
    colorblindMode?: RenderExtras["colorblindMode"];
  };
  timeMs: number;
  z: number;
  cullPad: number;
  dynCache: Map<number, UnitDynamicTransform>;
  repairTargets: Set<number>;
  activeProducingIds: Set<number>;
  lights: UnitLight[];
  lightRig: TerrainLightRig;
};

export function drawWorldEntity(e: Entity, frame: WorldEntityFrame): void {
  const {
    ctx, state, cam, selected, w, h, clock, extras, timeMs, z, cullPad, dynCache,
    repairTargets, activeProducingIds, lights, lightRig,
  } = frame;
  const entityAlpha = renderEntityOpacity(state, e, timeMs);
  if (entityAlpha <= 0.01) return;
  let cx = e.x;
  let cy = e.y;
  let elev = entityElev(state, e);
  const supportTarget = e.supportTargetId !== undefined ? entityById.get(e.supportTargetId) : undefined;
  const uAnim = e.class === "unit" ? unitAnim(e, state.tick, clock, activeUnitSupport(e, supportTarget)) : null;
  if (uAnim?.pose === "work" && e.kind === "harvester" && !activeUnitGathering(state, e)) uAnim.pose = "idle";
  if (uAnim && extras.reducedMotion && (uAnim.pose === "idle" || uAnim.pose === "work")) uAnim.frame = uAnim.pose === "work" ? 1 : 0;
  const bAnim = e.class === "building"
    ? buildingAnim(e, state.tick, clock, isSharedProducerKind(e.kind) ? activeProducingIds.has(e.id) : Boolean(e.producing))
    : null;
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
  if (e.class === "unit" && (e.suppression ?? 0) > 25 && !extras.reducedMotion) {
    const wobble = ((state.tick + e.id) % 4) - 1.5;
    s.x += wobble * 1.4;
    s.y += Math.abs(wobble) * 0.45;
  }
  if (s.x < -cullPad || s.y < -cullPad || s.x > w + cullPad || s.y > h + cullPad) return;
  const pal = state.factions[e.owner]!.palette;
  const profile = generateVisualProfile(state.seed, e.owner);
  const dyn = e.class === "unit" ? dynCache.get(e.id) : undefined;
  const aircraft = e.class === "unit" && isAirUnit(e.kind);
  const groundS = aircraft && dyn ? tileToScreen(cx, cy, cam, dyn.z) : s;
  const isWalker = e.class === "unit" && (e.kind === "infantry" || e.kind === "medic" || e.kind === "antiArmor");
  const isVehicle = e.class === "unit" && !isWalker;
  const motion = isWalker ? uAnim?.pose === "move" ? "walk" : uAnim?.pose === "attack" ? "fire" : uAnim?.pose === "work" && e.kind === "medic" ? "treat" : "idle" : undefined;

  const facing = dyn ? dyn.baseFacing : resolveFacing(state, e, entityById, e.class === "unit" ? { x: cx, y: cy } : undefined);
  const variant = entityVariant(state, e);

  let spec = e.class === "unit"
    ? unitSprite(e.kind as UnitKind, pal, {
        variant,
        facing,
        animationFrame: uAnim?.frame,
        motion,
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
  const requestedSpriteReady = !spec.imageSrc || isRasterReady(spec);
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
  const unitLayers: UnitSpriteLayer[] = [];
  if (e.class === "unit" && !aircraft) {
    const facingLayers = unitFacingLayers(e.id, facing, timeMs, isWalker ? 90 : 140,
      requestedSpriteReady, extras.reducedMotion);
    for (const layer of facingLayers) {
      const layerSpec = unitSprite(e.kind as UnitKind, pal, {
        variant,
        facing: layer.facing,
        animationFrame: uAnim?.frame,
        motion,
        damageStage,
        profile,
      });
      const layerImg = rasterize(layerSpec);
      if (!isRasterReady(layerSpec)) continue;
      const previousSpec = walkBlend < 1 && uAnim?.previousFrame !== undefined
        ? unitSprite(e.kind as UnitKind, pal, {
            variant,
            facing: layer.facing,
            animationFrame: uAnim.previousFrame,
            motion: "walk",
            damageStage,
            profile,
          })
        : undefined;
      const previousImg = previousSpec ? rasterize(previousSpec) : undefined;
      const previousReady = previousSpec && previousImg && isRasterReady(previousSpec);
      if (previousReady && walkBlend < 1) {
        unitLayers.push({ spec: previousSpec, img: previousImg, weight: layer.weight * (1 - walkBlend) });
      }
      if (!previousReady || walkBlend > 0) {
        unitLayers.push({ spec: layerSpec, img: layerImg, weight: layer.weight * (previousReady ? walkBlend : 1) });
      }
    }
  }

  const dw = Math.round(spec.w * z);
  const dh = Math.round(spec.h * z);
  const ax = ((spec.anchorX ?? spec.w / 2) / spec.w) * dw;
  const ay = ((spec.anchorY ?? spec.h) / spec.h) * dh;

  const dir = facingVector(facing);
  const recoil = extras.reducedMotion ? 0 : (dyn?.recoil ?? uAnim?.recoil ?? 0);
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
        lightDirection: { x: lightRig.directionX, y: lightRig.directionY },
        shadowDepth: lightRig.occlusionStrength,
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
    smooth: e.class === "unit",
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
  const body = dyn && uAnim ? unitBodyMotion(e, uAnim, dyn, timeMs, extras.reducedMotion) : undefined;
  ctx.save();
  if (body && (body.lift !== 0 || body.lean !== 0 || body.scaleY !== 1)) {
    ctx.translate(groundX, spriteGroundY + body.lift * z);
    if (Math.abs(body.lean) > 0.003) ctx.rotate(body.lean);
    ctx.scale(1, body.scaleY);
    ctx.translate(-groundX, -spriteGroundY);
  }
  const flash = unitLightStrength(lights, groundX, spriteGroundY - 12 * z);
  const layered = spriteReady && dyn && (e.kind === "tank" || e.kind === "behemoth")
    ? drawLayeredVehicle(ctx, { id: e.id, kind: e.kind, base: spec, hullFacing: facing, turretYaw: dyn.turretYaw,
        x: groundX, groundY: spriteGroundY, zoom: z, time: timeMs, alpha: spriteAlpha,
        recoil, reducedMotion: Boolean(extras.reducedMotion), rig: lightRig, flash, travel: dyn.travel, moving: dyn.moveSpeed > 0.025 }) : false;
  if (spriteReady && !layered) {
    if (unitLayers.length) {
      drawBlendedUnitSprites(ctx, unitLayers.map(layer => ({ ...layer, img: litUnitRaster(layer.img, lightRig, flash,
        isVehicle && !aircraft && dyn && dyn.moveSpeed > 0.025 && !extras.reducedMotion
          ? { phase: dyn.travel * 3, tracked: e.kind === "harvester" || e.kind === "tank" || e.kind === "behemoth", side: facing === 0 || facing === 4 } : undefined, isWalker) })), dx, dy, dw, dh, spriteAlpha);
    } else {
      ctx.globalAlpha = spriteAlpha;
      drawSprite(ctx, spec, e.class === "unit" ? litUnitRaster(img, lightRig, flash) : img, dx, dy, dw, dh);
    }
    ctx.globalAlpha = 1;
  }
  if (spriteReady && e.class !== "building") {
    if (isWalker && e.attackTarget !== undefined) {
      const bounds = spriteContentBounds(img);
      if (bounds) {
        const side = facing === 0 || facing === 1 || facing === 7 ? 0.96 : facing === 3 || facing === 4 || facing === 5 ? 0.04 : 0.5;
        const px = dx + (bounds.minX + bounds.width * side) / img.width * dw;
        const py = dy + (bounds.minY + bounds.height * 0.35) / img.height * dh;
        unitWeaponSockets.set(e.id, transformedCanvasPoint(ctx, px, py));
      }
    }
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
  if (e.class === "unit" && e.veteranRank === 1) {
    ctx.fillStyle = "#e6c15a";
    ctx.globalAlpha = spriteAlpha;
    const tipX = dx + dw / 2;
    const tipY = dy - 8 * z;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - 5 * z, tipY + 6 * z);
    ctx.lineTo(tipX + 5 * z, tipY + 6 * z);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (spriteReady && e.class === "unit") {
    const targetPosition = supportTarget ? tileToScreen(supportTarget.x, supportTarget.y, cam, entityElev(state, supportTarget)) : undefined;
    drawUnitWorkFx(ctx, e, supportTarget, groundX, spriteGroundY, z, timeMs, Boolean(extras.reducedMotion), {
      state, alpha: spriteAlpha,
      gathering: activeUnitGathering(state, e), targetScreen: targetPosition ? { x: targetPosition.x, y: targetPosition.y + TILE_H/2*z } : undefined,
    });
  }

  if (bAnim) drawBuildingFx(ctx, e, s, z, bAnim, state);
  if (isWalker && spriteReady) {
    drawInfantryMarker(ctx, e, groundX, spriteGroundY, z, spriteAlpha, state.viewOwner ?? 0, extras.colorblindMode);
  }
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
