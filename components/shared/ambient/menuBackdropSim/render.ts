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
import { terrainColors } from "@/lib/render/terrainMaterials";
import { isSupportUnit, UNIT_STATS } from "@/lib/catalog";
import { burstsFromEvents, cullFx } from "@/lib/render/fx";
import { renderWorld } from "@/lib/render/renderer";
import { isTerrainAtlasReady } from "@/lib/render/terrainAtlas";
import { tick } from "@/lib/sim/api";
import { nearest, spawnUnit } from "@/lib/sim/world";
import { assignAttack } from "@/lib/sim/ai/combat";
import { assignSupportTarget } from "@/lib/sim/support";
import type { UnitKind } from "@/lib/types";
import { type CinemaScene, type Shot } from "./scene";
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
      if (e.orderDestination && Math.hypot(e.orderDestination.x - cx, e.orderDestination.y - cy) > 4) {
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
      const pSpawnKind: UnitKind = scene.scenarioKind === "infantryStorm" ? "infantry" : "tank";
      const newP = spawnUnit(scene.state, 0, pSpawnKind, cx - 1, cy + 1);
      pCombat.push(newP);
    }
    if (eCombat.length < 2) {
      const eSpawnKind: UnitKind = scene.scenarioKind === "infantryStorm" ? "infantry" : "tank";
      const newE = spawnUnit(scene.state, 1, eSpawnKind, cx + 1, cy - 1);
      eCombat.push(newE);
    }

    for (const u of eCombat) {
      if (u.attackTarget === undefined || u.idle) {
        const target = nearest(scene.state, u, (e) => e.owner === 0 && e.hp > 0 && Math.hypot(e.x - cx, e.y - cy) <= 8);
        if (target) assignAttack(scene.state, u, target);
      }
    }

    for (const u of pCombat) {
      if (u.attackTarget === undefined || u.idle) {
        const target = nearest(scene.state, u, (e) => e.owner === 1 && e.hp > 0 && Math.hypot(e.x - cx, e.y - cy) <= 8);
        if (target) assignAttack(scene.state, u, target);
      }
    }

    const supportUnits = scene.state.entities.filter(
      (e) => e.class === "unit" && e.hp > 0 && isSupportUnit(e.kind as UnitKind),
    );
    for (const u of supportUnits) {
      if (u.supportTargetId === undefined || u.idle) {
        const target = nearest(scene.state, u, (e) => e.owner === u.owner && e.hp > 0 && e.hp < e.maxHp && Math.hypot(e.x - cx, e.y - cy) <= 8);
        if (target) assignSupportTarget(scene.state, u, target);
      }
    }
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
  const paintAmbient = options?.paintAmbient ?? true;
  const useTerrainCache = options?.useTerrainCache ?? true;
  const followCamera = Boolean(options?.camera);
  const preview = !paintAmbient;
  const clockMs = typeof performance !== "undefined" ? performance.now() : t * 16;
  scene.fx = cullFx(scene.fx, clockMs);

  if (preview && scene.state && isTerrainAtlasReady(scene.state)) {
    try {
      renderWorld(ctx, scene.state, cam, new Set(), null, {
        clockMs,
        subTickAlpha: Math.max(0, Math.min(1, scene.simulationAccumulatorMs / TICK_MS)),
        fx: scene.fx,
      });
      return;
    } catch {
      // Fall through to standard cinema renderer if renderWorld is unsupported in this context
    }
  }

  ctx.imageSmoothingEnabled = true;
  if (preview && "imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";

  if (preview) {
    ctx.fillStyle = terrainColors(scene.map.biome).mid;
    ctx.fillRect(0, 0, w, h);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#0a1018");
    sky.addColorStop(0.45, "#12180f");
    sky.addColorStop(1, "#1a140c");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
  }

  const cached = useTerrainCache ? ensureCinemaTerrain(scene, w, h, cam, followCamera) : null;
  if (cached?.canvas) {
    const blit = scrollLayerBlitOffset(cached, cam.x, cam.y);
    ctx.drawImage(cached.canvas, blit.x, blit.y);
  } else {
    paintCinemaStatic(ctx, scene, cam);
  }

  const profile0 = generateVisualProfile(scene.seed, 0);
  const profile1 = generateVisualProfile(scene.seed, 1);
  const ordered = preview
    ? [...actors].sort((left, right) => left.x + left.y - (right.x + right.y))
    : actors;
  for (const a of ordered) {
    paintCinemaActor(ctx, scene, cam, a, t, preview, profile0, profile1);
  }

  for (const sh of shots) {
    const ea = map.heights[Math.floor(sh.ay) * map.width + Math.floor(sh.ax)] ?? 1;
    const eb = map.heights[Math.floor(sh.by) * map.width + Math.floor(sh.bx)] ?? 1;
    const sa = tileToScreen(sh.ax, sh.ay, cam, ea);
    const sb = tileToScreen(sh.bx, sh.by, cam, eb);
    ctx.strokeStyle = "#ffe27d";
    ctx.lineWidth = preview ? 1.05 : 1.8;
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  }

  if (paintAmbient) paintAmbientSignals(ctx, w, h, t);
}
