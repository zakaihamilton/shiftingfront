// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFixture } from "../../lib/sim/fixtures";
import type { LoopOptions } from "../../lib/game/loop";

const startLoop = vi.hoisted(() => vi.fn(() => ({ stop: vi.fn() })));
vi.mock("@/lib/game/loop", () => ({ startLoop }));
vi.mock("@/lib/audio/battlefield", () => ({ dispatchBattlefieldAudio: vi.fn() }));
vi.mock("@/lib/audio/music", () => ({ pauseMusic: vi.fn(), setMusicIntensity: vi.fn() }));
vi.mock("@/lib/audio/synth", () => ({ playSfx: vi.fn() }));
vi.mock("@/lib/persist/campaign", () => ({ completeMission: vi.fn(), readCampaignProgress: vi.fn(), writeCampaignProgress: vi.fn() }));
vi.mock("@/lib/persist/telemetry", () => ({ recordTelemetry: vi.fn(), telemetryFromMission: vi.fn() }));
vi.mock("@/lib/render/camera", () => ({ cameraPanBounds: vi.fn(), clampCamera: vi.fn(), panAvailability: vi.fn(), panCamera: vi.fn(), panOffset: vi.fn(), EDGE_PAN_DELAY_MS: 120 }));
vi.mock("@/lib/render/fx", () => ({ burstsFromEvents: vi.fn(() => ({ bursts: [], nextId: 1 })) }));
vi.mock("@/lib/sim/debrief", () => ({ missionMedals: vi.fn(), missionScore: vi.fn() }));
vi.mock("@/lib/ui/copy", () => ({ commandRejectionMessage: vi.fn() }));

import { useGameLoop } from "../../components/game/hooks/useGameLoop";

const ref = <T,>(current: T) => ({ current });

afterEach(() => {
  cleanup();
  startLoop.mockClear();
});

describe("useGameLoop save retry lifecycle", () => {
  it("keeps a failed terminal save retryable when the loop effect remounts", () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const saveSession = {
      write: vi.fn().mockReturnValueOnce("failed").mockReturnValue("saved"),
      adoptCurrent: vi.fn(),
      markExternalChange: vi.fn(),
    };
    const props: Parameters<typeof useGameLoop>[0] = {
      stateRef: ref(state),
      setState: vi.fn(),
      cmdQ: ref([]),
      pausedRef: ref(true),
      camRef: ref({ x: 0, y: 0, zoom: 1 }),
      canvasRef: ref(null),
      keys: ref({}),
      edgePanHover: ref(null),
      panHold: ref(null),
      panAvailRef: ref({ left: false, right: false, up: false, down: false }),
      setPanAvail: vi.fn(),
      applyEdgePan: vi.fn(),
      fxRef: ref([]),
      fxSeq: ref(0),
      terminalSaveRef: ref(false),
      campaignRecordedRef: ref(false),
      redraw: vi.fn(),
      onAlert: vi.fn(),
      saveSession,
    };
    const { rerender } = renderHook((value) => useGameLoop(value), { initialProps: props });
    state.result = "lost";
    const runFrame = (now: number) => {
      const options = (startLoop.mock.calls.at(-1) as unknown as [LoopOptions])[0];
      act(() => options.onFrame?.(now, state, true, 0, 0));
    };

    runFrame(1_000);
    expect(saveSession.write).toHaveBeenCalledTimes(1);
    rerender({ ...props, redraw: vi.fn() });
    runFrame(3_000);
    expect(saveSession.write).toHaveBeenCalledTimes(2);
  });
});
