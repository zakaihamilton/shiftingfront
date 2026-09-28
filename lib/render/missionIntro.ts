import { sceneryAt } from "@/lib/gen/map";
import { findPathDetailed } from "@/lib/sim/navigation/astar";
import { groundHeight, heightAt } from "@/lib/sim/world";
import { TILE_BLOCKED, type Entity, type Palette, type SimState, type Vec2 } from "@/lib/types";
import { buildConvoyTruckModel } from "./gl/modelLoader/convoyTruck";
import { biomeMaterials, sampleTerrainMaterial } from "./terrainAtlas";
import { weatherKindForBiome, weatherParticleAt } from "./terrainWeather/weather";

export const MISSION_INTRO_WIDTH = 320;
export const MISSION_INTRO_HEIGHT = 180;
const INTRO_DURATION_MS = 10_200;
const REDUCED_INTRO_DURATION_MS = 4_300;
const HORIZON = 47;
const FOCAL = 154;

type IntroProp = { x: number; y: number; elevation: number; seed: number };

export type MissionIntroPlan = {
  route: Vec2[];
  routeDistances: number[];
  routeLength: number;
  yard: Entity;
  props: IntroProp[];
  terrainRgb: Uint8Array;
  heights: Uint8Array;
  mapWidth: number;
  mapHeight: number;
  durationMs: number;
  seed: number;
  owner: number;
};

export type MissionIntroPlayback = {
  plan: MissionIntroPlan;
  elapsedMs: number;
  reducedMotion: boolean;
  waitingForPlayers: boolean;
  lastRasterMs: number;
  rasterCanvas: HTMLCanvasElement | null;
  rasterCtx: CanvasRenderingContext2D | null;
  depthBuffer: Float32Array;
};

type CameraPose = {
  x: number;
  y: number;
  z: number;
  forwardX: number;
  forwardY: number;
  rightX: number;
  rightY: number;
  horizon: number;
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

function routeFor(state: SimState, yard: Entity): Vec2[] {
  const routes = perimeterCandidates(state)
    .map((edge) => findPathDetailed(state, edge, yard, { mobility: "vehicle", maxNodes: state.width * state.height }))
    .filter((result) => result.status === "complete" && result.path.length > 2)
    .map((result) => result.path);
  if (routes.length > 0) {
    routes.sort((a, b) => b.length - a.length);
    const preferred = (state.seed + (state.viewOwner ?? 0) * 7) % Math.min(4, routes.length);
    return routes[preferred]!.map((point) => ({ ...point }));
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

export function createMissionIntroPlan(state: SimState, reducedMotion = false): MissionIntroPlan | null {
  const owner = state.viewOwner ?? 0;
  const yard = state.entities.find((entity) => entity.hp > 0 && entity.owner === owner && entity.kind === "constructionYard");
  if (!yard) return null;

  const route = routeFor(state, yard);
  const routeDistances = [0];
  for (let i = 1; i < route.length; i += 1) {
    routeDistances.push(routeDistances[i - 1]! + Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.y - route[i - 1]!.y));
  }
  const routeLength = routeDistances.at(-1) ?? 0;
  const terrainRgb = new Uint8Array(state.width * state.height * 3);
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const color = sampleTerrainMaterial(state, x + 0.5, y + 0.5);
      const index = (y * state.width + x) * 3;
      terrainRgb[index] = color.r;
      terrainRgb[index + 1] = color.g;
      terrainRgb[index + 2] = color.b;
    }
  }
  const props: IntroProp[] = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const index = y * state.width + x;
      if (state.tiles[index] !== TILE_BLOCKED) continue;
      const sample = sceneryAt(state, x, y);
      const hash = (Math.imul(x + 31, 73856093) ^ Math.imul(y + 17, 19349663) ^ state.seed) >>> 0;
      if (hash % 5 !== 0) continue;
      props.push({ x: x + 0.5, y: y + 0.5, elevation: Math.max(sample.elev, heightAt(state, x, y)), seed: hash });
    }
  }

  return {
    route,
    routeDistances,
    routeLength: Math.max(1, routeLength),
    yard,
    props,
    terrainRgb,
    heights: Uint8Array.from(state.heights, (value) => Math.max(0, Math.min(255, value))),
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
    depthBuffer: new Float32Array(MISSION_INTRO_WIDTH * MISSION_INTRO_HEIGHT),
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

function pointAlongRoute(plan: MissionIntroPlan, progress: number): { point: Vec2; heading: Vec2 } {
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

function heightFromPlan(plan: MissionIntroPlan, x: number, y: number): number {
  const ix = Math.max(0, Math.min(plan.mapWidth - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(plan.mapHeight - 1, Math.floor(y)));
  return plan.heights[iy * plan.mapWidth + ix] ?? 0;
}

function paletteColor(palette: Palette | undefined, mask: number): string {
  if (mask === 1) return palette?.primary ?? "#657a79";
  if (mask === 2) return palette?.secondary ?? "#b18950";
  if (mask === 3) return "#9fe7e6";
  if (mask === 4) return "#283138";
  if (mask === 5) return "#b97542";
  if (mask === 6) return "#d8bd61";
  if (mask === 7) return "#d6e4e4";
  return "#536167";
}

function rgbToCss(r: number, g: number, b: number, scale = 1): string {
  return `rgb(${Math.max(0, Math.min(255, Math.round(r * scale)))},${Math.max(0, Math.min(255, Math.round(g * scale)))},${Math.max(0, Math.min(255, Math.round(b * scale)))})`;
}

function terrainColor(plan: MissionIntroPlan, state: SimState, x: number, y: number): [number, number, number] {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= state.width || iy >= state.height) {
    const mats = biomeMaterials(state.biome);
    return [mats.low.r, mats.low.g, mats.low.b];
  }
  const tile = iy * state.width + ix;
  const base = tile * 3;
  const variance = (((Math.floor(x * 7) * 13 + Math.floor(y * 7) * 17 + plan.seed) >>> 0) % 13) - 6;
  return [
    Math.max(0, Math.min(255, plan.terrainRgb[base]! + variance)),
    Math.max(0, Math.min(255, plan.terrainRgb[base + 1]! + variance)),
    Math.max(0, Math.min(255, plan.terrainRgb[base + 2]! + variance)),
  ];
}

function writePixel(image: ImageData, x: number, y: number, color: [number, number, number], depth: number, playback: MissionIntroPlayback): void {
  if (x < 0 || y < 0 || x >= MISSION_INTRO_WIDTH || y >= MISSION_INTRO_HEIGHT) return;
  const i = (y * MISSION_INTRO_WIDTH + x) * 4;
  image.data[i] = color[0];
  image.data[i + 1] = color[1];
  image.data[i + 2] = color[2];
  image.data[i + 3] = 255;
  playback.depthBuffer[y * MISSION_INTRO_WIDTH + x] = depth;
}

function poseFor(state: SimState, playback: MissionIntroPlayback, elapsedMs: number): { pose: CameraPose; truck: Vec2; truckHeading: Vec2; brake: number; progress: number; fade: number; rise: number } {
  const { plan } = playback;
  const duration = plan.durationMs;
  const driveEnd = duration * 0.76;
  const progress = smoothstep(elapsedMs / driveEnd);
  const truckPose = pointAlongRoute(plan, progress);
  const previous = pointAlongRoute(plan, Math.max(0, progress - 0.012));
  const next = pointAlongRoute(plan, Math.min(1, progress + 0.012));
  const headingX = next.point.x - previous.point.x;
  const headingY = next.point.y - previous.point.y;
  const headingLength = Math.max(0.001, Math.hypot(headingX, headingY));
  const forwardX = headingX / headingLength;
  const forwardY = headingY / headingLength;
  const baseHeight = groundHeight(state, truckPose.point.x, truckPose.point.y);
  const cameraDistance = playback.reducedMotion ? 3.3 : 4.5;
  const cameraX = truckPose.point.x - forwardX * cameraDistance;
  const cameraY = truckPose.point.y - forwardY * cameraDistance;
  const roughness = Math.sin(elapsedMs / 92 + plan.seed) * 0.08 + Math.sin(elapsedMs / 173 + plan.seed * 0.7) * 0.05;
  const brake = smoothstep((progress - 0.88) / 0.12);
  const rise = smoothstep((elapsedMs - duration * 0.79) / (duration * 0.17));
  const fade = smoothstep((elapsedMs - duration * 0.91) / (duration * 0.09));
  return {
    pose: {
      x: cameraX,
      y: cameraY,
      z: baseHeight + 2.8 + roughness + brake * 0.12,
      forwardX,
      forwardY,
      rightX: forwardY,
      rightY: -forwardX,
      horizon: HORIZON - rise * 13,
    },
    truck: truckPose.point,
    truckHeading: { x: forwardX, y: forwardY },
    brake,
    progress,
    fade,
    rise,
  };
}

function sampleMode7Terrain(ctx: CanvasRenderingContext2D, state: SimState, playback: MissionIntroPlayback, pose: CameraPose, rise: number): ImageData {
  const width = MISSION_INTRO_WIDTH;
  const height = MISSION_INTRO_HEIGHT;
  const image = ctx.createImageData(width, height);
  playback.depthBuffer.fill(Number.POSITIVE_INFINITY);
  const materials = biomeMaterials(state.biome);
  for (let y = 0; y < height; y += 1) {
    const horizonMix = y / height;
    const sky = y < HORIZON
      ? [10 + horizonMix * 8, 22 + horizonMix * 17, 28 + horizonMix * 18]
      : [materials.low.r * 0.45, materials.low.g * 0.48, materials.low.b * 0.5];
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      image.data[i] = sky[0]!;
      image.data[i + 1] = sky[1]!;
      image.data[i + 2] = sky[2]!;
      image.data[i + 3] = 255;
      playback.depthBuffer[y * width + x] = Number.POSITIVE_INFINITY;
    }
  }
  const horizon = HORIZON - rise * 13;
  const far = Math.min(110, Math.max(state.width, state.height) * 0.92);
  const cameraHeight = pose.z + rise * 56;
  for (let screenX = 0; screenX < width; screenX += 1) {
    const side = (screenX - width / 2) / FOCAL;
    const rawX = pose.forwardX + pose.rightX * side;
    const rawY = pose.forwardY + pose.rightY * side;
    const rayLength = Math.hypot(rawX, rawY);
    const rayX = rawX / rayLength;
    const rayY = rawY / rayLength;
    let previousTop = height;
    let distance = 0.5;
    while (distance < far && previousTop > horizon - 2) {
      const worldX = pose.x + rayX * distance;
      const worldY = pose.y + rayY * distance;
      if (worldX >= 0 && worldY >= 0 && worldX < state.width && worldY < state.height) {
        const ix = Math.floor(worldX);
        const iy = Math.floor(worldY);
        const elevation = heightAt(state, ix, iy);
        const projected = Math.floor(horizon + FOCAL * (cameraHeight - elevation) / Math.max(0.55, distance));
        if (projected < previousTop) {
          const color = terrainColor(playback.plan, state, worldX, worldY);
          const shadow = 0.76 + Math.min(0.25, elevation * 0.035) + Math.sin(worldX * 0.71 + worldY * 0.46) * 0.035;
          const startY = Math.max(0, projected);
          const endY = Math.min(height - 1, previousTop);
          for (let screenY = startY; screenY <= endY; screenY += 1) {
            writePixel(image, screenX, screenY, [color[0] * shadow, color[1] * shadow, color[2] * shadow], distance, playback);
          }
          previousTop = projected;
        }
      }
      distance += Math.max(0.055, distance * 0.016);
    }
  }
  return image;
}

function projectWorld(pose: CameraPose, worldX: number, worldY: number, worldZ: number): { x: number; y: number; depth: number } | null {
  const dx = worldX - pose.x;
  const dy = worldY - pose.y;
  const depth = dx * pose.forwardX + dy * pose.forwardY;
  if (depth < 0.35) return null;
  const lateral = dx * pose.rightX + dy * pose.rightY;
  return {
    x: MISSION_INTRO_WIDTH / 2 + lateral * FOCAL / depth,
    y: pose.horizon + FOCAL * (pose.z - worldZ) / depth,
    depth,
  };
}

function drawDepthAwareProps(ctx: CanvasRenderingContext2D, state: SimState, playback: MissionIntroPlayback, pose: CameraPose): void {
  const visible = playback.plan.props
    .map((prop) => ({ prop, point: projectWorld(pose, prop.x, prop.y, prop.elevation) }))
    .filter((entry): entry is { prop: IntroProp; point: { x: number; y: number; depth: number } } => !!entry.point && entry.point.x > -10 && entry.point.x < MISSION_INTRO_WIDTH + 10 && entry.point.depth < 60)
    .sort((a, b) => b.point.depth - a.point.depth);
  const mats = biomeMaterials(state.biome);
  for (const { prop, point } of visible) {
    const ix = Math.round(point.x);
    const iy = Math.round(point.y);
    const radius = Math.max(1, Math.min(9, FOCAL / point.depth * 0.22));
    if (ix < 1 || ix >= MISSION_INTRO_WIDTH - 1 || iy < 2 || iy >= MISSION_INTRO_HEIGHT - 1) continue;
    const terrainDepth = playback.depthBuffer[iy * MISSION_INTRO_WIDTH + ix] ?? Infinity;
    if (terrainDepth + 0.65 < point.depth) continue;
    const rock = (prop.seed & 1) === 0;
    ctx.fillStyle = rock ? rgbToCss(mats.dark.r, mats.dark.g, mats.dark.b) : "#202923";
    ctx.beginPath();
    if (rock) {
      ctx.ellipse(point.x, point.y - radius * 0.45, radius * 1.4, radius * 0.75, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(point.x, point.y - radius * 1.25, radius * 0.95, radius * 1.45, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    if (!rock) {
      ctx.fillStyle = rgbToCss(mats.mid.r, mats.mid.g, mats.mid.b, 0.66);
      ctx.fillRect(point.x - radius * 0.18, point.y - radius * 1.15, Math.max(1, radius * 0.35), radius * 1.1);
    }
  }
}

function transformTruckVertex(x: number, y: number, z: number, yaw: number, pitch: number): [number, number, number] {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const pitchedX = x * Math.cos(pitch) + z * Math.sin(pitch);
  const pitchedZ = z * Math.cos(pitch) - x * Math.sin(pitch);
  return [pitchedX * cosYaw - y * sinYaw, pitchedX * sinYaw + y * cosYaw, pitchedZ];
}

function drawTruck(ctx: CanvasRenderingContext2D, state: SimState, playback: MissionIntroPlayback, pose: CameraPose, truck: Vec2, heading: Vec2, brake: number, elapsedMs: number, palette?: Palette): void {
  const model = buildConvoyTruckModel();
  const yaw = Math.atan2(heading.y, heading.x);
  const terrainAhead = groundHeight(state, truck.x + heading.x * 0.65, truck.y + heading.y * 0.65);
  const terrainBehind = groundHeight(state, truck.x - heading.x * 0.65, truck.y - heading.y * 0.65);
  const terrainPitch = Math.atan((terrainAhead - terrainBehind) * 0.28);
  const pitch = terrainPitch + brake * 0.19;
  const suspension = Math.sin(elapsedMs / 72 + playback.plan.seed * 0.32) * 0.035 + Math.sin(elapsedMs / 141) * 0.027;
  const groundZ = groundHeight(state, truck.x, truck.y) + suspension;
  type Face = { points: { x: number; y: number; depth: number }[]; depth: number; color: string; stroke: string };
  const faces: Face[] = [];
  for (const node of model.nodes) {
    const mesh = node.mesh;
    for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
      const indices = [mesh.indices[i]!, mesh.indices[i + 1]!, mesh.indices[i + 2]!];
      const points: { x: number; y: number; depth: number }[] = [];
      let depthSum = 0;
      for (const vertex of indices) {
        const localX = mesh.positions[vertex * 3]!;
        const localY = mesh.positions[vertex * 3 + 1]!;
        const localZ = mesh.positions[vertex * 3 + 2]!;
        const [orientedX, orientedY, orientedZ] = transformTruckVertex(localX * 0.62, localY * 0.62, localZ * 0.62, yaw, pitch);
        const ground = groundHeight(state, truck.x + heading.x * localX * 0.36, truck.y + heading.y * localX * 0.36);
        const projected = projectWorld(pose, truck.x + orientedX * 0.8, truck.y + orientedY * 0.8, groundZ + orientedZ * 0.8 + (ground - groundZ) * 0.32);
        if (!projected) continue;
        points.push(projected);
        depthSum += projected.depth;
      }
      if (points.length !== 3) continue;
      const mask = mesh.masks[indices[0]!] ?? 0;
      const color = paletteColor(palette, mask);
      faces.push({ points, depth: depthSum / 3, color, stroke: mask === 1 ? palette?.outline ?? "#18262b" : "#101719" });
    }
  }
  faces.sort((a, b) => b.depth - a.depth);
  ctx.lineWidth = 0.65;
  for (const face of faces) {
    const center = face.points.reduce((sum, point) => sum + point.x, 0) / 3;
    const centerY = face.points.reduce((sum, point) => sum + point.y, 0) / 3;
    const depth = face.depth;
    const ix = Math.round(center);
    const iy = Math.round(centerY);
    if (ix >= 0 && ix < MISSION_INTRO_WIDTH && iy >= 0 && iy < MISSION_INTRO_HEIGHT) {
      const terrainDepth = playback.depthBuffer[iy * MISSION_INTRO_WIDTH + ix] ?? Infinity;
      if (terrainDepth + 1.2 < depth) continue;
    }
    ctx.fillStyle = face.color;
    ctx.strokeStyle = face.stroke;
    ctx.beginPath();
    ctx.moveTo(face.points[0]!.x, face.points[0]!.y);
    ctx.lineTo(face.points[1]!.x, face.points[1]!.y);
    ctx.lineTo(face.points[2]!.x, face.points[2]!.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  if (brake > 0.04) {
    const rear = projectWorld(pose, truck.x - heading.x * 0.8, truck.y - heading.y * 0.8, groundZ + 0.1);
    if (rear) {
      const plume = Math.min(1, (brake - 0.04) * 2.8);
      ctx.save();
      ctx.globalAlpha = 0.42 * plume;
      ctx.fillStyle = weatherKindForBiome(state.biome) === "snow" ? "#d9e2db" : weatherKindForBiome(state.biome) === "ash" ? "#a1a9a0" : "#c6a57a";
      for (let i = 0; i < 8; i += 1) {
        const puff = (elapsedMs / 90 + i * 1.7 + playback.plan.seed) % 12;
        const size = 1 + puff * 0.48;
        ctx.beginPath();
        ctx.ellipse(rear.x - puff * 0.55, rear.y + Math.sin(i + elapsedMs / 260) * 1.1, size * 1.55, size * 0.75, -0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

function drawWeather(ctx: CanvasRenderingContext2D, state: SimState, elapsedMs: number, reducedMotion: boolean): void {
  if (reducedMotion) return;
  const count = 26;
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const particle = weatherParticleAt(state.seed, state.biome, i + 100, elapsedMs, MISSION_INTRO_WIDTH, MISSION_INTRO_HEIGHT);
    ctx.globalAlpha = Math.min(0.38, particle.alpha * 1.9);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.ellipse(particle.x, particle.y, Math.max(0.45, particle.size), Math.max(0.35, particle.size * 0.5), particle.rotation, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRoute(ctx: CanvasRenderingContext2D, plan: MissionIntroPlan, pose: CameraPose, progress: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(91, 218, 224, .56)";
  ctx.lineWidth = 0.7;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  let started = false;
  const step = Math.max(1, Math.floor(plan.route.length / 48));
  for (let i = 0; i < plan.route.length; i += step) {
    if ((plan.routeDistances[i] ?? 0) > progress * plan.routeLength + plan.routeLength * 0.13) break;
    const point = plan.route[i]!;
    const projected = projectWorld(pose, point.x + 0.5, point.y + 0.5, heightFromPlan(plan, point.x, point.y));
    if (!projected || projected.x < -2 || projected.x > MISSION_INTRO_WIDTH + 2 || projected.depth < 0.55 || projected.depth > 58) continue;
    if (started) ctx.lineTo(projected.x, projected.y);
    else { ctx.moveTo(projected.x, projected.y); started = true; }
  }
  if (started) ctx.stroke();
  ctx.restore();
}

function drawSignal(ctx: CanvasRenderingContext2D, state: SimState, playback: MissionIntroPlayback, elapsedMs: number, waiting: boolean): void {
  const w = MISSION_INTRO_WIDTH;
  const h = MISSION_INTRO_HEIGHT;
  const biomeLabel = state.biome.toUpperCase();
  ctx.save();
  ctx.fillStyle = "rgba(4, 10, 13, .42)";
  ctx.fillRect(7, 7, 138, 31);
  ctx.fillRect(w - 118, 7, 111, 31);
  ctx.strokeStyle = "rgba(123, 214, 216, .58)";
  ctx.lineWidth = 0.7;
  ctx.strokeRect(7, 7, 138, 31);
  ctx.strokeRect(w - 118, 7, 111, 31);
  ctx.font = "bold 7px monospace";
  ctx.fillStyle = "#a7e0d7";
  ctx.fillText("FIELD COMMAND / LIVE UPLINK", 12, 17);
  ctx.font = "6px monospace";
  ctx.fillStyle = "#d5e4da";
  ctx.fillText(`SEED ${String(state.seed).padStart(4, "0")}  SECTOR ${String(state.missionIndex + 1).padStart(2, "0")}`, 12, 27);
  ctx.fillStyle = "#9fbcb5";
  ctx.fillText(`${biomeLabel.slice(0, 20)} / ${weatherKindForBiome(state.biome).toUpperCase()} FRONT`, 12, 35);
  ctx.textAlign = "right";
  ctx.fillStyle = "#c5e4dc";
  ctx.fillText("CONVOY 01   ROUTE LOCK", w - 12, 17);
  ctx.fillText(`ELEV ${String(Math.round(20 + Math.sin(elapsedMs / 440) * 2)).padStart(2, "0")}M   VIS ${weatherKindForBiome(state.biome) === "mist" ? "LOW" : "NOM"}`, w - 12, 27);
  ctx.fillStyle = waiting ? "#e4cf88" : "#69d4c1";
  ctx.fillText(waiting ? "AWAITING ALL SEATS" : "EN ROUTE TO BASE SITE", w - 12, 35);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(5, 12, 13, .55)";
  ctx.fillRect(7, h - 22, w - 14, 15);
  ctx.fillStyle = "#8ab9b0";
  ctx.font = "6px monospace";
  ctx.fillText(`MAP // ${state.width} x ${state.height}`, 12, h - 12);
  ctx.textAlign = "center";
  ctx.fillStyle = "#b5d9d0";
  ctx.fillText("COMMAND HQ DEPLOYMENT", w / 2, h - 12);
  ctx.textAlign = "right";
  ctx.fillText(waiting ? "LINK SYNC" : "SAT LINK / SECURE", w - 12, h - 12);

  ctx.fillStyle = "rgba(175, 236, 222, .075)";
  for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 0.45);
  const vignette = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, 156);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, .48)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
  const glitchPhase = Math.floor(elapsedMs / 1150) + playback.plan.seed;
  if (!playback.reducedMotion && glitchPhase % 7 === 0) {
    const y = (glitchPhase * 23) % h;
    ctx.fillStyle = "rgba(133, 231, 220, .2)";
    ctx.fillRect(0, y, w, 2);
    ctx.fillStyle = "rgba(215, 126, 91, .16)";
    ctx.fillRect((glitchPhase * 31) % 210, y + 3, 83, 1);
  }
  ctx.restore();
}

function applyChromaticFringe(ctx: CanvasRenderingContext2D): void {
  const image = ctx.getImageData(0, 0, MISSION_INTRO_WIDTH, MISSION_INTRO_HEIGHT);
  const original = new Uint8ClampedArray(image.data);
  for (let y = 0; y < MISSION_INTRO_HEIGHT; y += 1) {
    for (let x = 1; x < MISSION_INTRO_WIDTH - 1; x += 1) {
      const target = (y * MISSION_INTRO_WIDTH + x) * 4;
      const left = target - 4;
      const right = target + 4;
      image.data[target] = Math.min(255, original[target]! * 0.82 + original[left]! * 0.18);
      image.data[target + 2] = Math.min(255, original[target + 2]! * 0.82 + original[right + 2]! * 0.18);
    }
  }
  ctx.putImageData(image, 0, 0);
}

export function drawMissionIntro(
  output: CanvasRenderingContext2D,
  state: SimState,
  playback: MissionIntroPlayback,
  nowMs: number,
  palette?: Palette,
): void {
  let canvas = playback.rasterCanvas;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = MISSION_INTRO_WIDTH;
    canvas.height = MISSION_INTRO_HEIGHT;
    playback.rasterCanvas = canvas;
    playback.rasterCtx = canvas.getContext("2d", { willReadFrequently: true });
  }
  const ctx = playback.rasterCtx;
  if (!ctx) return;
  const elapsedMs = playback.elapsedMs;
  const shouldRender = nowMs - playback.lastRasterMs >= 1000 / 30 || playback.lastRasterMs < 0;
  if (shouldRender) {
    playback.lastRasterMs = nowMs;
    const { pose, truck, truckHeading, brake, progress, rise } = poseFor(state, playback, elapsedMs);
    const image = sampleMode7Terrain(ctx, state, playback, pose, rise);
    ctx.putImageData(image, 0, 0);
    drawRoute(ctx, playback.plan, pose, progress);
    drawDepthAwareProps(ctx, state, playback, pose);
    drawTruck(ctx, state, playback, pose, truck, truckHeading, brake, elapsedMs, palette);
    drawWeather(ctx, state, elapsedMs, playback.reducedMotion);
    drawSignal(ctx, state, playback, elapsedMs, playback.waitingForPlayers);
    if (!playback.reducedMotion) applyChromaticFringe(ctx);
  }
  output.save();
  output.imageSmoothingEnabled = false;
  output.globalAlpha = 1 - smoothstep((elapsedMs - playback.plan.durationMs * 0.91) / (playback.plan.durationMs * 0.09));
  output.drawImage(canvas, 0, 0, output.canvas.width, output.canvas.height);
  output.restore();
}
