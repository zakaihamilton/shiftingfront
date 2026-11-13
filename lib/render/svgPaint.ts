function num(el: Element, name: string, fallback = 0): number {
  const raw = el.getAttribute(name);
  if (raw == null || raw === "") return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function attr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

function resolvePaint(
  value: string | null,
  grads: Map<string, CanvasGradient | string>,
  fallback: string,
): string | CanvasGradient {
  if (!value || value === "none") return "transparent";
  const url = value.match(/^url\(#([^)]+)\)$/);
  if (url) return grads.get(url[1]!) ?? fallback;
  return value;
}

function collectGradients(root: Element, ctx: CanvasRenderingContext2D): Map<string, CanvasGradient | string> {
  const grads = new Map<string, CanvasGradient | string>();
  for (const el of root.querySelectorAll("linearGradient, radialGradient")) {
    const id = el.getAttribute("id");
    if (!id) continue;
    const tag = el.tagName.toLowerCase();
    const cx = num(el, "cx", 0);
    const cy = num(el, "cy", 0);
    const g = tag === "radialGradient"
      ? ctx.createRadialGradient(
          num(el, "fx", cx),
          num(el, "fy", cy),
          0,
          cx,
          cy,
          num(el, "r", 0),
        )
      : ctx.createLinearGradient(num(el, "x1", 0), num(el, "y1", 0), num(el, "x2", 0), num(el, "y2", 0));
    const stops = el.querySelectorAll("stop");
    if (!stops.length) {
      grads.set(id, "#888");
      continue;
    }
    for (const stop of stops) {
      let offset = num(stop, "offset", 0);
      const raw = stop.getAttribute("offset") ?? "0";
      if (raw.endsWith("%")) offset = Number.parseFloat(raw) / 100;
      const color = stop.getAttribute("stop-color") || "#000";
      const opacity = stop.getAttribute("stop-opacity");
      g.addColorStop(Math.min(1, Math.max(0, offset)), opacity && opacity !== "1" ? colorToAlpha(color, Number(opacity)) : color);
    }
    grads.set(id, g);
  }
  return grads;
}

function colorToAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const hex = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}

function applyStroke(ctx: CanvasRenderingContext2D, el: Element): void {
  ctx.lineWidth = Math.max(num(el, "stroke-width", 1), 0.75);
  const cap = attr(el, "stroke-linecap");
  ctx.lineCap = cap === "round" || cap === "butt" || cap === "square" ? cap : "square";
  const join = attr(el, "stroke-linejoin");
  ctx.lineJoin = join === "round" || join === "bevel" || join === "miter" ? join : "miter";
}

function paintShape(ctx: CanvasRenderingContext2D, el: Element, grads: Map<string, CanvasGradient | string>, opacity: number): void {
  const fill = resolvePaint(attr(el, "fill") ?? "#000", grads, "#000");
  const stroke = resolvePaint(attr(el, "stroke"), grads, "#000");
  const fillOp = num(el, "fill-opacity", 1) * opacity * num(el, "opacity", 1);
  const strokeOp = num(el, "stroke-opacity", 1) * opacity * num(el, "opacity", 1);
  applyStroke(ctx, el);
  ctx.beginPath();
  const tag = el.tagName.toLowerCase();
  if (tag === "path") {
    const d = attr(el, "d");
    if (!d) return;
    try {
      const path = new Path2D(d);
      if (fill !== "transparent") {
        ctx.globalAlpha = fillOp;
        ctx.fillStyle = fill;
        ctx.fill(path);
      }
      if (stroke !== "transparent" && attr(el, "stroke")) {
        ctx.globalAlpha = strokeOp;
        ctx.strokeStyle = stroke;
        ctx.stroke(path);
      }
    } catch {
      return;
    }
    return;
  }
  if (tag === "ellipse" || tag === "circle") {
    const cx = num(el, "cx");
    const cy = num(el, "cy");
    const rx = tag === "circle" ? num(el, "r") : num(el, "rx");
    const ry = tag === "circle" ? num(el, "r") : num(el, "ry");
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  } else if (tag === "rect") {
    ctx.rect(num(el, "x"), num(el, "y"), num(el, "width"), num(el, "height"));
  } else if (tag === "line") {
    ctx.moveTo(num(el, "x1"), num(el, "y1"));
    ctx.lineTo(num(el, "x2"), num(el, "y2"));
  } else if (tag === "polygon" || tag === "polyline") {
    const pts = parsePoints(attr(el, "points") ?? "");
    if (pts.length < 2) return;
    ctx.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
    if (tag === "polygon") ctx.closePath();
  } else {
    return;
  }
  if (fill !== "transparent" && tag !== "line") {
    ctx.globalAlpha = fillOp;
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke !== "transparent" && attr(el, "stroke")) {
    ctx.globalAlpha = strokeOp;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function parsePoints(raw: string): number[] {
  return raw.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
}

function paintNode(ctx: CanvasRenderingContext2D, el: Element, grads: Map<string, CanvasGradient | string>, opacity: number): void {
  const tag = el.tagName.toLowerCase();
  if (tag === "defs" || tag === "title" || tag === "desc") return;
  if (tag === "svg" || tag === "g") {
    const next = opacity * num(el, "opacity", 1);
    for (const child of el.children) paintNode(ctx, child, grads, next);
    return;
  }
  paintShape(ctx, el, grads, opacity);
}

export function paintSvg(ctx: CanvasRenderingContext2D, svg: string): void {
  if (typeof DOMParser === "undefined") return;
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (root?.tagName.toLowerCase() !== "svg") return;
  ctx.save();
  ctx.lineJoin = "miter";
  ctx.lineCap = "square";
  const grads = collectGradients(root, ctx);
  paintNode(ctx, root, grads, 1);
  ctx.restore();
  ctx.globalAlpha = 1;
}
