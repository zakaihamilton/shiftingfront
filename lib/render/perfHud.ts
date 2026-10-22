import { prepareRenderContext } from "./canvasViewport";
import { chromeMonoFont } from "../ui/chromeFont";

export type WorldPhaseTimings = {
  terrain: number;
  fx: number;
  entities: number;
  combat: number;
};

const PERF_STORAGE_KEY = "shiftingfront:perf";

let enabled: boolean | undefined;
let lastFrameMs = 0;
let fpsEma = 0;

function readPerfFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage?.getItem(PERF_STORAGE_KEY) === "1") return true;
  } catch {
    // ignore quota / privacy errors
  }
  try {
    return new URLSearchParams(window.location.search).get("perf") === "1";
  } catch {
    return false;
  }
}

export function isPerfHudEnabled(): boolean {
  if (enabled === undefined) enabled = readPerfFlag();
  return enabled;
}

export function resetPerfHudFlag(): void {
  enabled = undefined;
  lastFrameMs = 0;
  fpsEma = 0;
}

export function composePerfHudLine(
  nowMs: number,
  world: WorldPhaseTimings,
  minimapMs: number,
): string {
  const dt = lastFrameMs > 0 ? nowMs - lastFrameMs : 16.67;
  lastFrameMs = nowMs;
  const fps = dt > 0.001 ? 1000 / dt : 0;
  fpsEma = fpsEma > 0 ? fpsEma * 0.9 + fps * 0.1 : fps;
  const frame = world.terrain + world.fx + world.entities + world.combat + minimapMs;
  const phases: Array<[string, number]> = [
    ["terrain", world.terrain],
    ["fx", world.fx],
    ["entities", world.entities],
    ["combat", world.combat],
    ["minimap", minimapMs],
  ];
  let slowest = phases[0]!;
  for (const phase of phases) {
    if (phase[1] > slowest[1]) slowest = phase;
  }
  return `${fpsEma.toFixed(0)} fps  ${frame.toFixed(1)}ms  ${slowest[0]} ${slowest[1].toFixed(1)}ms`;
}

export function drawPerfHud(
  ctx: CanvasRenderingContext2D,
  nowMs: number,
  world: WorldPhaseTimings,
  minimapMs: number,
): void {
  const line = composePerfHudLine(nowMs, world, minimapMs);
  ctx.save();
  prepareRenderContext(ctx);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  ctx.font = chromeMonoFont(12);
  const padX = 8;
  const width = Math.ceil(ctx.measureText(line).width) + padX * 2;
  const height = 22;
  ctx.fillStyle = "rgba(8, 12, 16, 0.72)";
  ctx.fillRect(8, 8, width, height);
  ctx.fillStyle = "#d7e6df";
  ctx.textBaseline = "middle";
  ctx.fillText(line, 8 + padX, 8 + height / 2);
  ctx.restore();
}
