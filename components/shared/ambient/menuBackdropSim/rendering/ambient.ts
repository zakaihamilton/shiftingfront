export function paintAmbientSignals(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const minDimension = Math.min(w, h);
  const sweep = ((t * 0.006) % 1) * Math.PI * 2;
  const radarX = w * 0.84;
  const radarY = h * 0.2;
  const radarRadius = Math.max(34, minDimension * 0.13);
  const reticleX = w * 0.16 + Math.sin(t * 0.004) * Math.min(24, w * 0.02);
  const reticleY = h * 0.76 + Math.cos(t * 0.003) * Math.min(16, h * 0.02);
  const pulse = 0.38 + Math.sin(t * 0.055) * 0.1;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#5ce1e6";
  ctx.fillStyle = "#5ce1e6";

  ctx.globalAlpha = 0.11;
  ctx.beginPath();
  ctx.arc(radarX, radarY, radarRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(radarX, radarY, radarRadius * 0.64, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(radarX - radarRadius, radarY);
  ctx.lineTo(radarX + radarRadius, radarY);
  ctx.moveTo(radarX, radarY - radarRadius);
  ctx.lineTo(radarX + radarRadius, radarY);
  ctx.stroke();

  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.moveTo(radarX, radarY);
  ctx.lineTo(radarX + Math.cos(sweep) * radarRadius, radarY + Math.sin(sweep) * radarRadius);
  ctx.stroke();

  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(reticleX, reticleY, 16 + Math.sin(t * 0.04) * 2, 0, Math.PI * 2);
  ctx.moveTo(reticleX - 25, reticleY);
  ctx.lineTo(reticleX - 7, reticleY);
  ctx.moveTo(reticleX + 7, reticleY);
  ctx.lineTo(reticleX + 25, reticleY);
  ctx.moveTo(reticleX, reticleY - 25);
  ctx.lineTo(reticleX, reticleY + 7);
  ctx.moveTo(reticleX, reticleY + 7);
  ctx.lineTo(reticleX, reticleY + 25);
  ctx.stroke();

  ctx.globalAlpha = 0.08;
  const scanY = ((t * 0.45) % (h + 90)) - 45;
  ctx.beginPath();
  ctx.moveTo(0, scanY);
  ctx.lineTo(w, scanY);
  ctx.stroke();

  ctx.globalAlpha = 0.18;
  const cornerLength = Math.max(18, minDimension * 0.045);
  for (const [x, y, xDirection, yDirection] of [
    [18, 58, 1, 1],
    [w - 18, 58, -1, 1],
    [18, h - 34, 1, -1],
    [w - 18, h - 34, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y + cornerLength * yDirection);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerLength * xDirection, y);
    ctx.stroke();
  }

  ctx.restore();
}
