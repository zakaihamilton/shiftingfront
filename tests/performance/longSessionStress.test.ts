import { describe, expect, it, vi } from "vitest";
import { createMission, tick } from "../../lib/sim/api";
import { MAX_CATCH_UP_TICKS_PER_FRAME, startLoop } from "../../lib/game/loop";
import type { SimState } from "../../lib/types";

describe("long-session stress and reliability", () => {
  it("runs 5,000+ continuous simulation ticks across 5 mission cycles without heap leaks or entity explosion", () => {
    const memoryBefore = process.memoryUsage().heapUsed;
    const missionCount = 5;
    const ticksPerMission = 1000; // 5 x 1000 = 5000 ticks total

    for (let missionIndex = 0; missionIndex < missionCount; missionIndex++) {
      const state = createMission({ seed: 100 + missionIndex, missionIndex });
      expect(state.entities.length).toBeGreaterThan(0);

      for (let t = 0; t < ticksPerMission; t++) {
        tick(state);
      }

      // Verify state integrity after 1,000 ticks
      expect(state.tick).toBe(ticksPerMission);

      // Verify spatial and coordinate sanity
      for (const entity of state.entities) {
        expect(Number.isFinite(entity.x)).toBe(true);
        expect(Number.isFinite(entity.y)).toBe(true);
        expect(Number.isFinite(entity.hp)).toBe(true);
        expect(entity.x).toBeGreaterThanOrEqual(0);
        expect(entity.x).toBeLessThanOrEqual(state.width);
        expect(entity.y).toBeGreaterThanOrEqual(0);
        expect(entity.y).toBeLessThanOrEqual(state.height);
      }

      // Ensure entity count stays reasonably bounded (no runaway unit spawning)
      expect(state.entities.length).toBeLessThan(500);
    }

    // Force garbage collection if exposed, or check heap delta
    if (typeof global.gc === "function") {
      global.gc();
    }
    const memoryAfter = process.memoryUsage().heapUsed;
    const heapGrowthMb = (memoryAfter - memoryBefore) / (1024 * 1024);

    // Heap growth across 5 completed 1,000-tick missions should remain well within healthy limits (< 50MB)
    expect(heapGrowthMb).toBeLessThan(50);
  });

  it("recovers gracefully from a 5,000ms frame gap without death-spiraling", () => {
    let now = 0;
    let nextRafId = 1;
    const rafs = new Map<number, FrameRequestCallback>();
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextRafId++;
      rafs.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafs.delete(id);
    });

    let state: SimState = createMission({ seed: 421, missionIndex: 0 });
    let totalTicksExecuted = 0;

    const loop = startLoop({
      getState: () => state,
      setState: (s) => { state = s; },
      drainCommands: () => [],
      step: (s, cmds) => {
        totalTicksExecuted++;
        return tick(s, cmds);
      },
      onTick: () => undefined,
    });

    const flushFrame = (time: number) => {
      now = time;
      const [id, callback] = rafs.entries().next().value as [number, FrameRequestCallback];
      rafs.delete(id);
      callback(time);
    };

    // Frame 1: regular 16ms frame
    flushFrame(16);
    expect(totalTicksExecuted).toBe(0); // 16ms < TICK_MS (83.33ms)

    // Simulate huge 5,000ms delay (e.g. background tab or intensive system stall)
    flushFrame(5016);

    // On the first frame after the 5,000ms gap, ticks should be capped at MAX_CATCH_UP_TICKS_PER_FRAME (12)
    expect(totalTicksExecuted).toBe(MAX_CATCH_UP_TICKS_PER_FRAME);

    // The accumulator was clamped to MAX_ACCUMULATOR_CAP_MS (48 ticks max backlog)
    // Over the next 3 frames, it continues catch-up bursts of 12 ticks
    flushFrame(5032);
    expect(totalTicksExecuted).toBe(24);

    flushFrame(5048);
    expect(totalTicksExecuted).toBe(36);

    flushFrame(5064);
    expect(totalTicksExecuted).toBe(48);

    // On the 5th frame, the backlog is fully drained and normal pacing resumes
    flushFrame(5080);
    expect(totalTicksExecuted).toBe(48); // No extra backlog ticks

    loop.stop();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
