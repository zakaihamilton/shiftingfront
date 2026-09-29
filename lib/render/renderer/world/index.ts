import { isBuildingEntity, type Entity, type SimState } from "../../../types";
import { BUILDING_DEFINITIONS, footprintOf } from "../../../catalog";
import { animClock } from "../../anim";
import { tileToScreen, type Camera } from "../../../iso";
import { isPerfHudEnabled, type WorldPhaseTimings } from "../../perfHud";
import { drawCombatEffects, drawFxLayer } from "../../renderCombat";
import { drawCommandMarker, drawRallyPoint, drawSelectBox } from "../../renderOverlays";
import type { RenderExtras } from "../../renderOverlays";
import { facingFor as resolveFacing } from "../../renderEntities";
import { entityElev, pruneEntityVisibilityCache } from "../../renderPicking";
import { strokeFootprint } from "../../renderStructures";
import { pruneTurretAimCache } from "../../renderStructures/turret";
import { activeProducerFor, SHARED_PRODUCER_KINDS } from "../../../sim/producerState";
import { drawList, entityById } from "../cache";
import { renderTerrainPhase } from "./terrain";
import { renderEntityPhase } from "./entities";
import { renderHoverPhase } from "./hover";

export type { RenderExtras };

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  selected: Set<number>,
  hoverTile: { x: number; y: number } | null,
  extras: RenderExtras = {},
  tooltipCtx: CanvasRenderingContext2D = ctx,
): WorldPhaseTimings | null {
  const profile = isPerfHudEnabled();
  const timings: WorldPhaseTimings = { terrain: 0, fx: 0, entities: 0, combat: 0 };
  let mark = profile ? performance.now() : 0;
  const lap = (key: keyof WorldPhaseTimings) => {
    if (!profile) return;
    const now = performance.now();
    timings[key] = now - mark;
    mark = now;
  };

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";

  renderTerrainPhase(ctx, state, cam, w, h, extras, hoverTile);
  lap("fx");

  const liveIds = state.entities.filter((entity) => entity.hp > 0).map((entity) => entity.id);
  pruneEntityVisibilityCache(liveIds);
  pruneTurretAimCache(liveIds);

  const clock = extras.clockMs;
  renderEntityPhase(ctx, state, cam, selected, w, h, clock, {
    subTickAlpha: extras.subTickAlpha,
    fx: extras.fx,
    reducedMotion: extras.reducedMotion,
    colorblindMode: extras.colorblindMode,
  });

  const owner = state.viewOwner ?? 0;
  for (const kind of SHARED_PRODUCER_KINDS) {
    const producer = activeProducerFor(state, owner, kind);
    if (producer) drawActiveProducerIndicator(ctx, state, cam, producer);
  }

  lap("entities");

  const selectedProducer = state.entities.find((entity) =>
    selected.has(entity.id) &&
    entity.hp > 0 &&
    entity.owner === (state.viewOwner ?? 0) &&
    isBuildingEntity(entity) &&
    entity.constructing <= 0 &&
    Boolean(BUILDING_DEFINITIONS[entity.kind].production) &&
    Boolean(entity.rallyPoint),
  );
  const rallyPoint = selectedProducer?.rallyPoint;
  if (selectedProducer && rallyPoint) {
    drawRallyPoint(ctx, state, cam, { ...selectedProducer, rallyPoint }, clock ?? 0, extras.reducedMotion);
  }

  const timeMs = animClock(state.tick, clock);
  drawCombatEffects(ctx, state, cam, drawList, entityById, (st: SimState, ent: Entity) => resolveFacing(st, ent, entityById), clock);
  drawFxLayer(ctx, state, cam, extras.fx, timeMs, "burst", extras.reducedMotion);
  drawSelectBox(ctx, extras.selectBox);
  drawCommandMarker(ctx, state, cam, extras.commandMarker, timeMs, extras.reducedMotion);

  renderHoverPhase(ctx, state, cam, hoverTile, w, h, extras, tooltipCtx);
  lap("combat");
  return profile ? timings : null;
}

function drawActiveProducerIndicator(ctx: CanvasRenderingContext2D, state: SimState, cam: Camera, producer: Entity): void {
  if (!isBuildingEntity(producer)) return;
  const footprint = footprintOf(producer.kind);
  const centerX = producer.x + (footprint.w - 1) / 2;
  const centerY = producer.y + (footprint.h - 1) / 2;
  const screen = tileToScreen(centerX, centerY, cam, entityElev(state, producer));
  const fontSize = Math.max(9, Math.min(12, 12 * cam.zoom));
  const badgeHeight = fontSize + 7;
  ctx.save();
  ctx.globalAlpha = 0.96;
  ctx.strokeStyle = "#59f0c6";
  ctx.fillStyle = "rgba(8, 31, 29, 0.94)";
  ctx.lineWidth = Math.max(2, 2.5 * cam.zoom);
  strokeFootprint(ctx, state, cam, producer.x, producer.y, footprint.w, footprint.h);
  ctx.font = `700 ${fontSize}px monospace`;
  const badgeWidth = ctx.measureText("ACTIVE").width + 12;
  const badgeX = Math.round(screen.x - badgeWidth / 2);
  const badgeY = Math.round(screen.y - 48 * cam.zoom - badgeHeight);
  ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
  ctx.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);
  ctx.fillStyle = "#a5ffe7";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ACTIVE", screen.x, badgeY + badgeHeight / 2);
  ctx.restore();
}
