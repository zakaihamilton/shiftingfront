import type { AnimFrame, BiomeName, UnitKind } from "../types";

export const GROUND_DUST_FILL = "rgba(140, 130, 115, 0.25)";
export const UNIT_SHADOW_FILL = "#000";
export const UNIT_SHADOW_ALPHA = 0.32;
export const UNIT_SHADOW_MOVE_ALPHA = 0.36;
export const UNIT_SHADOW_OFFSET_X = 0;
export const UNIT_SHADOW_OFFSET_Y = 0;

export type UnitMotionOptions = {
  strideRatio?: number;
  stridePhase?: number;
  directionX?: number;
  directionY?: number;
  dustFill?: string;
  reducedMotion?: boolean;
  angularVelocity?: number;
  footPlantSide?: -1 | 1;
};

type UnitShadowOptions = {
  rotation?: number;
  stridePhase?: number;
  lightDirection?: { x: number; y: number };
  shadowDepth?: number;
};

type UnitShadowRaster = { canvas: HTMLCanvasElement; originX: number; originY: number };

const MAX_UNIT_SHADOW_RASTERS = 128;
const unitShadowRasters = new Map<string, UnitShadowRaster>();

export function movementDustFill(biome: BiomeName): string {
  if (biome === "tundra grid") return "rgba(174, 207, 211, 0.2)";
  if (biome === "volcanic shelf") return "rgba(117, 76, 65, 0.28)";
  if (biome === "jungle wreckage" || biome === "salt marshes") return "rgba(76, 91, 66, 0.2)";
  if (biome === "crystal flats") return "rgba(125, 151, 151, 0.22)";
  if (biome === "rust canyons" || biome === "glass desert") return "rgba(153, 104, 72, 0.26)";
  return GROUND_DUST_FILL;
}

export function unitShadowRadii(kind: UnitKind, scale: number): { radX: number; radY: number } {
  if (kind === "infantry" || kind === "medic") return { radX: 10 * scale, radY: 5 * scale };
  if (kind === "antiArmor") return { radX: 12 * scale, radY: 6 * scale };
  if (kind === "behemoth") return { radX: 22 * scale, radY: 11 * scale };
  if (kind === "tank") return { radX: 18 * scale, radY: 9 * scale };
  return { radX: 16 * scale, radY: 8 * scale };
}

/**
 * Draw a planted isometric contact shadow under a unit.
 * Rendered underneath the unit before drawing sprite geometry.
 */
function paintUnitShadow(
  ctx: CanvasRenderingContext2D,
  kind: UnitKind,
  cx: number,
  groundY: number,
  scale: number,
  alpha: number = 1,
  isMoving: boolean = false,
  options?: UnitShadowOptions,
): void {
  const { radX: baseRadX, radY: baseRadY } = unitShadowRadii(kind, scale);
  const isWalker = kind === "infantry" || kind === "medic" || kind === "antiArmor";
  let radX = baseRadX;
  let radY = baseRadY;

  if (isWalker && isMoving && options?.stridePhase !== undefined) {
    const pulse = Math.cos(options.stridePhase * 2);
    radX = baseRadX * (1.0 + pulse * 0.05);
    radY = baseRadY * (1.0 - pulse * 0.03);
  }

  ctx.save();
  if (options?.lightDirection && kind !== "strikePlane") {
    const light = options.lightDirection;
    const length = isWalker ? 9 : kind === "behemoth" ? 16 : 12;
    // Several translucent ellipses soften the cast edge without Canvas shadowBlur.
    ctx.fillStyle = "#101b26";
    for (let step = 3; step > 0; step--) {
      ctx.globalAlpha = alpha * (0.035 + (options.shadowDepth ?? 0.08) * 0.16);
      ctx.beginPath();
      ctx.ellipse(cx + light.x * length * scale * step / 3, groundY + light.y * length * scale * step / 3,
        radX * (1 + step * 0.08), radY * (1 + step * 0.06), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Aircraft keep the directional cast shadow; ground shadows touch feet/treads.
  ctx.translate(kind === "strikePlane" ? 5 * scale : UNIT_SHADOW_OFFSET_X * scale,
    kind === "strikePlane" ? 4 * scale : UNIT_SHADOW_OFFSET_Y * scale);
  ctx.globalAlpha = alpha * (isMoving ? UNIT_SHADOW_MOVE_ALPHA : UNIT_SHADOW_ALPHA);
  ctx.fillStyle = UNIT_SHADOW_FILL;

  ctx.beginPath();
  ctx.ellipse(cx, groundY, radX, radY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function unitShadowRaster(
  kind: UnitKind,
  scale: number,
  alpha: number,
  options?: UnitShadowOptions,
): UnitShadowRaster | null {
  if (typeof document === "undefined") return null;
  const light = options?.lightDirection;
  const key = `${kind}:${scale}:${alpha}:${light?.x ?? 0}:${light?.y ?? 0}:${options?.shadowDepth ?? 0.08}`;
  const cached = unitShadowRasters.get(key);
  if (cached) {
    unitShadowRasters.delete(key);
    unitShadowRasters.set(key, cached);
    return cached;
  }

  const { radX, radY } = unitShadowRadii(kind, scale);
  const hasCastShadow = Boolean(light && kind !== "strikePlane");
  const castLength = hasCastShadow
    ? kind === "infantry" || kind === "medic" || kind === "antiArmor" ? 9 : kind === "behemoth" ? 16 : 12
    : 0;
  const offsetX = light && hasCastShadow ? light.x * castLength * scale : kind === "strikePlane" ? 5 * scale : 0;
  const offsetY = light && hasCastShadow ? light.y * castLength * scale : kind === "strikePlane" ? 4 * scale : 0;
  const boundsX = Math.abs(offsetX) + radX * (hasCastShadow ? 1.24 : 1);
  const boundsY = Math.abs(offsetY) + radY * (hasCastShadow ? 1.18 : 1);
  const pad = 2;
  const originX = boundsX + pad;
  const originY = boundsY + pad;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(boundsX * 2 + pad * 2);
  canvas.height = Math.ceil(boundsY * 2 + pad * 2);
  const rasterCtx = canvas.getContext("2d");
  if (!rasterCtx) return null;
  paintUnitShadow(rasterCtx, kind, originX, originY, scale, alpha, false, options);

  if (unitShadowRasters.size >= MAX_UNIT_SHADOW_RASTERS) {
    unitShadowRasters.delete(unitShadowRasters.keys().next().value!);
  }
  const raster = { canvas, originX, originY };
  unitShadowRasters.set(key, raster);
  return raster;
}

export function drawUnitShadow(
  ctx: CanvasRenderingContext2D,
  kind: UnitKind,
  cx: number,
  groundY: number,
  scale: number,
  alpha: number = 1,
  isMoving: boolean = false,
  options?: UnitShadowOptions,
): void {
  // Stationary units share the same small set of shadow shapes. Reuse a
  // raster to avoid rebuilding several ellipses for every unit each frame.
  if (!isMoving && ctx.canvas && typeof document !== "undefined") {
    const raster = unitShadowRaster(kind, scale, alpha, options);
    if (raster) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.drawImage(raster.canvas, cx - raster.originX, groundY - raster.originY);
      ctx.restore();
      return;
    }
  }
  paintUnitShadow(ctx, kind, cx, groundY, scale, alpha, isMoving, options);
}

function strideRatioFromOptions(frame: AnimFrame, options: UnitMotionOptions): number {
  if (options.strideRatio !== undefined) return options.strideRatio;
  const phase = options.stridePhase !== undefined
    ? options.stridePhase
    : (frame / 4) * Math.PI * 2;
  return Math.sin(phase);
}

/**
 * Paint ground dust under moving units. Never draws onto sprite pixels.
 */
export function paintUnitMovementFx(
  ctx: CanvasRenderingContext2D,
  kind: UnitKind,
  dx: number,
  _dy: number,
  dw: number,
  _dh: number,
  groundY: number,
  scale: number,
  frame: AnimFrame,
  alpha: number,
  options: UnitMotionOptions = {},
): void {
  if (options.reducedMotion) return;
  const isWalker = kind === "infantry" || kind === "antiArmor" || kind === "medic";
  const ratio = strideRatioFromOptions(frame, options);
  const cx = dx + dw * 0.5;
  const headingX = options.directionX ?? 0;
  const headingY = options.directionY ?? 0;

  ctx.save();
  ctx.fillStyle = options.dustFill ?? GROUND_DUST_FILL;
  ctx.globalAlpha = alpha;

  if (isWalker) {
    if (Math.abs(ratio) < 0.18) {
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        ctx.globalAlpha = alpha * (0.3 + i * 0.12);
        ctx.beginPath();
        ctx.ellipse(
          cx - headingX * (3 + i * 2) * scale + side * 2.4 * scale,
          groundY - headingY * (3 + i * 2) * scale,
          (3.6 + i) * scale,
          (1.6 + i * 0.3) * scale,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const trail = (5 + i * 6) * scale;
      ctx.globalAlpha = alpha * (0.28 - i * 0.065);
      ctx.beginPath();
      ctx.ellipse(
        cx - headingX * trail,
        groundY + 1 * scale - headingY * trail,
        dw * (0.3 + i * 0.045),
        (2.4 + i * 0.7) * scale,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  ctx.restore();
}
