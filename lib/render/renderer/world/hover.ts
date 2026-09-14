import { footprintOf } from "../../../catalog";
import type { SimState } from "../../../types";
import { TILE_H, TILE_W, tileToScreen, type Camera } from "../../../iso";
import { canRepair } from "../../../sim/repair";
import { canSell } from "../../../sim/sell";
import { tutorialTargets, type TutorialWorldTarget } from "../../../sim/tutorialStage";
import { heightAt } from "../../../sim/world";
import { selectionPulse } from "../../anim";
import { entityAtPointer, entityElev, visibleBuildingAt } from "../../renderPicking";
import { strokeFootprint } from "../../renderStructures";
import { drawDiamond, drawDiamondStroke, drawTooltip, tileTooltipLines, tooltipLines, type RenderExtras } from "../../renderOverlays";

const tutorialTargetCache = new WeakMap<SimState, {
  stage: SimState["tutorialStage"];
  tick: number;
  targets: TutorialWorldTarget[];
}>();

export function renderHoverPhase(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  hoverTile: { x: number; y: number } | null,
  w: number,
  h: number,
  extras: RenderExtras,
): void {
  drawTutorialTargets(ctx, state, cam, extras.clockMs ?? 0, extras.reducedMotion ?? false);

  if (hoverTile && !extras.placeKind && (extras.repairMode || extras.sellMode)) {
    const hovered = visibleBuildingAt(state, hoverTile.x, hoverTile.y);
    if (hovered && hovered.hp > 0) {
      const fp = footprintOf(hovered.kind as import("../../../types").BuildingKind);
      const ok = hovered.owner === 0 && (
        extras.repairMode
          ? hovered.repairing || canRepair(hovered)
          : canSell(hovered)
      );
      const tone = extras.repairMode
        ? (hovered.repairing ? "220,190,70" : "90,220,200")
        : "220,190,70";
      ctx.strokeStyle = ok ? `rgba(${tone},0.95)` : "rgba(220,70,70,0.95)";
      ctx.fillStyle = ok ? `rgba(${tone},0.16)` : "rgba(220,70,70,0.16)";
      ctx.lineWidth = 2;
      for (let oy = 0; oy < fp.h; oy++) {
        for (let ox = 0; ox < fp.w; ox++) {
          const tx = hovered.x + ox;
          const ty = hovered.y + oy;
          const elev = heightAt(state, tx, ty);
          const s = tileToScreen(tx, ty, cam, elev);
          drawDiamond(ctx, s.x, s.y, TILE_W * cam.zoom, TILE_H * cam.zoom);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  if (hoverTile && !extras.placeKind && !extras.repairMode && !extras.sellMode) {
    const s = tileToScreen(hoverTile.x, hoverTile.y, cam, heightAt(state, hoverTile.x, hoverTile.y));
    ctx.strokeStyle = "rgba(255,255,200,0.7)";
    ctx.lineWidth = 1.5;
    drawDiamondStroke(ctx, s.x, s.y, TILE_W * cam.zoom, TILE_H * cam.zoom);
    const hovered = visibleBuildingAt(state, hoverTile.x, hoverTile.y);
    if (hovered) {
      const fp = footprintOf(hovered.kind as import("../../../types").BuildingKind);
      ctx.strokeStyle = "rgba(245,230,168,0.45)";
      strokeFootprint(ctx, state, cam, hovered.x, hovered.y, fp.w, fp.h);
    }
  }

  const cursor = extras.cursor;
  if (cursor) {
    const ent = entityAtPointer(state, cursor.x, cursor.y, cam);
    if (ent) {
      const elev = entityElev(state, ent);
      let cx = ent.x;
      let cy = ent.y;
      let unitH = 42;
      if (ent.class === "building") {
        const fp = footprintOf(ent.kind as import("../../../types").BuildingKind);
        cx = ent.x + (fp.w - 1) / 2;
        cy = ent.y + (fp.h - 1) / 2;
        unitH = 55;
      } else {
        unitH = ent.kind === "infantry" ? 44 : ent.kind === "antiArmor" ? 48 : 56;
      }
      const s = tileToScreen(cx, cy, cam, elev);
      drawTooltip(ctx, s.x, s.y - unitH * cam.zoom, tooltipLines(state, ent, extras), w, h, true);
    } else if (hoverTile) {
      const s = tileToScreen(hoverTile.x, hoverTile.y, cam, heightAt(state, hoverTile.x, hoverTile.y));
      drawTooltip(ctx, s.x, s.y - 18 * cam.zoom, tileTooltipLines(state, hoverTile.x, hoverTile.y), w, h, true);
    }
  }
}

function drawTutorialTargets(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const targets = cachedTutorialTargets(state);
  if (!targets.length) return;
  const pulse = reducedMotion ? 0.5 : selectionPulse(timeMs);
  const alpha = 0.48 + pulse * 0.4;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(67, 230, 154, 0.22)";
  ctx.strokeStyle = "rgba(141, 255, 200, 0.98)";
  ctx.shadowColor = "rgba(67, 230, 154, 0.88)";
  ctx.shadowBlur = reducedMotion ? 4 : 8 + pulse * 8;
  ctx.lineWidth = Math.max(1.5, 2.2 * cam.zoom);

  for (const target of targets) {
    const tiles = targetTiles(state, target);
    for (const tile of tiles) {
      const s = tileToScreen(tile.x, tile.y, cam, heightAt(state, tile.x, tile.y));
      drawDiamond(ctx, s.x, s.y, TILE_W * cam.zoom, TILE_H * cam.zoom);
      drawDiamondStroke(ctx, s.x, s.y, TILE_W * cam.zoom, TILE_H * cam.zoom);
      const groundY = s.y + (TILE_H / 2) * cam.zoom;
      const radius = (9 + pulse * 5) * cam.zoom;
      ctx.beginPath();
      ctx.ellipse(s.x, groundY, radius, radius * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function cachedTutorialTargets(state: SimState): TutorialWorldTarget[] {
  if (state.tutorialStage === undefined) return [];
  const cached = tutorialTargetCache.get(state);
  if (cached?.stage === state.tutorialStage && cached.tick === state.tick) return cached.targets;
  const targets = tutorialTargets(state);
  tutorialTargetCache.set(state, { stage: state.tutorialStage, tick: state.tick, targets });
  return targets;
}

function targetTiles(state: SimState, target: TutorialWorldTarget): { x: number; y: number }[] {
  if (target.kind === "tile") {
    const footprint = target.footprint ?? { w: 1, h: 1 };
    const tiles: { x: number; y: number }[] = [];
    for (let y = 0; y < footprint.h; y++) {
      for (let x = 0; x < footprint.w; x++) tiles.push({ x: target.x + x, y: target.y + y });
    }
    return tiles;
  }
  const entity = state.entities.find((candidate) => candidate.id === target.entityId && candidate.hp > 0);
  if (!entity) return [];
  if (entity.class === "unit") return [{ x: Math.round(entity.x), y: Math.round(entity.y) }];
  const footprint = footprintOf(entity.kind as import("../../../types").BuildingKind);
  const tiles: { x: number; y: number }[] = [];
  for (let y = 0; y < footprint.h; y++) {
    for (let x = 0; x < footprint.w; x++) tiles.push({ x: Math.round(entity.x) + x, y: Math.round(entity.y) + y });
  }
  return tiles;
}
