// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { createCamera } from "../../lib/iso";
import { makeFixture } from "../../lib/sim/fixtures";
import { markFreshLaunchIntent } from "../../lib/persist/navigation";
import { localStorageAdapter, readSave, saveKey, writeSave, writeSlot } from "../../lib/persist/save";
import { freshCampaignProgress, campaignKey, readCampaignProgress, writeCampaignProgress, completeMission } from "../../lib/persist/campaign";
import { TELEMETRY_KEY } from "../../lib/persist/telemetry";
import type { LoopOptions } from "../../lib/game/loop";
import type { BuildingKind, SimEvent } from "../../lib/types";

const renderGameFrame = vi.hoisted(() => vi.fn(() => ({
  worldCtx: null,
  miniCtx: null,
  secondaryMiniCtx: null,
  fx: [],
})));

const stopLoop = vi.hoisted(() => vi.fn());
const startLoop = vi.hoisted(() => vi.fn(() => ({ stop: stopLoop })));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/audio/synth", () => ({ beep: vi.fn(), setSfxEnabled: vi.fn(), playSfx: vi.fn() }));
vi.mock("@/lib/audio/music", () => ({
  pauseMusic: vi.fn(),
  setMusicEnabled: vi.fn(),
  setMusicCue: vi.fn(),
  setMusicDucked: vi.fn(),
  setMusicIntensity: vi.fn(),
  clearMusicPosition: vi.fn(),
  TUTORIAL_MUSIC_MISSION: -1,
}));
vi.mock("@/lib/audio/mixer", () => ({ setAudioLevels: vi.fn() }));
vi.mock("@/lib/audio/battlefield", () => ({ dispatchBattlefieldAudio: vi.fn() }));
vi.mock("@/lib/game/loop", () => ({ startLoop }));
vi.mock("../../components/game/renderFrame", () => ({ renderGameFrame }));

import { useGameRenderer } from "../../components/game/hooks/useGameRenderer";
import { initialMission } from "../../components/game/hooks/useGameSession";
import { useGameRuntime } from "../../components/game/hooks/useGameRuntime";
import { createGameRuntimeSurfaces } from "../../components/game/hooks/runtime/surfaces";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  renderGameFrame.mockClear();
  startLoop.mockClear();
  stopLoop.mockClear();
});

beforeEach(() => {
  class FakeResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

describe("useGameRenderer", () => {
  it("skips painting when the canvas host is missing and paints once both exist", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    const { result } = renderHook(() => {
      const stateRef = useRef(state);
      const hostRef = useRef<HTMLDivElement | null>(null);
      const canvasRef = useRef<HTMLCanvasElement | null>(null);
      const miniRef = useRef<HTMLCanvasElement | null>(null);
      const mobileMiniRef = useRef<HTMLCanvasElement | null>(null);
      const camRef = useRef(createCamera());
      const selected = useRef(new Set<number>());
      const hoverRef = useRef<{ x: number; y: number } | null>(null);
      const cursorRef = useRef<{ x: number; y: number } | null>(null);
      const boxRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
      const place = useRef<BuildingKind | null>(null);
      const repair = useRef(false);
      const sell = useRef(false);
      const renderer = useGameRenderer({
        stateRef,
        hostRef,
        canvasRef,
        miniRef,
        mobileMiniRef,
        camRef,
        selected,
        hoverRef,
        cursorRef,
        boxRef,
        place,
        repair,
        sell,
      });
      return { renderer, hostRef, canvasRef };
    });

    act(() => {
      result.current.renderer.redraw(1_000, 0.25);
    });
    expect(renderGameFrame).not.toHaveBeenCalled();

    const canvas = document.createElement("canvas");
    const host = document.createElement("div");
    result.current.canvasRef.current = canvas;
    result.current.hostRef.current = host;

    act(() => {
      result.current.renderer.redraw(1_000, 0.25);
    });
    expect(renderGameFrame).toHaveBeenCalledOnce();
    expect(renderGameFrame).toHaveBeenCalledWith(expect.objectContaining({
      state,
      canvas,
      host,
      nowMs: 1_000,
      subTickAlpha: 0.25,
    }));
  });
});

describe("useGameRuntime", () => {
  it("resumes the matching save when opened without a fresh-deployment flag", () => {
    const saved = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    saved.tick = 120;
    saved.credits[0] = 9876;
    expect(writeSave(localStorageAdapter(), saved)).toBe(true);

    const resumed = initialMission(421, 0, false, false);

    expect(resumed.tick).toBe(120);
    expect(resumed.credits[0]).toBe(9876);
  });

  it("starts a fresh mission when explicitly requested even when a save exists", () => {
    const saved = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    saved.tick = 120;
    expect(writeSave(localStorageAdapter(), saved)).toBe(true);

    const fresh = initialMission(421, 0, false, false, true);

    expect(fresh.tick).toBe(0);
  });

  it("resumes a fresh-flagged mission after a browser reload", () => {
    const saved = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    saved.tick = 120;
    saved.credits[0] = 9876;
    expect(writeSave(localStorageAdapter(), saved)).toBe(true);

    const getEntriesByType = vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([
      { type: "reload" } as PerformanceNavigationTiming,
    ]);

    const resumed = initialMission(421, 0, false, false, true);

    expect(resumed.tick).toBe(120);
    expect(resumed.credits[0]).toBe(9876);
    getEntriesByType.mockRestore();
  });

  it("honors a fresh SPA launch after the document was reloaded", () => {
    const saved = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    saved.tick = 120;
    expect(writeSave(localStorageAdapter(), saved)).toBe(true);

    const getEntriesByType = vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([
      { type: "reload" } as PerformanceNavigationTiming,
    ]);
    markFreshLaunchIntent(421, 0);

    const fresh = initialMission(421, 0, false, false, true);

    expect(fresh.tick).toBe(0);
    getEntriesByType.mockRestore();
  });

  it("uses the in-memory fresh intent when sessionStorage rejects the marker", () => {
    const saved = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    saved.tick = 120;
    expect(writeSave(localStorageAdapter(), saved)).toBe(true);

    const getEntriesByType = vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([
      { type: "reload" } as PerformanceNavigationTiming,
    ]);
    const setItem = vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("session storage unavailable");
    });
    markFreshLaunchIntent(421, 0);

    const fresh = initialMission(421, 0, false, false, true);

    expect(fresh.tick).toBe(0);
    setItem.mockRestore();
    getEntriesByType.mockRestore();
  });

  it("loads a named slot even when a later autosave exists", () => {
    const saved = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    saved.tick = 120;
    expect(writeSave(localStorageAdapter(), saved)).toBe(true);
    writeCampaignProgress(localStorageAdapter(), completeMission(freshCampaignProgress(421), 1, 3, 800));

    const slotState = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    slotState.tick = 12;
    const written = writeSlot(localStorageAdapter(), {
      name: "Bridgehead",
      state: slotState,
      campaign: completeMission(freshCampaignProgress(421), 0, 1, 100),
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    const loaded = initialMission(421, 0, true, false, false, written.id);

    expect(loaded.tick).toBe(12);
    expect(readSave(localStorageAdapter(), 421)?.tick).toBe(12);
    expect(readCampaignProgress(localStorageAdapter(), 421).completedMissions).toEqual([0]);
  });

  it("resumes the active autosave when reloading a slot-loaded mission instead of resetting to slot snapshot", () => {
    const slotState = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    slotState.tick = 12;
    slotState.credits[0] = 500;
    const written = writeSlot(localStorageAdapter(), {
      name: "Bridgehead",
      state: slotState,
      campaign: completeMission(freshCampaignProgress(421), 0, 1, 100),
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    // Player continues playing and achieves tick 150 with 2500 credits, autosaved
    const liveAutosave = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    liveAutosave.tick = 150;
    liveAutosave.credits[0] = 2500;
    expect(writeSave(localStorageAdapter(), liveAutosave)).toBe(true);

    const getEntriesByType = vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([
      { type: "reload" } as PerformanceNavigationTiming,
    ]);

    // On browser reload, initialMission with slotId should resume live autosave, NOT revert to slot snapshot
    const resumed = initialMission(421, 0, false, false, false, written.id);

    expect(resumed.tick).toBe(150);
    expect(resumed.credits[0]).toBe(2500);
    expect(readSave(localStorageAdapter(), 421)?.tick).toBe(150);

    getEntriesByType.mockRestore();
  });

  it("cleans up the slot query parameter from the URL when loading a slot", () => {
    const slotState = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const written = writeSlot(localStorageAdapter(), {
      name: "Bridgehead",
      state: slotState,
      campaign: freshCampaignProgress(421),
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    window.history.pushState({}, "", `/play?seed=0421&mission=0&slot=${written.id}`);
    expect(window.location.search).toContain(`slot=${written.id}`);

    initialMission(421, 0, false, false, false, written.id);

    expect(window.location.search).not.toContain("slot=");
    expect(window.location.search).toContain("resume=1");
  });

  it("saves the current state when the page is unloaded", () => {
    const { result } = renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: false, tutorial: false }));
    const loopOptions = (startLoop.mock.calls as unknown[][])[0]?.[0] as { setState: (state: typeof result.current.state) => void };
    const current = { ...result.current.state, tick: 120 };

    loopOptions.setState(current);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(readSave(localStorageAdapter(), 421)?.tick).toBe(120);
  });

  it("does not overwrite a checkpoint when loading another mission triggers pagehide", () => {
    const { result } = renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: false, tutorial: false }));
    const checkpoint = { ...makeFixture({ seed: 421, win: { kind: "annihilate" } }), missionIndex: 1, tick: 88 };
    const written = writeSlot(localStorageAdapter(), {
      name: "Earlier mission",
      state: checkpoint,
      campaign: freshCampaignProgress(421),
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    const entry = result.current.session.listLoadEntries().find((candidate) => candidate.kind === "slot" && candidate.id === written.id);
    expect(entry).toBeDefined();
    act(() => result.current.session.loadArchiveEntry(entry!));

    act(() => window.dispatchEvent(new Event("pagehide")));

    expect(readSave(localStorageAdapter(), 421)).toMatchObject({ missionIndex: 1, tick: 88 });
  });

  it("does not replace a newer same-seed save during unload", () => {
    const { result } = renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: false, tutorial: false }));
    const loopOptions = (startLoop.mock.calls as unknown[][])[0]?.[0] as { setState: (state: typeof result.current.state) => void };
    loopOptions.setState({ ...result.current.state, tick: 120 });

    const replacement = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    replacement.tick = 77;
    expect(writeSave(localStorageAdapter(), replacement)).toBe(true);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(readSave(localStorageAdapter(), 421)?.tick).toBe(77);
  });

  it("honors cross-tab storage notifications even when the raw value is unchanged", () => {
    const saved = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    expect(writeSave(localStorageAdapter(), saved)).toBe(true);
    const raw = window.localStorage.getItem(saveKey(421));
    const { result } = renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: true, tutorial: false }));
    const loopOptions = (startLoop.mock.calls as unknown[][])[0]?.[0] as { setState: (state: typeof result.current.state) => void };
    loopOptions.setState({ ...result.current.state, tick: 120 });

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: saveKey(421),
        oldValue: raw,
        newValue: raw,
      }));
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(readSave(localStorageAdapter(), 421)?.tick).toBe(0);
  });

  it("starts the sim loop and exposes the gameplay runtime contract", () => {
    const { result } = renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: false, tutorial: false }));

    expect(startLoop).toHaveBeenCalledOnce();
    expect(result.current.campaign.seedNumber).toBe(421);
    expect(result.current.state.seed).toBe(421);
    expect(result.current.tutorial).toBe(false);
    expect(result.current.paused).toBe(false);
    expect(result.current.activeTab).toBe("construction");
    expect(result.current.palette.primary).toBeTruthy();

    act(() => {
      result.current.onToggleMobilePanel();
    });
    expect(result.current.mobilePanelOpen).toBe(true);
    expect(startLoop).toHaveBeenCalledOnce();

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(result.current.mobilePanelOpen).toBe(false);
    expect(result.current.paused).toBe(false);

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(result.current.paused).toBe(true);

    act(() => result.current.session.resumeMission());
    act(() => window.dispatchEvent(new Event("orientationchange")));
    expect(result.current.actions.mobileCommandState).toBeNull();
    expect(result.current.mobilePanelOpen).toBe(false);
    expect(startLoop).toHaveBeenCalledOnce();
  });

  it("adapts the runtime contract into independent screen surfaces", () => {
    const { result } = renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: false, tutorial: false }));
    const surfaces = createGameRuntimeSurfaces(result.current);

    expect(surfaces.playField.state).toBe(result.current.state);
    expect(surfaces.playField.onPointerDown).toBe(result.current.onPointerDown);
    expect(surfaces.playField.onNextBriefing).toBe(result.current.onNextBriefing);
    expect(surfaces.overlays.state).toBe(result.current.state);
    expect(surfaces.overlays.actions).toBe(result.current.actions);
    expect(surfaces.overlays.session).toBe(result.current.session);
  });

  it("wires runtime lifecycle callbacks and stops the loop on unmount", () => {
    const { unmount } = renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: false, tutorial: false }));
    const options = (startLoop.mock.calls[0] as unknown as [LoopOptions])[0];

    expect(options.drainCommands).toEqual(expect.any(Function));
    expect(options.onTick).toEqual(expect.any(Function));
    expect(options.onFrame).toEqual(expect.any(Function));
    unmount();
    expect(stopLoop).toHaveBeenCalledOnce();
  });

  it("returns focus to the launcher when a mobile panel action closes it", () => {
    const { result } = renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: false, tutorial: false }));
    const launcher = document.createElement("button");
    document.body.append(launcher);
    (result.current.mobileLauncherRef as { current: HTMLButtonElement | null }).current = launcher;

    act(() => result.current.onToggleMobilePanel());
    expect(result.current.mobilePanelOpen).toBe(true);

    const sidebarControl = document.createElement("button");
    document.body.append(sidebarControl);
    sidebarControl.focus();
    act(() => result.current.onToggleMobilePanel());

    expect(result.current.mobilePanelOpen).toBe(false);
    expect(document.activeElement).toBe(launcher);

    launcher.remove();
    sidebarControl.remove();
  });

  it("does not record telemetry again when resuming a terminal save", () => {
    const terminalState = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    terminalState.result = "won";
    expect(writeSave(localStorageAdapter(), terminalState)).toBe(true);

    renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: true, tutorial: false }));
    const firstCall = startLoop.mock.calls[0] as unknown as [{ onFrame: (now: number, state: typeof terminalState, paused: boolean, alpha: number) => void }] | undefined;
    expect(firstCall).toBeDefined();
    act(() => firstCall?.[0].onFrame(1_000, terminalState, false, 0));

    expect(window.localStorage.getItem(TELEMETRY_KEY)).toBeNull();
  });

  it.each(["won", "lost"] as const)("pauses mission music immediately when the simulation reaches a %s result", async (outcome) => {
    const { pauseMusic } = await import("@/lib/audio/music");
    const { result } = renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: false, tutorial: false }));
    const options = (startLoop.mock.calls[0] as unknown as [{ onTick: (state: typeof result.current.state, events: SimEvent[], now: number) => void }] | undefined)?.[0];
    expect(options).toBeDefined();

    vi.mocked(pauseMusic).mockClear();
    const terminalState = { ...result.current.state, tick: 1, result: outcome };
    act(() => options?.onTick(terminalState, [{ type: outcome }], 1_000));

    expect(pauseMusic).toHaveBeenCalledOnce();
  });
});

describe("automatic save recovery", () => {
  it("retries a failed terminal save without duplicating telemetry", () => {
    const { result } = renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: false, tutorial: false }));
    const state = { ...result.current.state, result: "lost" as const };
    const options = (startLoop.mock.calls as unknown as [{ onFrame: (now: number, snapshot: typeof state, paused: boolean, alpha: number, frameMs: number) => void }][])[0]![0];
    const original = Storage.prototype.setItem;
    let attempts = 0;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === saveKey(421) && ++attempts === 1) throw new Error("quota");
      original.call(this, key, value);
    });
    act(() => options.onFrame(1000, state, false, 0, 16));
    expect(readSave(localStorageAdapter(), 421)?.result).not.toBe("lost");
    expect(result.current.combatAlert).toContain("could not be saved");
    act(() => options.onFrame(1500, state, false, 0, 16));
    expect(attempts).toBe(1);
    act(() => options.onFrame(2000, state, false, 0, 16));
    expect(readSave(localStorageAdapter(), 421)?.result).toBe("lost");
    expect(result.current.combatAlert).toBe("Progress saved.");
    act(() => options.onFrame(3000, state, false, 0, 16));
    expect(attempts).toBe(2);
    expect(JSON.parse(localStorage.getItem(TELEMETRY_KEY)!).records).toHaveLength(1);
    spy.mockRestore();
  });

  it("does not overwrite an external save after a terminal conflict", () => {
    const { result } = renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: false, tutorial: false }));
    const state = { ...result.current.state, result: "lost" as const };
    const external = { ...state, tick: 123, result: "playing" as const };
    writeSave(localStorageAdapter(), external);
    const options = (startLoop.mock.calls as unknown as [{ onFrame: (now: number, snapshot: typeof state, paused: boolean, alpha: number, frameMs: number) => void }][])[0]![0];
    act(() => options.onFrame(1000, state, false, 0, 16));
    act(() => options.onFrame(3000, state, false, 0, 16));
    expect(readSave(localStorageAdapter(), 421)?.tick).toBe(123);
    expect(result.current.combatAlert).toContain("changed in another tab");
  });
});

describe("mission replacement in a mounted loop", () => {
  it("saves and records each terminal result after restarting in place", () => {
    const { result } = renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: false, tutorial: false }));
    const options = (startLoop.mock.calls as unknown as [LoopOptions][])[0]![0];
    const finish = (now: number) => {
      const state = options.getState();
      state.result = "lost";
      act(() => options.onFrame!(now, state, false, 0, 16));
      expect(readSave(localStorageAdapter(), 421)?.result).toBe("lost");
    };
    finish(1000);
    act(() => result.current.session.restartMission());
    act(() => result.current.session.confirmAction());
    expect(options.getState().result).toBe("playing");
    expect(startLoop).toHaveBeenCalledOnce();
    finish(2000);
    expect(JSON.parse(localStorage.getItem(TELEMETRY_KEY)!).records).toHaveLength(2);
  });

  it("does not replay terminal telemetry when loading a finished slot in place", () => {
    const { result } = renderHook(() => useGameRuntime({ seed: 421, mission: 0, resume: false, tutorial: false }));
    const state = { ...result.current.state, result: "lost" as const };
    const slot = writeSlot(localStorageAdapter(), { name: "Finished", state, campaign: freshCampaignProgress(421) });
    expect(slot.ok).toBe(true);
    const entry = result.current.session.listLoadEntries().find((entry) => entry.kind === "slot")!;
    act(() => result.current.session.loadArchiveEntry(entry));
    const options = (startLoop.mock.calls as unknown as [LoopOptions][])[0]![0];
    act(() => options.onFrame!(1000, options.getState(), true, 0, 0));
    expect(localStorage.getItem(TELEMETRY_KEY)).toBeNull();
  });
});

describe("initial slot load failures", () => {
  it("keeps the slot URL and previous autosave when campaign restoration fails", () => {
    const storage = localStorageAdapter();
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    writeSave(storage, state);
    const before = storage.getItem(saveKey(421));
    const written = writeSlot(storage, {
      name: "Earlier", state: { ...state, tick: 12 }, campaign: freshCampaignProgress(421),
    });
    if (!written.ok) throw new Error("Slot fixture failed");
    window.history.replaceState({}, "", `/play?seed=0421&mission=0&slot=${written.id}`);
    const original = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === campaignKey(421)) throw new Error("quota");
      original.call(this, key, value);
    });
    try {
      expect(() => initialMission(421, 0, false, false, false, written.id)).toThrow("previous autosave was restored");
      expect(storage.getItem(saveKey(421))).toBe(before);
      expect(window.location.search).toContain(`slot=${written.id}`);
    } finally { spy.mockRestore(); }
  });
});
