import { type Camera, tileToScreen } from "../iso";

export type SpatialAudio = {
  audible: boolean;
  pan: number;
  gain: number;
};

export function spatialAudioForWorld(
  x: number,
  y: number,
  camera: Camera,
  width: number,
  height: number,
): SpatialAudio {
  const point = tileToScreen(x, y, camera);
  const nx = (point.x - width / 2) / Math.max(1, width / 2);
  const ny = (point.y - height / 2) / Math.max(1, height / 2);
  const edgeDistance = Math.max(Math.abs(nx), Math.abs(ny));
  return {
    audible: edgeDistance <= 1.25,
    pan: Math.max(-0.85, Math.min(0.85, nx * 0.78)),
    gain: Math.max(0.68, 1 - Math.max(0, edgeDistance - 0.35) * 0.36),
  };
}
