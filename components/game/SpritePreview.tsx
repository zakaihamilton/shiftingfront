"use client";

import { useEffect, useRef } from "react";
import { buildingSprite, unitSprite } from "@/lib/gen/assets";
import { drawSprite, rasterize, spriteContentBounds } from "@/lib/render/sprites";
import { paintBuildingAssetOverlay } from "@/lib/render/previewEffects";
import {
  SPRITE_PREVIEW_HEIGHT,
  SPRITE_PREVIEW_CSS_HEIGHT,
  SPRITE_PREVIEW_CSS_WIDTH,
  SPRITE_PREVIEW_WIDTH,
  spritePreviewCanvasSize,
  spritePreviewDpr,
  spritePreviewLayout,
} from "@/lib/render/spritePreview";
import { drawUnitShadow } from "@/lib/render/unitMotion";
import { isUnitKind } from "@/lib/catalog";
import { cx } from "@/lib/ui/cx";
import type { BuildingKind, FactionVisualProfile, Palette, UnitKind } from "@/lib/types";
import styles from "./SpritePreview.module.css";

export function SpritePreview({
  kind,
  palette,
  profile,
  className,
}: {
  kind: BuildingKind | UnitKind;
  palette: Palette;
  profile?: FactionVisualProfile;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const isUnit = isUnitKind(kind);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = spritePreviewDpr(window.devicePixelRatio);
    const canvasSize = spritePreviewCanvasSize(dpr);
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let disposed = false;
    const paint = () => {
      const spec = isUnitKind(kind)
        ? unitSprite(kind, palette, { facing: 0, animationFrame: 0, profile })
        : buildingSprite(kind, palette, { profile });
      const staticAntiAirPreview = kind === "antiAirTurret";
      // The battlefield intentionally crops the anti-air source so its upper
      // assembly can be animated separately. Sidebar portraits are static, so
      // show the authored full silhouette instead of layering a differently
      // scaled procedural turret over the cropped base.
      const previewSpec = staticAntiAirPreview ? { ...spec, imageCrop: undefined } : spec;
      const logicalWidth = SPRITE_PREVIEW_WIDTH;
      const logicalHeight = SPRITE_PREVIEW_HEIGHT;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const image = rasterize(previewSpec, () => {
        if (!disposed) paint();
      });
      const bounds = spriteContentBounds(image) ?? { minX: 0, minY: 0, width: image.width, height: image.height };
      const layout = spritePreviewLayout(bounds, logicalWidth, logicalHeight);
      ctx.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";

      const renderDx = layout.x;
      const renderDy = layout.y;
      const groundX = Math.round(logicalWidth / 2);
      const groundY = Math.round((logicalHeight + layout.height) / 2);

      if (isUnitKind(kind)) {
        drawUnitShadow(
          ctx,
          kind,
          groundX,
          groundY,
          layout.scale,
          1,
          false,
        );
      }

      drawSprite(ctx, previewSpec, image, renderDx, renderDy, layout.width, layout.height, bounds);
      if (!isUnitKind(kind) && !staticAntiAirPreview) {
        const overlayScale = kind === "turret" ? layout.scale * 2 : layout.scale;
        const overlayY = logicalHeight / 2 - (kind === "turret" ? 8 : 0);
        paintBuildingAssetOverlay(ctx, kind, logicalWidth / 2, overlayY, overlayScale, 0, 3, false, palette);
      }
    };
    paint();
    return () => {
      disposed = true;
    };
  }, [isUnit, kind, palette, profile]);
  return (
    <canvas
      ref={ref}
      width={SPRITE_PREVIEW_CSS_WIDTH}
      height={SPRITE_PREVIEW_CSS_HEIGHT}
      className={cx(styles.canvas, className)}
      aria-hidden
    />
  );
}
