import { type ScenerySample, sceneryAt } from "../gen/map";
import type { AtlasWorld } from "./terrainMaterials";

export type SceneryMemoWorld = AtlasWorld & { tick?: number };

function sceneryKey(x: number, y: number): number {
  return ((x + 512) << 12) | (y + 512);
}

/**
 * Shares terrain lookup results for one simulation tick. The memo resets at
 * the same tick boundary used by terrain updates, so paint and overlays avoid
 * repeated map sampling without retaining stale state between frames.
 */
export class SceneryMemo {
  private state: SceneryMemoWorld | null = null;
  private tick = -1;
  private readonly samples = new Map<number, ScenerySample>();

  clear(): void {
    this.state = null;
    this.tick = -1;
    this.samples.clear();
  }

  sample(state: SceneryMemoWorld, x: number, y: number): ScenerySample {
    const tick = state.tick ?? 0;
    if (this.state !== state || this.tick !== tick) {
      this.state = state;
      this.tick = tick;
      this.samples.clear();
    }
    const key = sceneryKey(x, y);
    let sample = this.samples.get(key);
    if (!sample) {
      sample = sceneryAt(state, x, y);
      this.samples.set(key, sample);
    }
    return sample;
  }
}
