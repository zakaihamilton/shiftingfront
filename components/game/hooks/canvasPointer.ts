import { canvasViewport } from "@/lib/render/canvasViewport";

export function canvasPointerPos(e: {
  currentTarget: { getBoundingClientRect(): DOMRect; width: number; height: number };
  clientX: number;
  clientY: number;
}) {
  const canvas = e.currentTarget;
  const r = canvas.getBoundingClientRect();
  const scaleX = canvasViewport(canvas).width / Math.max(1, r.width);
  const scaleY = canvasViewport(canvas).height / Math.max(1, r.height);
  return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
}
