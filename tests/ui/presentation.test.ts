import { describe, expect, it, vi } from "vitest";
import type { Camera } from "../../lib/iso";
import type { SimState } from "../../lib/types";
import { createPresentationCoordinator } from "../../components/game/hooks/runtime/presentation";

describe("battlefield presentation coordinator", () => {
  it("announces the terminal rescue milestone when milestones share a tick", () => {
    const onTacticalAnnouncement = vi.fn();
    const coordinator = createPresentationCoordinator({
      cameraRef: { current: {} as Camera },
      canvasRef: { current: null },
      fxRef: { current: [] },
      fxSequence: { current: 0 },
      onAlert: vi.fn(),
      onTacticalAnnouncement,
      onCommandNotice: vi.fn(),
    });

    coordinator.onTick({ tick: 12, result: "playing", runtime: { director: { phase: "opening" } } } as SimState, [
      { type: "objectiveMilestone", kind: "rescue", milestone: "firstReturned", text: "First returned" },
      { type: "objectiveMilestone", kind: "rescue", milestone: "complete", text: "All home" },
    ], 0);

    expect(onTacticalAnnouncement).toHaveBeenLastCalledWith("All home");
  });
});
