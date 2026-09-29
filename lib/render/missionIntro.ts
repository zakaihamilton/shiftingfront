import { BUILDING_STATS, footprintOf } from "@/lib/catalog/buildings";
import { findPathDetailed } from "@/lib/sim/navigation/astar";
import { groundHeight, heightAt } from "@/lib/sim/world";
import {
  SURFACE_CONCRETE,
  SURFACE_NONE,
  type BuildingKind,
  type Entity,
  type Owner,
  type Palette,
  type SimState,
  type Vec2,
} from "@/lib/types";
import { tileToScreen, toIsometricFacing, type Camera } from "@/lib/iso";
import { cameraPanBounds, clampCamera } from "@/lib/render/camera";
import { buildingSprite } from "@/lib/gen/assets";
import { generateVisualProfile } from "@/lib/gen/visualProfile";
import { MOBILE_HQ_DIRECTION_ART, unitViewForFacing } from "@/lib/gen/visualAssets";
import { entityVariant } from "./renderEntities";
import { cachedImage, drawSprite, isRasterReady, rasterize } from "./sprites";
import { renderWorld } from "./renderer";
import { MISSION_INTRO_BIOMES, type MissionIntroBiomeStaging } from "./missionIntroBiome";

const INTRO_REFERENCE_WIDTH = 1280;
const INTRO_REFERENCE_HEIGHT = 720;
const INTRO_DURATION_MS = 7_000;
const REDUCED_INTRO_DURATION_MS = 3_200;
const INTRO_RASTER_INTERVAL_MS = 1_000 / 24;
const INTRO_RASTER_ZOOM_STEP = 0.1;
const INTRO_RASTER_SCALE_MIN = 1.25;
const INTRO_RASTER_SCALE_MAX = 1.75;
const INTRO_RASTER_PIXEL_BUDGET = 6_000_000;
const INTRO_RASTER_PADDING = 112;

export const MISSION_INTRO_WIDTH = INTRO_REFERENCE_WIDTH;
export const MISSION_INTRO_HEIGHT = INTRO_REFERENCE_HEIGHT;

export type MissionIntroBeatId = "establish" | "entry" | "arrival" | "deployment" | "reveal";
export type MissionIntroBeat = { id: MissionIntroBeatId; start: number; end: number };

const INTRO_BEATS: readonly MissionIntroBeat[] = [
  { id: "establish", start: 0, end: 700 / INTRO_DURATION_MS },
  { id: "entry", start: 700 / INTRO_DURATION_MS, end: 3_700 / INTRO_DURATION_MS },
  { id: "arrival", start: 3_700 / INTRO_DURATION_MS, end: 4_500 / INTRO_DURATION_MS },
  { id: "deployment", start: 4_500 / INTRO_DURATION_MS, end: 5_900 / INTRO_DURATION_MS },
  { id: "reveal", start: 5_900 / INTRO_DURATION_MS, end: 1 },
];

export type MissionIntroPlan = {
  route: Vec2[];
  routeDistances: number[];
  routeLength: number;
  beats: readonly MissionIntroBeat[];
  cameraOffset: Vec2;
  staging: MissionIntroBiomeStaging;
  yard: Entity;
  mapWidth: number;
  mapHeight: number;
  durationMs: number;
  seed: number;
  owner: Owner;
};

export type MissionIntroPlayback = {
  plan: MissionIntroPlan;
  elapsedMs: number;
  reducedMotion: boolean;
  waitingForPlayers: boolean;
  lastRasterMs: number;
  rasterCanvas: HTMLCanvasElement | null;
  rasterCtx: CanvasRenderingContext2D | null;
  rasterCamera: Camera | null;
  rasterScale: number;
  rasterViewWidth: number;
  rasterViewHeight: number;
  sceneState: SimState | null;
};

export type MissionIntroCameraPose = {
  camera: Camera;
  focus: Vec2;
  zoom: number;
  screenY: number;
};

function perimeterCandidates(state: SimState): Vec2[] {
  const candidates: Vec2[] = [];
  const stride = Math.max(4, Math.floor(Math.min(state.width, state.height) / 8));
  for (let x = 1; x < state.width - 1; x += stride) {
    candidates.push({ x, y: 1 }, { x, y: state.height - 2 });
  }
  for (let y = 1; y < state.height - 1; y += stride) {
    candidates.push({ x: 1, y }, { x: state.width - 2, y });
  }
  return candidates;
}

function routeFor(state: SimState, yard: Entity, staging: MissionIntroBiomeStaging): Vec2[] {
  const candidates = perimeterCandidates(state);
  if (candidates.length > 0) {
    const routeSeed = state.seed + staging.routeBias + (state.viewOwner ?? 0) * 7;
    const firstCandidate = ((routeSeed % candidates.length) + candidates.length) % candidates.length;
    for (let attempt = 0; attempt < Math.min(8, candidates.length); attempt += 1) {
      const edge = candidates[(firstCandidate + attempt) % candidates.length]!;
      const result = findPathDetailed(state, edge, yard, { mobility: "vehicle", maxNodes: state.width * state.height });
      if (result.status === "complete" && result.path.length > 2) {
        return result.path.map((point) => ({ ...point }));
      }
    }
  }

  const fallback: Vec2[] = [];
  const edgeX = yard.x < state.width / 2 ? state.width - 2 : 1;
  const edgeY = Math.max(1, Math.min(state.height - 2, Math.round(yard.y)));
  const steps = Math.max(Math.abs(edgeX - yard.x), Math.abs(edgeY - yard.y));
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 1 : i / steps;
    fallback.push({
      x: Math.round(edgeX + (yard.x - edgeX) * t),
      y: Math.round(edgeY + (yard.y - edgeY) * t),
    });
  }
  return fallback;
}

function roundedRoute(route: Vec2[]): Vec2[] {
  if (route.length < 3) return route.map((point) => ({ ...point }));

  const points = [route[0]!];
  const appendLine = (from: Vec2, to: Vec2) => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / 0.32));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
  };

  let cursor = route[0]!;
  for (let index = 1; index < route.length - 1; index += 1) {
    const previous = route[index - 1]!;
    const corner = route[index]!;
    const next = route[index + 1]!;
    const inLength = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    if (inLength < 0.001 || outLength < 0.001) continue;

    const inX = (corner.x - previous.x) / inLength;
    const inY = (corner.y - previous.y) / inLength;
    const outX = (next.x - corner.x) / outLength;
    const outY = (next.y - corner.y) / outLength;
    const turn = inX * outY - inY * outX;
    const direction = inX * outX + inY * outY;
    if (Math.abs(turn) < 0.08 || direction < -0.95) {
      appendLine(cursor, corner);
      cursor = corner;
      continue;
    }

    const radius = Math.min(0.26, inLength * 0.28, outLength * 0.28);
    const entry = { x: corner.x - inX * radius, y: corner.y - inY * radius };
    const exit = { x: corner.x + outX * radius, y: corner.y + outY * radius };
    appendLine(cursor, entry);
    for (let step = 1; step <= 8; step += 1) {
      const t = step / 8;
      const inverse = 1 - t;
      points.push({
        x: inverse * inverse * entry.x + 2 * inverse * t * corner.x + t * t * exit.x,
        y: inverse * inverse * entry.y + 2 * inverse * t * corner.y + t * t * exit.y,
      });
    }
    cursor = exit;
  }

  appendLine(cursor, route.at(-1)!);
  return points;
}

function routeTail(route: Vec2[], distance: number): Vec2[] {
  if (route.length < 2) return route.map((point) => ({ ...point }));
  const distances = [0];
  for (let index = 1; index < route.length; index += 1) {
    distances.push(distances[index - 1]! + Math.hypot(route[index]!.x - route[index - 1]!.x, route[index]!.y - route[index - 1]!.y));
  }
  const total = distances.at(-1) ?? 0;
  if (total <= distance) return route.map((point) => ({ ...point }));

  const startDistance = total - distance;
  let segment = 1;
  while (segment < distances.length - 1 && distances[segment]! < startDistance) segment += 1;
  const segmentStart = distances[segment - 1]!;
  const segmentLength = Math.max(0.001, distances[segment]! - segmentStart);
  const mix = (startDistance - segmentStart) / segmentLength;
  const start = {
    x: route[segment - 1]!.x + (route[segment]!.x - route[segment - 1]!.x) * mix,
    y: route[segment - 1]!.y + (route[segment]!.y - route[segment - 1]!.y) * mix,
  };
  return [start, ...route.slice(segment).map((point) => ({ ...point }))];
}

export function createMissionIntroPlan(state: SimState, reducedMotion = false): MissionIntroPlan | null {
  const owner: Owner = state.viewOwner ?? 0;
  const yard = state.entities.find((entity) => entity.hp > 0 && entity.owner === owner && entity.kind === "constructionYard");
  if (!yard) return null;
  const staging = MISSION_INTRO_BIOMES[state.biome];
  const footprint = footprintOf("constructionYard");
  const destination = {
    x: yard.x + (footprint.w - 1) / 2,
    y: yard.y + (footprint.h - 1) / 2,
  };
  const route = roundedRoute(routeTail([...routeFor(state, yard, staging).slice(0, -1), destination], staging.entryDistance));
  const routeDistances = [0];
  for (let i = 1; i < route.length; i += 1) {
    routeDistances.push(routeDistances[i - 1]! + Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.y - route[i - 1]!.y));
  }
  const routeLength = Math.max(1, routeDistances.at(-1) ?? 0);
  const beats = INTRO_BEATS.map((beat) => ({ ...beat }));
  const cameraSeed = state.seed ^ Math.imul(state.missionIndex + 1, 0x9e3779b9) ^ Math.imul(owner + 1, 0x85ebca6b);
  const first = route[0] ?? destination;
  const forward = { x: destination.x - first.x, y: destination.y - first.y };
  const forwardLength = Math.max(0.001, Math.hypot(forward.x, forward.y));
  const right = { x: forward.y / forwardLength, y: -forward.x / forwardLength };
  const center = { x: state.width / 2, y: state.height / 2 };
  const inward = { x: center.x - first.x, y: center.y - first.y };
  const sideSign = right.x * inward.x + right.y * inward.y >= 0 ? 1 : -1;
  const handedness = seededFraction(cameraSeed, 1) < 0.5 ? -1 : 1;
  const sideOffset = 0.06 + seededFraction(cameraSeed, 41) * 0.04;
  const cameraOffset = {
    x: right.x * sideSign * handedness * sideOffset,
    y: right.y * sideSign * handedness * sideOffset,
  };

  return {
    route,
    routeDistances,
    routeLength,
    beats,
    cameraOffset,
    staging,
    yard,
    mapWidth: state.width,
    mapHeight: state.height,
    durationMs: reducedMotion ? REDUCED_INTRO_DURATION_MS : INTRO_DURATION_MS,
    seed: state.seed,
    owner,
  };
}

export function createMissionIntroPlayback(plan: MissionIntroPlan, reducedMotion = false): MissionIntroPlayback {
  return {
    plan,
    elapsedMs: 0,
    reducedMotion,
    waitingForPlayers: false,
    lastRasterMs: -Infinity,
    rasterCanvas: null,
    rasterCtx: null,
    rasterCamera: null,
    rasterScale: 1,
    rasterViewWidth: 0,
    rasterViewHeight: 0,
    sceneState: null,
  };
}

/** Update an in-flight arrival when the user's reduced-motion preference changes. */
export function updateMissionIntroReducedMotion(playback: MissionIntroPlayback, reducedMotion: boolean): void {
  if (playback.reducedMotion === reducedMotion) return;
  const previousDuration = playback.plan.durationMs;
  const nextDuration = reducedMotion ? REDUCED_INTRO_DURATION_MS : INTRO_DURATION_MS;
  const progress = previousDuration > 0 ? Math.max(0, Math.min(1, playback.elapsedMs / previousDuration)) : 0;
  playback.plan = { ...playback.plan, durationMs: nextDuration };
  playback.elapsedMs = progress * nextDuration;
  playback.reducedMotion = reducedMotion;
}

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function pointAlongRoute(plan: Pick<MissionIntroPlan, "route" | "routeDistances" | "routeLength" | "yard">, progress: number): { point: Vec2; heading: Vec2 } {
  const distance = Math.max(0, Math.min(1, progress)) * plan.routeLength;
  let index = 1;
  while (index < plan.routeDistances.length && plan.routeDistances[index]! < distance) index += 1;
  const a = plan.route[Math.max(0, index - 1)] ?? plan.yard;
  const b = plan.route[Math.min(plan.route.length - 1, index)] ?? plan.yard;
  const start = plan.routeDistances[Math.max(0, index - 1)] ?? 0;
  const end = plan.routeDistances[Math.min(plan.routeDistances.length - 1, index)] ?? start;
  const mix = end <= start ? 0 : (distance - start) / (end - start);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  return {
    point: { x: a.x + dx * mix, y: a.y + dy * mix },
    heading: { x: dx / length, y: dy / length },
  };
}

function clampFocus(point: Vec2, width: number, height: number): Vec2 {
  const margin = Math.min(3, width / 5, height / 5);
  return {
    x: Math.max(margin, Math.min(width - margin, point.x)),
    y: Math.max(margin, Math.min(height - margin, point.y)),
  };
}

function seededFraction(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x1_0000_0000;
}

export function sampleMissionIntroCameraPose(
  state: SimState,
  plan: MissionIntroPlan,
  elapsedMs: number,
  reducedMotion = false,
  width = INTRO_REFERENCE_WIDTH,
  height = INTRO_REFERENCE_HEIGHT,
): { pose: MissionIntroCameraPose } {
  const time = Math.max(0, Math.min(1, elapsedMs / Math.max(1, plan.durationMs)));
  const entryBeat = plan.beats.find((beat) => beat.id === "entry")!;
  const arrivalBeat = plan.beats.find((beat) => beat.id === "arrival")!;
  const approach = reducedMotion
    ? 1
    : smoothstep((time - entryBeat.start) / (entryBeat.end - entryBeat.start));
  const settle = reducedMotion
    ? 1
    : smoothstep((time - arrivalBeat.start) / (1 - arrivalBeat.start));
  const convoy = pointAlongRoute(plan, approach).point;
  const trackingFocus = clampFocus({
    x: convoy.x + plan.cameraOffset.x,
    y: convoy.y + plan.cameraOffset.y,
  }, plan.mapWidth, plan.mapHeight);
  const gameplayFocus = { x: plan.yard.x, y: plan.yard.y };
  const focus = {
    x: trackingFocus.x + (gameplayFocus.x - trackingFocus.x) * settle,
    y: trackingFocus.y + (gameplayFocus.y - trackingFocus.y) * settle,
  };
  const trackingZoom = plan.staging.establishZoom
    + (plan.staging.travelZoom - plan.staging.establishZoom) * approach;
  const zoom = trackingZoom + (1 - trackingZoom) * settle;
  const screenY = 0.43 + (1 / 3 - 0.43) * settle;
  const focusHeight = (reducedMotion || settle === 1)
    ? heightAt(state, plan.yard.x, plan.yard.y)
    : groundHeight(state, focus.x, focus.y);
  const camera = cameraForFocus(state, focus, zoom, screenY, width, height, focusHeight);
  return { pose: { camera, focus, zoom, screenY } };
}

function cameraForFocus(
  state: SimState,
  focus: Vec2,
  zoom: number,
  screenY: number,
  width: number,
  height: number,
  elevation = groundHeight(state, focus.x, focus.y),
): Camera {
  const ground = tileToScreen(focus.x, focus.y, { x: 0, y: 0, zoom }, elevation);
  const camera = {
    x: width / 2 - ground.x,
    y: height * screenY - ground.y,
    zoom,
  };
  clampCamera(camera, cameraPanBounds(camera, state.width, state.height, width, height));
  return camera;
}

export type MissionIntroTimeline = {
  progress: number;
  deployment: number;
  vehicleAlpha: number;
  transitionAlpha: number;
  structure: number;
  supportConstruction: number;
  cameraProgress: number;
  fade: number;
  beat: MissionIntroBeatId;
};

export type MissionIntroPhase = "APPROACHING BASE SITE" | "ANCHORING MOBILE HQ" | "UNFOLDING COMMAND HQ" | "COMMAND HQ ONLINE";

export function missionIntroPhaseFor(plan: MissionIntroPlan, elapsedMs: number, reducedMotion = false): MissionIntroPhase {
  const time = Math.max(0, Math.min(1, elapsedMs / Math.max(1, plan.durationMs)));
  if (reducedMotion) {
    if (time < 0.28) return "ANCHORING MOBILE HQ";
    if (time < 0.78) return "UNFOLDING COMMAND HQ";
    return "COMMAND HQ ONLINE";
  }

  const beat = plan.beats.find((candidate) => time < candidate.end)?.id ?? "reveal";
  if (beat === "establish" || beat === "entry") return "APPROACHING BASE SITE";
  if (beat === "arrival") return "ANCHORING MOBILE HQ";
  if (beat === "deployment") return "UNFOLDING COMMAND HQ";
  return "COMMAND HQ ONLINE";
}

export function sampleMissionIntroTimeline(
  plan: MissionIntroPlan,
  elapsedMs: number,
  reducedMotion = false,
): MissionIntroTimeline {
  const time = Math.max(0, Math.min(1, elapsedMs / Math.max(1, plan.durationMs)));
  const entryBeat = plan.beats.find((beat) => beat.id === "entry")!;
  const deploymentBeat = plan.beats.find((beat) => beat.id === "deployment")!;
  const revealBeat = plan.beats.find((beat) => beat.id === "reveal")!;
  const beat = plan.beats.find((candidate) => time < candidate.end)?.id ?? "reveal";
  const deployment = reducedMotion
    ? smoothstep((time - 0.22) / 0.48)
    : smoothstep((time - deploymentBeat.start) / (deploymentBeat.end - deploymentBeat.start));
  const transitionAlpha = Math.sin(deployment * Math.PI);
  const vehicleAlpha = 1 - smoothstep((deployment - 0.16) / 0.42);
  const structure = smoothstep((deployment - 0.08) / 0.72);
  const supportStart = reducedMotion ? 0.7 : revealBeat.start;
  const supportEnd = reducedMotion ? 0.9 : revealBeat.end;
  const supportConstruction = structure >= 1
    ? smoothstep((time - supportStart) / (supportEnd - supportStart))
    : 0;
  return {
    progress: reducedMotion ? 1 : smoothstep((time - entryBeat.start) / (entryBeat.end - entryBeat.start)),
    deployment,
    vehicleAlpha,
    transitionAlpha,
    structure,
    supportConstruction,
    cameraProgress: reducedMotion ? 1 : time,
    fade: smoothstep((time - 0.94) / 0.06),
    beat,
  };
}

export function createMissionIntroPresentationState(state: SimState, owner: Owner): SimState {
  const yards = state.entities.filter((entity) => entity.hp > 0 && entity.owner === owner && entity.kind === "constructionYard");
  const surfaces = state.surfaces.slice();
  for (const yard of yards) {
    const footprint = footprintOf("constructionYard");
    const centerX = yard.x + (footprint.w - 1) / 2;
    const centerY = yard.y + (footprint.h - 1) / 2;
    const radius = 7;
    for (let y = Math.max(0, Math.floor(centerY - radius)); y <= Math.min(state.height - 1, Math.ceil(centerY + radius)); y += 1) {
      for (let x = Math.max(0, Math.floor(centerX - radius)); x <= Math.min(state.width - 1, Math.ceil(centerX + radius)); x += 1) {
        if (Math.hypot(x - centerX, y - centerY) > radius) continue;
        const index = y * state.width + x;
        if (surfaces[index] === SURFACE_CONCRETE) surfaces[index] = SURFACE_NONE;
      }
    }
  }

  return {
    ...state,
    entities: state.entities.filter((entity) => !(entity.owner === owner && entity.class === "building")),
    surfaces,
    fog: state.fog.slice(),
    runtime: undefined,
  };
}

export function createMissionIntroSupportBuildings(state: SimState, owner: Owner, progress: number): Entity[] {
  const buildProgress = Math.max(0, Math.min(1, progress));
  if (buildProgress <= 0) return [];
  return state.entities
    .filter((entity) => entity.hp > 0 && entity.owner === owner && entity.class === "building" && entity.kind !== "constructionYard")
    .map((entity) => {
      const total = BUILDING_STATS[entity.kind as BuildingKind].buildTicks;
      return {
        ...entity,
        constructing: Math.ceil(total * (1 - buildProgress)),
      };
    });
}

function drawConvoy(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  camera: Camera,
  point: Vec2,
  heading: Vec2,
  alpha: number,
  palette: Palette,
): void {
  if (alpha <= 0) return;
  const view = unitViewForFacing(toIsometricFacing(heading.x, heading.y));
  const vehicle = cachedImage(MOBILE_HQ_DIRECTION_ART[view]);
  if (!vehicle.complete || vehicle.naturalWidth <= 0) return;
  const ground = tileToScreen(point.x, point.y, camera, groundHeight(state, point.x, point.y));
  const width = 68 * camera.zoom;
  const height = width * vehicle.naturalHeight / vehicle.naturalWidth;

  ctx.save();
  ctx.globalAlpha = 0.28 * alpha;
  ctx.fillStyle = "#05090a";
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y + 2 * camera.zoom, width * 0.36, 5 * camera.zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.drawImage(vehicle, ground.x - width / 2, ground.y - height, width, height);
  ctx.globalAlpha = 0.72 * alpha;
  ctx.fillStyle = palette.accent;
  ctx.fillRect(ground.x - width * 0.09, ground.y - height * 0.57, width * 0.18, Math.max(1, 1.5 * camera.zoom));
  ctx.restore();
}

function colorWithAlpha(color: string, alpha: number): string {
  const hex = /^#([\da-f]{6})$/i.exec(color)?.[1];
  if (!hex) return "rgba(172, 220, 208, " + alpha + ")";
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return "rgba(" + red + ", " + green + ", " + blue + ", " + alpha + ")";
}

function drawDeploymentEffects(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  plan: MissionIntroPlan,
  camera: Camera,
  deployment: number,
  glowAlpha: number,
  palette: Palette,
): void {
  if (deployment <= 0) return;
  const footprint = footprintOf("constructionYard");
  const centerX = plan.yard.x + (footprint.w - 1) / 2;
  const centerY = plan.yard.y + (footprint.h - 1) / 2;
  const ground = tileToScreen(centerX, centerY, camera, groundHeight(state, centerX, centerY));
  const radius = 112 * camera.zoom;
  const glow = ctx.createRadialGradient(ground.x, ground.y - 24 * camera.zoom, 0, ground.x, ground.y - 24 * camera.zoom, radius);
  glow.addColorStop(0, colorWithAlpha(palette.accent, 0.3 * glowAlpha));
  glow.addColorStop(0.45, colorWithAlpha(palette.accent, 0.11 * glowAlpha));
  glow.addColorStop(1, colorWithAlpha(palette.accent, 0));
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = glow;
  ctx.fillRect(ground.x - radius, ground.y - 24 * camera.zoom - radius, radius * 2, radius * 2);
  const ringProgress = smoothstep(Math.min(1, deployment / 0.82));
  const ringFadeIn = smoothstep(deployment / 0.12);
  const ringFadeOut = 1 - smoothstep((deployment - 0.68) / 0.32);
  ctx.globalAlpha = 0.42 * ringFadeIn * ringFadeOut;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = Math.max(0.8, 1.25 * camera.zoom);
  ctx.setLineDash([7 * camera.zoom, 5 * camera.zoom]);
  ctx.beginPath();
  ctx.ellipse(
    ground.x,
    ground.y,
    (16 + 94 * ringProgress) * camera.zoom,
    (8 + 44 * ringProgress) * camera.zoom,
    0,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
  ctx.restore();
}

function drawCommandYard(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  plan: MissionIntroPlan,
  camera: Camera,
  reveal: number,
): void {
  if (reveal <= 0) return;
  const yard = plan.yard;
  const palette = state.factions[yard.owner]!.palette;
  const spec = buildingSprite("constructionYard" as BuildingKind, palette, {
    variant: entityVariant(state, yard),
    profile: generateVisualProfile(state.seed, yard.owner),
  });
  const image = rasterize(spec);
  if (!isRasterReady(spec)) return;

  const footprint = footprintOf("constructionYard");
  const centerX = yard.x + (footprint.w - 1) / 2;
  const centerY = yard.y + (footprint.h - 1) / 2;
  const ground = tileToScreen(centerX, centerY, camera, groundHeight(state, centerX, centerY));
  const scale = camera.zoom * (0.92 + reveal * 0.08);
  const width = spec.w * scale;
  const height = spec.h * scale;
  const anchorX = (spec.anchorX ?? spec.w / 2) * scale;
  const anchorY = (spec.anchorY ?? spec.h) * scale;
  ctx.save();
  ctx.globalAlpha = 0.9 * reveal;
  ctx.fillStyle = "#05090a";
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y + 2 * camera.zoom, width * 0.38, height * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = reveal;
  drawSprite(ctx, spec, image, ground.x - anchorX, ground.y - anchorY, width, height);
  ctx.restore();
}

export function drawMissionIntro(
  output: CanvasRenderingContext2D,
  state: SimState,
  playback: MissionIntroPlayback,
  nowMs: number,
  palette?: Palette,
): void {
  const deviceScale = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const padding = INTRO_RASTER_PADDING;
  const viewWidth = output.canvas.width;
  const viewHeight = output.canvas.height;
  const targetScale = Math.max(INTRO_RASTER_SCALE_MIN, Math.min(INTRO_RASTER_SCALE_MAX, deviceScale));
  const paddedWidth = viewWidth + padding * 2;
  const paddedHeight = viewHeight + padding * 2;
  const paddedPixelCount = paddedWidth * paddedHeight;
  // Allow sub-1x raster scales on very large displays so the pixel budget is
  // a hard ceiling rather than a supersampling-only target.
  const rasterScale = Math.min(
    targetScale,
    Math.sqrt(INTRO_RASTER_PIXEL_BUDGET / Math.max(1, paddedPixelCount)),
  );
  const rasterWidth = Math.max(1, Math.floor(paddedWidth * rasterScale));
  const rasterHeight = Math.max(1, Math.floor(paddedHeight * rasterScale));
  let canvas = playback.rasterCanvas;
  if (!canvas) {
    canvas = document.createElement("canvas");
    playback.rasterCanvas = canvas;
  }
  if (canvas.width !== rasterWidth || canvas.height !== rasterHeight || playback.rasterViewWidth !== viewWidth || playback.rasterViewHeight !== viewHeight || playback.rasterScale !== rasterScale) {
    canvas.width = rasterWidth;
    canvas.height = rasterHeight;
    playback.rasterCtx = canvas.getContext("2d");
    playback.rasterViewWidth = viewWidth;
    playback.rasterViewHeight = viewHeight;
    playback.rasterScale = rasterScale;
    playback.rasterCamera = null;
    playback.lastRasterMs = -Infinity;
  }
  const ctx = playback.rasterCtx;
  if (!ctx) return;
  const elapsedMs = playback.elapsedMs;
  const shouldRender = nowMs - playback.lastRasterMs >= INTRO_RASTER_INTERVAL_MS || playback.lastRasterMs < 0;
  const { pose } = sampleMissionIntroCameraPose(
    state,
    playback.plan,
    elapsedMs,
    playback.reducedMotion,
    viewWidth,
    viewHeight,
  );
  const timeline = sampleMissionIntroTimeline(playback.plan, elapsedMs, playback.reducedMotion);
  const routePose = pointAlongRoute(playback.plan, timeline.progress);
  const previous = pointAlongRoute(playback.plan, Math.max(0, timeline.progress - 0.008)).point;
  const next = pointAlongRoute(playback.plan, Math.min(1, timeline.progress + 0.008)).point;
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const heading = { x: dx / length, y: dy / length };
  const scene = playback.sceneState ?? (playback.sceneState = createMissionIntroPresentationState(state, playback.plan.owner));
  const factionPalette = palette ?? state.factions[playback.plan.owner]!.palette;

  if (shouldRender) {
    playback.lastRasterMs = nowMs;
    // Zoom changes continuously during the cutscene. Quantizing the offscreen
    // scene zoom keeps the expensive terrain cache stable across most frames;
    // the cached scene is still transformed to the live camera pose below.
    const rasterZoom = Math.round(pose.zoom / INTRO_RASTER_ZOOM_STEP) * INTRO_RASTER_ZOOM_STEP;
    playback.rasterCamera = cameraForFocus(
      state,
      pose.focus,
      rasterZoom,
      pose.screenY,
      viewWidth,
      viewHeight,
    );
    scene.entities = [
      ...scene.entities.filter((entity) => entity.owner !== playback.plan.owner || entity.class !== "building"),
      ...createMissionIntroSupportBuildings(state, playback.plan.owner, timeline.supportConstruction),
    ];
    // Keep a larger overscan raster so the cached world can be transformed
    // smoothly between expensive terrain redraws.
    const rasterCamera = {
      x: (playback.rasterCamera.x + padding) * rasterScale,
      y: (playback.rasterCamera.y + padding) * rasterScale,
      zoom: playback.rasterCamera.zoom * rasterScale,
    };
    renderWorld(ctx, scene, rasterCamera, new Set(), null, {
      clockMs: elapsedMs,
      reducedMotion: playback.reducedMotion,
      fx: [],
      subTickAlpha: 0,
    });
  }

  const { fade } = timeline;
  const rasterCamera = playback.rasterCamera;
  output.save();
  output.setTransform(1, 0, 0, 1, 0, 0);
  output.imageSmoothingEnabled = true;
  output.imageSmoothingQuality = "high";
  output.globalAlpha = 1 - fade;
  if (rasterCamera) {
    // Composite the cached scene at the live camera pose on every frame;
    // convoy and deployment effects below are also drawn at live positions.
    const scale = pose.zoom / (rasterCamera.zoom * rasterScale);
    const tx = pose.camera.x - scale * (rasterCamera.x + padding) * rasterScale;
    const ty = pose.camera.y - scale * (rasterCamera.y + padding) * rasterScale;
    output.setTransform(scale, 0, 0, scale, tx, ty);
    output.drawImage(canvas, 0, 0);
  }
  output.restore();

  output.save();
  output.globalAlpha = 1 - fade;
  drawDeploymentEffects(output, state, playback.plan, pose.camera, timeline.deployment, timeline.transitionAlpha, factionPalette);
  drawConvoy(output, state, pose.camera, routePose.point, heading, timeline.vehicleAlpha, factionPalette);
  drawCommandYard(output, state, playback.plan, pose.camera, timeline.structure);
  output.restore();
}
