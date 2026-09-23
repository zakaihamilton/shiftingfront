import { isBuildingEntity, type Entity, type SimState } from "../../../types";
import { BUILDING_DEFINITIONS } from "../../../catalog";
import { animClock } from "../../anim";
import { type Camera } from "../../../iso";
import { isPerfHudEnabled, type WorldPhaseTimings } from "../../perfHud";
import { drawCombatEffects, drawFxLayer } from "../../renderCombat";
import { drawCommandMarker, drawRallyPoint, drawSelectBox } from "../../renderOverlays";
import type { RenderExtras } from "../../renderOverlays";
import { facingFor as resolveFacing } from "../../renderEntities";
import { pruneEntityVisibilityCache } from "../../renderPicking";
import { pruneTurretAimCache } from "../../renderStructures/turret";
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

  lap("entities");

  const selectedProducer = state.entities.find((entity) =>
    selected.has(entity.id) &&
    entity.hp > 0 &&
    entity.owner === 0 &&
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
