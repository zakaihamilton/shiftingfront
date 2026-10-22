import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { MAX_CATCH_UP_TICKS_PER_FRAME, startLoop } from "../../lib/game/loop";
import { createMission, tick } from "../../lib/sim/api";
import type { SimState } from "../../lib/types";

describe("long-session stress and reliability", () => {
  it("runs 5,000+ continuous simulation ticks across 5 mission cycles without heap leaks or entity explosion", { timeout: 60_000 }, () => {
    // Worker threads reject --expose-gc, and heapUsed without a collection
    // still includes the previous mission. Measure retained heap in a child
    // process that can actually collect.
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const probe = fileURLToPath(new URL("./longSessionHeapProbe.ts", import.meta.url));
    const result = spawnSync(process.execPath, ["--expose-gc", "--import", "tsx", probe], {
      cwd: root,
      encoding: "utf8",
      timeout: 50_000,
    });

    expect(result.status, result.stderr || result.stdout || result.error?.message).toBe(0);
    const report = JSON.parse(result.stdout) as { heapGrowthMb: number };
    // Rules 2 maps are larger than the old 48–96 layouts. Retained growth
    // across five 1,000-tick missions should still stay well under a leak.
    expect(report.heapGrowthMb).toBeLessThan(100);
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
