import { generateVisualProfile } from "@/lib/gen/visualProfile";
import { frameTickBudget, TICK_MS } from "@/lib/game/loop";
import { tileToScreen, type Camera } from "@/lib/iso";
import {
  CINEMA_SCROLL_PAD,
  scrollLayerBlitOffset,
  scrollLayerNeedsRebuild,
  scrollLayerPaintCamera,
  terrainScrollPad,
} from "@/lib/render/scrollLayer";
import { isSupportUnit, UNIT_STATS } from "@/lib/catalog";
import { burstsFromEvents, cullFx } from "@/lib/render/fx";
import { renderWorld } from "@/lib/render/renderer";
import { tick } from "@/lib/sim/api";
import { spawnUnit } from "@/lib/sim/world";
import { assignMove } from "@/lib/sim/ai/combat";
import type { UnitKind } from "@/lib/types";
import { type CinemaScene, type Shot } from "./scene";
import { assignClashTargets } from "./combat";
import { CINEMA_SCENARIOS } from "./scenarios";
import { cinemaCamera, cinemaOrigin, paintCinemaStatic } from "./paint";
import {
  type CinemaTerrainCache,
  type RenderCinemaOptions,
  CINEMA_TERRAIN_CACHE_LIMIT,
  CINEMA_REFERENCE_FRAME_MS,
  CINEMA_SHOT_LIFETIME_MS,
  paintCinemaActor,
  paintAmbientSignals,
} from "./rendering/index";

export * from "./rendering/index";

const cinemaTerrains = new Map<string, CinemaTerrainCache>();

function cinemaTerrainContentKey(scene: CinemaScene, w: number, h: number, zoom: number): string {
  return `${scene.seed}:${w}x${h}:${zoom}`;
}

function cinemaTerrainPad(zoom: number): number {
  return Math.max(CINEMA_SCROLL_PAD, terrainScrollPad(zoom));
}

function takeCinemaTerrain(contentKey: string): CinemaTerrainCache {
  const existing = cinemaTerrains.get(contentKey);
  if (existing) {
    cinemaTerrains.delete(contentKey);
    cinemaTerrains.set(contentKey, existing);
    return existing;
  }
  const created: CinemaTerrainCache = {
    canvas: null,
    key: "",
    originX: 0,
    originY: 0,
    pad: CINEMA_SCROLL_PAD,
  };
  cinemaTerrains.set(contentKey, created);
  while (cinemaTerrains.size > CINEMA_TERRAIN_CACHE_LIMIT) {
    const oldest = cinemaTerrains.keys().next().value;
    if (oldest === undefined || oldest === contentKey) break;
    cinemaTerrains.delete(oldest);
  }
  return created;
}

function ensureCinemaTerrain(
  scene: CinemaScene,
  w: number,
  h: number,
  cam: Camera,
  followCamera: boolean,
): CinemaTerrainCache | null {
  if (typeof document === "undefined") return null;
  const pad = cinemaTerrainPad(cam.zoom);
  const contentKey = cinemaTerrainContentKey(scene, w, h, cam.zoom);
  const cache = takeCinemaTerrain(contentKey);
  if (!cache.canvas) cache.canvas = document.createElement("canvas");
  const canvas = cache.canvas;
  const bw = w + pad * 2;
  const bh = h + pad * 2;
  const origin = followCamera ? { x: cam.x, y: cam.y } : cinemaOrigin(w, h);
  const sizeChanged = canvas.width !== bw || canvas.height !== bh;
  const jumped = followCamera && scrollLayerNeedsRebuild(cache, contentKey, cam.x, cam.y);
  const rebuild = sizeChanged || cache.key !== contentKey || jumped;
  if (!rebuild) return cache;

  if (sizeChanged) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, bw, bh);
  const paintCam = scrollLayerPaintCamera({ x: origin.x, y: origin.y, zoom: cam.zoom }, pad);
  paintCinemaStatic(ctx, scene, paintCam);
  cache.key = contentKey;
  cache.originX = origin.x;
  cache.originY = origin.y;
  cache.pad = pad;
  return cache;
}

function stepCinemaSimulation(scene: CinemaScene, shots: Shot[]): void {
  if (scene.state) {
    const cx = scene.combatEpicenter.x;
    const cy = scene.combatEpicenter.y;

    const { events } = tick(scene.state, undefined, { evaluateObjectives: false });
    scene.state.fog.fill(2);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    for (const ev of events) {
      if (ev.type === "combat") {
        shots.push({ ax: ev.x, ay: ev.y, bx: ev.targetX, by: ev.targetY, life: CINEMA_SHOT_LIFETIME_MS });
      }
    }
    const destroyedEvents = events.filter((event) => event.type === "destroyed");
    if (destroyedEvents.length) {
      const spawned = burstsFromEvents(destroyedEvents, scene.state, now, scene.fxSequence);
      scene.fxSequence = spawned.nextId;
      scene.fx.push(...spawned.bursts);
    }

    for (const e of scene.state.entities) {
      if (e.class !== "unit" || e.hp <= 0) continue;
      if (e.orderDestination && Math.hypot(e.orderDestination.x - cx, e.orderDestination.y - cy) > 10) {
        e.path = [];
        e.routePending = false;
        e.orderDestination = undefined;
        e.attackTarget = undefined;
        e.orderMode = undefined;
      }
    }

    const pCombat = scene.state.entities.filter(
      (e) => e.owner === 0 && e.class === "unit" && e.hp > 0 && !isSupportUnit(e.kind as UnitKind) && UNIT_STATS[e.kind as UnitKind].damage > 0,
    );
    const eCombat = scene.state.entities.filter(
      (e) => e.owner === 1 && e.class === "unit" && e.hp > 0 && !isSupportUnit(e.kind as UnitKind) && UNIT_STATS[e.kind as UnitKind].damage > 0,
    );

    // Keep active combat alive so the preview camera never frames an empty battlefield
    if (pCombat.length < 2) {
      const replacementKinds = CINEMA_SCENARIOS[scene.scenarioKind].replacementKinds.player;
      const pSpawnKind = replacementKinds[scene.state.tick % replacementKinds.length]!;
      const newP = spawnUnit(scene.state, 0, pSpawnKind, cx - 1, cy + 1);
      pCombat.push(newP);
    }
    if (eCombat.length < 2) {
      const replacementKinds = CINEMA_SCENARIOS[scene.scenarioKind].replacementKinds.enemy;
      const eSpawnKind = replacementKinds[scene.state.tick % replacementKinds.length]!;
      const newE = spawnUnit(scene.state, 1, eSpawnKind, cx + 1, cy - 1);
      eCombat.push(newE);
    }

    const convoy = scene.scenarioKind === "convoyRaid" && scene.scenarioTargetId !== undefined
      ? scene.state.entities.find((entity) => entity.id === scene.scenarioTargetId)
      : undefined;
    if (convoy?.class === "unit" && scene.convoyRoute?.length) {
      const waypoint = scene.convoyRoute[scene.convoyRouteIndex % scene.convoyRoute.length]!;
      const reached = Math.hypot(convoy.x - waypoint.x, convoy.y - waypoint.y) < 0.75;
      if (reached) scene.convoyRouteIndex = (scene.convoyRouteIndex + 1) % scene.convoyRoute.length;
      const nextWaypoint = scene.convoyRoute[scene.convoyRouteIndex % scene.convoyRoute.length]!;
      if (reached || convoy.orderMode !== "move" || convoy.idle) assignMove(scene.state, convoy, nextWaypoint);
    }

    assignClashTargets(scene.state, scene.scenarioKind, scene.scenarioTargetId, cx, cy, 10);
  }
}

export function stepCinemaScene(scene: CinemaScene, shots: Shot[], t: number, nowMs?: number): void {
  const frameNow = nowMs ?? t * CINEMA_REFERENCE_FRAME_MS;
  const previousNow = scene.lastStepMs;
  const frameScale = previousNow === undefined
    ? 1
    : Math.min(12, Math.max(0, frameNow - previousNow) / CINEMA_REFERENCE_FRAME_MS);
  scene.lastStepMs = frameNow;

  for (const a of scene.actors) {
    const dest = a.waypoints[a.wi]!;
    const dx = dest.x - a.x;
    const dy = dest.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) a.wi = (a.wi + 1) % a.waypoints.length;
    else {
      a.x += (dx / d) * a.speed * frameScale;
      a.y += (dy / d) * a.speed * frameScale;
    }
  }

  if (previousNow !== undefined) {
    scene.simulationAccumulatorMs += Math.max(0, frameNow - previousNow);
  }
  const elapsedMs = previousNow === undefined ? 0 : Math.max(0, frameNow - previousNow);
  for (let i = shots.length - 1; i >= 0; i--) {
    shots[i]!.life -= elapsedMs;
    if (shots[i]!.life <= 0) shots.splice(i, 1);
  }

  const budget = frameTickBudget(scene.simulationAccumulatorMs, TICK_MS);
  scene.simulationAccumulatorMs = budget.acc;
  for (let i = 0; i < budget.ticks; i++) stepCinemaSimulation(scene, shots);
}

export function renderCinemaFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  scene: CinemaScene,
  shots: Shot[],
  options?: RenderCinemaOptions,
) {
  const { map, actors } = scene;
  const cam = options?.camera ?? cinemaCamera(w, h, t);
  const renderMode = options?.renderMode ?? "cinema";
  const paintAmbient = options?.paintAmbient ?? renderMode === "cinema";
  const useTerrainCache = options?.useTerrainCache ?? true;
  const followCamera = Boolean(options?.camera);
  const clockMs = typeof performance !== "undefined" ? performance.now() : t * 16;
  scene.fx = cullFx(scene.fx, clockMs);

  if (renderMode === "gameplay") {
    if (!scene.state) return;
    renderWorld(ctx, scene.state, cam, new Set(), null, {
      clockMs,
      subTickAlpha: Math.max(0, Math.min(1, scene.simulationAccumulatorMs / TICK_MS)),
      fx: scene.fx,
    });
    return;
  }

  ctx.imageSmoothingEnabled = true;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#0a1018");
  sky.addColorStop(0.45, "#12180f");
  sky.addColorStop(1, "#1a140c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const cached = useTerrainCache ? ensureCinemaTerrain(scene, w, h, cam, followCamera) : null;
  if (cached?.canvas) {
    const blit = scrollLayerBlitOffset(cached, cam.x, cam.y);
    ctx.drawImage(cached.canvas, blit.x, blit.y);
  } else {
    paintCinemaStatic(ctx, scene, cam);
  }

  const profile0 = generateVisualProfile(scene.seed, 0);
  const profile1 = generateVisualProfile(scene.seed, 1);
  for (const a of actors) {
    paintCinemaActor(ctx, scene, cam, a, t, false, profile0, profile1);
  }

  for (const sh of shots) {
    const ea = map.heights[Math.floor(sh.ay) * map.width + Math.floor(sh.ax)] ?? 1;
    const eb = map.heights[Math.floor(sh.by) * map.width + Math.floor(sh.bx)] ?? 1;
    const sa = tileToScreen(sh.ax, sh.ay, cam, ea);
    const sb = tileToScreen(sh.bx, sh.by, cam, eb);
    ctx.strokeStyle = "#ffe27d";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  }

  if (paintAmbient) paintAmbientSignals(ctx, w, h, t);
}
