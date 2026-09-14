import { useEffect, type RefObject } from "react";
import { buildingSprite, rubbleSprite, unitSprite, wreckSprite } from "@/lib/gen/assets";
import type { CatalogAsset } from "@/lib/gen/assetCatalog";
import { animFrame, unitMovementOffset, unitWalkCycle } from "@/lib/render/anim";
import { drawSprite, isRasterReady, rasterize, rotatedSpriteBounds } from "@/lib/render/sprites";
import { drawUnitShadow } from "@/lib/render/unitMotion";
import type { AnimFrame, BuildingKind, Facing, FactionVisualProfile, Palette, UnitKind } from "@/lib/types";
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
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  selected: CatalogAsset | undefined;
  palette: Palette;
  profile: FactionVisualProfile;
  facing: Facing;
  playing: boolean;
  construction: 0 | 1 | 2 | 3;
  damage: 0 | 1 | 2;
}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selected) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let animTime = 0;
    let lastNow = 0;

    const paint = (timeMs: number) => {
      const isWalker = selected.category === "unit" && (selected.kind === "infantry" || selected.kind === "antiArmor" || selected.kind === "medic");
      const walkCycle = isWalker && playing
        ? unitWalkCycle(selected.kind as UnitKind, animTime)
        : undefined;
      const frame: AnimFrame = selected.category === "unit" && playing
        ? walkCycle?.frame ?? animFrame(animTime, 140, 4)
        : 0;
      const spec =
        selected.category === "unit"
          ? unitSprite(selected.kind as UnitKind, palette, {
              facing,
              animationFrame: frame,
              motion: playing ? "walk" : undefined,
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
        );
      }

      if (previousSpec && previousImage && isRasterReady(previousSpec) && frameBlend < 1) {
        ctx.globalAlpha = 1 - frameBlend;
        drawSprite(ctx, previousSpec, previousImage, renderDx, renderDy, dw, dh);
        ctx.globalAlpha = frameBlend;
        drawSprite(ctx, spec, image, renderDx, renderDy, dw, dh);
        ctx.globalAlpha = 1;
      } else {
        drawSprite(ctx, spec, image, renderDx, renderDy, dw, dh);
      }
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
    if (!playing) return;
    const loop = (now: number) => {
      if (lastNow === 0) lastNow = now;
      const dt = now - lastNow;
      lastNow = now;
      animTime += dt;
      paint(animTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, construction, damage, facing, palette, playing, profile, selected]);
}
