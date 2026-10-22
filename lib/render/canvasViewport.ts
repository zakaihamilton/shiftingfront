export type CanvasViewport = { width: number; height: number };

// Camera, picking, and drawing use CSS pixels. Only the backing stores grow
// with display density, including the offscreen terrain layers.
const viewports = new WeakMap<object, CanvasViewport>();

export function canvasViewport(canvas: CanvasViewport): CanvasViewport {
  return viewports.get(canvas) ?? canvas;
}

export function resizeRenderCanvas(canvas: HTMLCanvasElement, viewport: CanvasViewport, density = 1): void {
  const width = Math.max(1, Math.round(viewport.width * density));
  const height = Math.max(1, Math.round(viewport.height * density));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  viewports.set(canvas, { width: viewport.width, height: viewport.height });
}

export function canvasDensity(canvas: CanvasViewport): number {
  return canvas.width / canvasViewport(canvas).width;
}

export function prepareRenderContext(ctx: CanvasRenderingContext2D): void {
  const viewport = canvasViewport(ctx.canvas);
  ctx.setTransform(ctx.canvas.width / viewport.width, 0, 0, ctx.canvas.height / viewport.height, 0, 0);
}

/** Composite a backing store into logical coordinates without scaling twice. */
export function drawRenderCanvas(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, x = 0, y = 0): void {
  const { width, height } = canvasViewport(source);
  ctx.drawImage(source, x, y, width, height);
}

/** Convert a locally transformed weapon socket back to logical screen space. */
export function transformedCanvasPoint(ctx: CanvasRenderingContext2D, x: number, y: number): { x: number; y: number } {
  const t = ctx.getTransform();
  const viewport = canvasViewport(ctx.canvas);
  return {
    x: (t.a * x + t.c * y + t.e) * viewport.width / ctx.canvas.width,
    y: (t.b * x + t.d * y + t.f) * viewport.height / ctx.canvas.height,
  };
}
