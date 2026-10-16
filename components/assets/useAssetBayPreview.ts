import { useEffect, type RefObject } from "react";
import { buildingSprite, rubbleSprite, unitSprite, wreckSprite } from "@/lib/gen/assets";
import type { CatalogAsset } from "@/lib/gen/assetCatalog";
import { animFrame, unitMovementOffset, unitWalkCycle, unitAnim, type UnitPose } from "@/lib/render/anim";
import { drawSprite, isRasterReady, preloadRasterSourcesAsync, rasterize, rotatedSpriteBounds } from "@/lib/render/sprites";
import { drawUnitShadow } from "@/lib/render/unitMotion";
import type { AnimFrame, BuildingKind, Entity, Facing, FactionVisualProfile, Palette, UnitKind } from "@/lib/types";
import { UNIT_STATS } from "@/lib/catalog";
import { terrainLightRigForBiome } from "@/lib/render/terrainLighting";
import { litUnitRaster } from "@/lib/render/unitLighting";
import { drawLayeredVehicle } from "@/lib/render/unitVehicleLayers";
import { drawBlendedUnitSprites } from "@/lib/render/unitSpriteBlend";
import { drawUnitWorkFx, unitBodyMotion } from "@/lib/render/unitPresentation";
import { unitAnimationSources } from "@/lib/gen/unitAnimationAssets";
import { UNIT_DIRECTION_ART, UNIT_WALK_CYCLE_ART } from "@/lib/gen/visualAssets";
import { paintBuildingAssetOverlay } from "@/lib/render/previewEffects";

export function useAssetBayPreview({
  canvasRef,
  selected,
  palette,
  profile,
  facing,
  playing,
  construction,
  damage,
  pose = "move",
  turretFacing = facing,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  selected: CatalogAsset | undefined;
  palette: Palette;
  profile: FactionVisualProfile;
  facing: Facing;
  playing: boolean;
  construction: 0 | 1 | 2 | 3;
  damage: 0 | 1 | 2;
  pose?: UnitPose;
  turretFacing?: Facing;
}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selected) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let animTime = 0;
    let lastNow = 0;
    let disposed = false;
    const rig = terrainLightRigForBiome(421, "ash plains");
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const paint = (timeMs: number) => {
      const isWalker = selected.category === "unit" && (selected.kind === "infantry" || selected.kind === "antiArmor" || selected.kind === "medic");
      const walkCycle = isWalker && pose === "move" && playing && !reducedMotion
        ? unitWalkCycle(selected.kind as UnitKind, animTime)
        : undefined;
      const frame: AnimFrame = selected.category === "unit" && playing
        ? walkCycle?.frame ?? animFrame(animTime, 140, 4)
        : 0;
      const actionFrame = pose === "idle" ? animFrame(animTime, 900, 4) : pose === "attack" ? animFrame(animTime, 100, 4) : frame;
      const motion = isWalker ? pose === "move" ? "walk" : pose === "attack" ? "fire" : pose === "work" && selected.kind === "medic" ? "treat" : "idle" : undefined;
      const spec =
        selected.category === "unit"
          ? unitSprite(selected.kind as UnitKind, palette, {
              facing,
              animationFrame: playing && !reducedMotion ? actionFrame : 0,
              motion,
              variant: 11,
              profile,
            })
          : selected.category === "building"
            ? buildingSprite(selected.kind as BuildingKind, palette, {
                constructionStage: construction,
                damageStage: damage,
                variant: 13,
                profile,
              })
            : selected.category === "wreck"
              ? wreckSprite(selected.kind as UnitKind, palette, { profile })
              : rubbleSprite(selected.kind as BuildingKind, palette, { profile });
      const frameBlend = walkCycle?.frameBlend ?? 1;
      const previousSpec = walkCycle && frameBlend < 1
        ? unitSprite(selected.kind as UnitKind, palette, {
            facing,
            animationFrame: walkCycle.previousFrame,
            motion: "walk",
            variant: 11,
            profile,
          })
        : undefined;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const image = rasterize(spec);
      const previousImage = previousSpec ? rasterize(previousSpec) : undefined;
      const bounds = rotatedSpriteBounds(spec);
      const scale = Math.min(canvas.width / bounds.width, canvas.height / bounds.height) * 0.86;
      const dw = Math.max(1, Math.round(spec.w * scale));
      const dh = Math.max(1, Math.round(spec.h * scale));
      const dx = Math.round((canvas.width - bounds.width * scale) / 2 - bounds.minX * scale);
      const dy = Math.round((canvas.height - bounds.height * scale) / 2 - bounds.minY * scale);

      const movement = selected.category === "unit"
        ? unitMovementOffset(selected.kind as UnitKind, frame, walkCycle?.phase)
        : null;

      const bob = playing ? (movement?.bobY ?? 0) * scale : 0;
      const renderDx = dx;
      const renderDy = dy + bob;
      const groundX = dx + dw * 0.5;
      const groundY = dy + dh;

      if (selected.category === "unit") {
        drawUnitShadow(
          ctx,
          selected.kind as UnitKind,
          groundX,
          groundY,
          scale,
          1,
          playing,
          { lightDirection: { x: rig.directionX, y: rig.directionY }, shadowDepth: rig.occlusionStrength },
        );
      }

      const kind = selected.kind as UnitKind;
      const previewKind = selected.category === "unit" ? kind : "infantry";
      const previewEntity: Entity = { id: 1000000, owner: 0, class: "unit", kind: previewKind, x: 0, y: 0, hp: 100, maxHp: 100,
        cooldown: pose === "attack" ? Math.max(0, UNIT_STATS[previewKind].cooldown - actionFrame) : 0,
        path: pose === "move" ? [{ x: 1, y: 0 }] : [], carry: 0, constructing: 0, queue: [], marked: false, idle: pose === "idle",
        attackTarget: pose === "attack" ? 1000001 : undefined, supportTargetId: pose === "work" ? 1000001 : undefined, gatherX: pose === "work" ? 1 : undefined, gatherY: 0 };
      const animation = unitAnim(previewEntity, 0, animTime, pose === "work" && (kind === "medic" || kind === "repairTruck"));
      const body = selected.category === "unit" ? unitBodyMotion(previewEntity, animation, { recoil: pose === "attack" ? 1 - actionFrame / 4 : 0,
        moveSpeed: pose === "move" ? 1 : 0, suspensionY: 0, chassisLean: 0, roll: 0 }, animTime, reducedMotion) : undefined;
      ctx.save();
      if (body) { ctx.translate(groundX, groundY + body.lift * scale); ctx.rotate(body.lean); ctx.scale(1, body.scaleY); ctx.translate(-groundX, -groundY); }
      const layered = selected.category === "unit" && (kind === "tank" || kind === "behemoth") && drawLayeredVehicle(ctx, {
        id: 1000000, kind, base: spec, hullFacing: facing, turretYaw: turretFacing / 8 * Math.PI * 2 - Math.PI / 2,
        x: groundX, groundY, zoom: scale, time: animTime, alpha: 1, recoil: pose === "attack" && playing && !reducedMotion ? 1 - actionFrame / 4 : 0,
        reducedMotion: reducedMotion || !playing, rig, flash: 0, travel: animTime * 0.001, moving: pose === "move" && playing,
      });
      if (!layered) {
        const lit = selected.category === "unit" && isRasterReady(spec) ? litUnitRaster(image, rig, 0,
          !isWalker && kind !== "strikePlane" && pose === "move" && playing && !reducedMotion
            ? { phase: animTime * 0.003, tracked: kind === "harvester", side: facing === 0 || facing === 4 } : undefined) : image;
        if (previousSpec && previousImage && isRasterReady(previousSpec) && frameBlend < 1) {
          drawBlendedUnitSprites(ctx, [{ spec: previousSpec, img: litUnitRaster(previousImage, rig), weight: 1-frameBlend }, { spec, img: lit, weight: frameBlend }], renderDx, renderDy, dw, dh, 1);
        } else drawSprite(ctx, spec, lit, renderDx, renderDy, dw, dh);
      }
      ctx.restore();
      if (selected.category === "unit") drawUnitWorkFx(ctx, previewEntity,
        pose === "work" ? { ...previewEntity, id: 1000001, kind: kind === "medic" ? "infantry" : "tank", x: 1, hp: 50, path: [] } : undefined,
        groundX, groundY, scale, animTime, reducedMotion, { gathering: pose === "work" && kind === "harvester" });
      if (selected.category === "building") {
        paintBuildingAssetOverlay(
          ctx,
          selected.kind as BuildingKind,
          canvas.width / 2,
          canvas.height / 2,
          Math.max(1, scale),
          timeMs,
          facing,
          playing,
          palette,
        );
      }
    };
    paint(0);
    if (selected.category === "unit") {
      const kind = selected.kind as UnitKind;
      const walk = kind === "infantry" || kind === "medic" || kind === "antiArmor" ? Object.values(UNIT_WALK_CYCLE_ART[kind]) : [];
      void preloadRasterSourcesAsync([...Object.values(UNIT_DIRECTION_ART[kind]), ...walk, ...unitAnimationSources(kind)])
        .then(() => { if (!disposed) paint(animTime); });
    }
    if (!playing) return () => { disposed = true; };
    const loop = (now: number) => {
      if (lastNow === 0) lastNow = now;
      const dt = now - lastNow;
      lastNow = now;
      animTime += dt;
      paint(animTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { disposed = true; cancelAnimationFrame(raf); };
  }, [canvasRef, construction, damage, facing, palette, playing, profile, selected, pose, turretFacing]);
}
