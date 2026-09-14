// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBriefingController } from "../../components/briefing/useBriefingController";
import { useBriefingTypewriter } from "../../components/briefing/useBriefingTypewriter";
import { useGameActions } from "../../components/game/hooks/useGameActions";
import { useCombatAlert } from "../../components/game/hooks/useCombatAlert";
import { useGameAudioLifecycle } from "../../components/game/hooks/useGameAudioLifecycle";
import { useGameKeyboard } from "../../components/game/hooks/useGameKeyboard";
import { useGameSession } from "../../components/game/hooks/useGameSession";
import { useGameSelection } from "../../components/game/hooks/useGameSelection";
import { useMissionRoutes } from "../../components/game/hooks/useMissionRoutes";
import { useMissionBackGuard } from "../../components/game/hooks/useMissionBackGuard";
import { useMenuController } from "../../components/menu/useMenuController";
import { weeklySeed } from "../../components/menu/menuLaunch";
import { consumeFreshLaunchIntent } from "../../lib/persist/navigation";
import { createSaveSession, listSlots, localStorageAdapter, readSave, writeSave, saveKey, writeSlot } from "../../lib/persist/save";
import { freshCampaignProgress, campaignKey } from "../../lib/persist/campaign";
import { defaultSettings } from "../../lib/persist/settings";
import { makeFixture, addBuilding, addUnit } from "../../lib/sim/fixtures";
import type { Command } from "../../lib/types";
import type { CommandTab, PauseView } from "../../lib/ui/shortcuts";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/audio/synth", () => ({ beep: vi.fn(), setSfxEnabled: vi.fn() }));
vi.mock("@/lib/audio/music", () => ({
  pauseMusic: vi.fn(),
  setMusicEnabled: vi.fn(),
  setMusicCue: vi.fn(),
  setMusicDucked: vi.fn(),
  clearMusicPosition: vi.fn(),
  TUTORIAL_MUSIC_MISSION: -1,
}));
vi.mock("@/lib/audio/mixer", () => ({ setAudioLevels: vi.fn() }));

afterEach(() => {
  cleanup();
  router.push.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("useMenuController", () => {
  it("loads settings and routes valid launches", () => {
    const { result } = renderHook(() => useMenuController());

    act(() => result.current.setCode("0421"));
    act(() => result.current.launch());

    expect(result.current.previewLine).toContain("·");
    expect(router.push).toHaveBeenCalledWith("/briefing?seed=0421&mission=0&from=menu");
  });

  it("opens the training range from the tutorial command", () => {
    const { result } = renderHook(() => useMenuController());
    act(() => result.current.openTutorial());
    expect(router.push).toHaveBeenCalledWith("/tutorial");

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" })));
    expect(router.push).toHaveBeenCalledWith("/tutorial");
  });

  it("reports invalid launch input and handles keyboard navigation", () => {
    const { result } = renderHook(() => useMenuController());
    act(() => result.current.setCode("12"));
    act(() => result.current.launch());
    expect(result.current.error).toContain("4-digit campaign code");

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(result.current.view).toBe("main");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" })));
    expect(result.current.view).toBe("newGame");

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "l" })));
    expect(router.push).toHaveBeenCalledWith("/load");
  });

  it("copies a campaign share link and opens a shared seed from the URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    const { result } = renderHook(() => useMenuController());
    act(() => result.current.setCode("0421"));
    await act(async () => {
      await result.current.copyLink();
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?seed=0421`);
    expect(result.current.copied).toBe(true);

    window.history.replaceState({}, "", "/?seed=421");
    const shared = renderHook(() => useMenuController());
    await waitFor(() => {
      expect(shared.result.current.code).toBe("0421");
      expect(shared.result.current.view).toBe("newGame");
    });
  });

  it("restores this week's seed", () => {
    const { result } = renderHook(() => useMenuController());
    act(() => result.current.setCode("0421"));
    act(() => result.current.restoreWeekly());
    expect(result.current.code).toBe(weeklySeed());
  });
});

describe("useBriefingController", () => {
  it("routes launches and maps keyboard commands to typewriter actions", () => {
    const replay = vi.fn();
    const skip = vi.fn();
    const { result } = renderHook(() => useBriefingController({
      seed: 421,
      mission: 2,
      returnToGame: true,
      isComplete: false,
      replayTransmission: replay,
      skipToEnd: skip,
    }));

    act(() => result.current.launch());
    expect(router.push).toHaveBeenCalledWith("/play?seed=0421&mission=2&resume=1");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: " " })));
    expect(skip).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" })));
    expect(replay).toHaveBeenCalledOnce();
  });

  it("marks a new-campaign launch as fresh across client-side navigation", () => {
    const { result } = renderHook(() => useBriefingController({
      seed: 421,
      mission: 0,
      returnToGame: false,
      isComplete: true,
      replayTransmission: vi.fn(),
      skipToEnd: vi.fn(),
    }));

    act(() => result.current.launch());

    expect(router.push).toHaveBeenCalledWith("/play?seed=0421&mission=0&fresh=1");
    expect(consumeFreshLaunchIntent(421, 0)).toBe(true);
  });

  it("uses Escape to return from a New Campaign briefing", () => {
    const { result } = renderHook(() => useBriefingController({
      seed: 421,
      mission: 0,
      returnToGame: false,
      origin: "newGame",
      isComplete: true,
      replayTransmission: vi.fn(),
      skipToEnd: vi.fn(),
    }));

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    expect(router.push).toHaveBeenCalledWith("/?seed=0421");
    expect(result.current.back).toBeTypeOf("function");
  });
});

describe("useBriefingTypewriter", () => {
  it("can skip a transmission and replay it from the beginning", () => {
    const lines = [
      { speaker: "commander" as const, text: "Hold" },
      { speaker: "advisor" as const, text: "the line" },
    ];
    const { result } = renderHook(() => useBriefingTypewriter(lines));
    expect(result.current.isComplete).toBe(false);
    act(() => result.current.skipToEnd());
    expect(result.current.isComplete).toBe(true);
    expect(result.current.visibleLines.map((line) => line.visible)).toEqual(["Hold", "the line"]);
    act(() => result.current.replayTransmission());
    expect(result.current.isComplete).toBe(false);
  });
});

describe("useGameActions", () => {
  it("keeps build, repair, sell, and mobile command modes mutually exclusive", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const cmdQ = { current: [] as Command[] };
    const selected = { current: new Set<number>() };
    const { result } = renderHook(() => useGameActions({ stateRef: { current: state }, cmdQ, selected, selectedIds: [] }));

    act(() => result.current.togglePlace("power"));
    expect(result.current.placeKind).toBe("power");
    act(() => result.current.toggleRepair());
    expect(result.current.repairMode).toBe(true);
    expect(result.current.placeKind).toBeNull();
    act(() => result.current.toggleSell());
    expect(result.current.sellMode).toBe(true);
    expect(result.current.repairMode).toBe(false);
    act(() => result.current.chooseMobileCommand("move"));
    expect(result.current.mobileCommandState).toBe("move");
    expect(result.current.sellMode).toBe(false);
  });

  it("queues a command through the least-loaded available producer", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    addBuilding(state, 0, "barracks", 2, 2);
    const cmdQ = { current: [] as Command[] };
    const selected = { current: new Set<number>() };
    const { result } = renderHook(() => useGameActions({ stateRef: { current: state }, cmdQ, selected, selectedIds: [] }));

    act(() => result.current.queueUnit("infantry"));
    expect(cmdQ.current).toEqual([{ type: "produce", fromId: 1, unit: "infantry" }]);
  });

  it("queues orders for the current unit selection", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 2, 2);
    const cmdQ = { current: [] as Command[] };
    const selected = { current: new Set<number>() };
    const { result } = renderHook(() => useGameActions({ stateRef: { current: state }, cmdQ, selected, selectedIds: [unit.id] }));

    act(() => result.current.issueSelectedCommand("stop"));
    act(() => result.current.issueSelectedCommand("stance", "hold"));
    act(() => result.current.issueSelectedCommand("formation", "wedge"));

    expect(cmdQ.current).toEqual([
      { type: "stop", unitIds: [unit.id] },
      { type: "stance", unitIds: [unit.id], stance: "hold" },
      { type: "formation", unitIds: [unit.id], formation: "wedge" },
    ]);
  });
});

describe("game lifecycle hooks", () => {
  it("restores an active mission after browser Back until leave is confirmed", () => {
    window.history.replaceState({}, "", "/briefing?seed=0421&mission=0");
    window.history.pushState({}, "", "/play?seed=0421&mission=0&fresh=1");
    const requestLeave = vi.fn();
    const back = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useMissionBackGuard({ enabled: true, onRequestLeave: requestLeave }));

    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(window.location.pathname).toBe("/play");
    expect(requestLeave).toHaveBeenCalledOnce();
    act(() => result.current.leave());
    expect(back).toHaveBeenCalledWith(-2);

    unmount();
    back.mockRestore();
    window.history.replaceState({}, "", "/");
  });

  it("cleans up stale same-URL sentinels when the mission guard is disabled", async () => {
    const sentinelKey = "__shiftingFrontMissionBackSentinel";
    window.history.replaceState({ [sentinelKey]: true, route: "mission" }, "", "/play?seed=0421&mission=0");
    const missionUrl = window.location.href;
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const onRequestLeave = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useMissionBackGuard({ enabled, onRequestLeave }),
      { initialProps: { enabled: true } },
    );

    expect(replaceState).toHaveBeenCalledWith({ route: "mission" }, "", missionUrl);
    expect(pushState).toHaveBeenCalledWith(
      { route: "mission", [sentinelKey]: true },
      "",
      missionUrl,
    );

    act(() => rerender({ enabled: false }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(back).toHaveBeenCalledOnce();
    unmount();
    replaceState.mockRestore();
    pushState.mockRestore();
    back.mockRestore();
    window.history.replaceState({}, "", "/");
  });

  it("does not treat the Strict Mode effect remount as browser Back", async () => {
    window.history.replaceState({}, "", "/briefing?seed=0421&mission=0");
    window.history.pushState({}, "", "/play?seed=0421&mission=0&fresh=1");
    const requestLeave = vi.fn();
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const { unmount } = renderHook(
      () => useMissionBackGuard({ enabled: true, onRequestLeave: requestLeave }),
      { wrapper: StrictMode },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(requestLeave).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();

    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    back.mockRestore();
    window.history.replaceState({}, "", "/");
  });

  it("does not overwrite a newer save during a briefing transition", () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const storage = localStorageAdapter();
    const session = createSaveSession(storage, 421);
    const replacement = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    replacement.tick = 77;
    expect(writeSave(storage, replacement)).toBe(true);
    const { result } = renderHook(() => useMissionRoutes({
      stateRef: { current: state },
      saveSession: session,
      onSaveError: vi.fn(),
    }));

    act(() => result.current.viewMissionBriefing());

    expect(readSave(storage, 421)?.tick).toBe(77);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("returns tutorial exits to the command desk without writing campaign progress", () => {
    const state = makeFixture({ seed: 0, win: { kind: "holdTheLine" } });
    const storage = localStorageAdapter();
    const session = createSaveSession(storage, 0);
    const { result } = renderHook(() => useMissionRoutes({
      stateRef: { current: state },
      saveSession: session,
      onSaveError: vi.fn(),
      tutorial: true,
    }));

    act(() => result.current.exitTutorial());
    expect(router.push).toHaveBeenCalledWith("/");
    expect(readSave(storage, 0)).toBeNull();

    router.push.mockClear();
    act(() => result.current.backTutorial());
    expect(router.push).toHaveBeenCalledWith("/");

    router.push.mockClear();
    act(() => result.current.goRetry());
    expect(router.push).toHaveBeenCalledWith("/tutorial");
  });

  it("opens save and load slot panels and restores a named slot in place", () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const stateRef = { current: state };
    const setPauseView = vi.fn();
    const setPauseNotice = vi.fn();
    const props: Parameters<typeof useGameSession>[0] = {
      seed: 421,
      stateRef,
      setState: vi.fn(),
      commitSelection: vi.fn(),
      cmdQRef: { current: [] as Command[] },
      fxRef: { current: [] },
      clearTools: vi.fn(),
      resetInput: vi.fn(),
      resetCamera: vi.fn(),
      pausedRef: { current: true },
      setPaused: vi.fn(),
      setPauseView,
      setPauseNotice,
      campaignRecordedRef: { current: false },
      terminalSaveRef: { current: false },
      settings: defaultSettings(),
      setSettings: vi.fn(),
      saveSession: createSaveSession(localStorageAdapter(), 421),
    };
    const { result } = renderHook(() => useGameSession(props));

    act(() => result.current.saveMission());
    expect(setPauseView).toHaveBeenCalledWith("save");
    expect(result.current.confirmation).toBeNull();
    expect(readSave(localStorageAdapter(), 421)).toBeNull();

    act(() => {
      expect(result.current.saveNamedSlot("Bridgehead", null)).toBe(true);
    });
    expect(readSave(localStorageAdapter(), 421)?.seed).toBe(421);
    expect(listSlots(localStorageAdapter())[0]?.name).toBe("Bridgehead");
    expect(setPauseNotice).toHaveBeenCalledWith('Saved “Bridgehead”.');

    stateRef.current.tick = 99;
    act(() => result.current.loadMission());
    expect(setPauseView).toHaveBeenCalledWith("load");
    const loaded = result.current.listLoadEntries()[0]!;
    act(() => result.current.loadArchiveEntry(loaded));
    expect(stateRef.current.tick).toBe(0);
    expect(props.cmdQRef.current).toEqual([]);
    expect(props.fxRef.current).toEqual([]);
    expect(props.clearTools).toHaveBeenCalledOnce();
    expect(props.resetInput).toHaveBeenCalledOnce();
    expect(props.resetCamera).toHaveBeenCalledWith(stateRef.current);

    const beforeRestart = stateRef.current;
    act(() => result.current.restartMission());
    expect(result.current.confirmation).toMatchObject({ action: "restart" });
    act(() => result.current.cancelConfirmation());
    expect(stateRef.current).toBe(beforeRestart);
    act(() => result.current.restartMission());
    act(() => result.current.confirmAction());
    expect(stateRef.current).not.toBe(beforeRestart);
    expect(stateRef.current.tick).toBe(0);

    act(() => result.current.goMenu());
    expect(result.current.confirmation).toMatchObject({ action: "menu" });
    expect(router.push).not.toHaveBeenCalledWith("/");
    act(() => result.current.confirmAction());
    expect(router.push).toHaveBeenCalledWith("/");
  });

  it("commits selections and advances the tutorial selection stage", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    state.tutorialStage = "select";
    const unit = addUnit(state, 0, "infantry", 2, 2);
    const stateRef = { current: state };
    const setState = vi.fn();
    const { result } = renderHook(() => useGameSelection({ stateRef, setState }));

    act(() => result.current.commitSelection([unit.id]));
    expect(result.current.selectedIds).toEqual([unit.id]);
    expect(state.tutorialStage).toBe("move");
    expect(setState).toHaveBeenCalledOnce();
  });

  it("assigns and recalls only living friendly units, pruning stale group members", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const infantry = addUnit(state, 0, "infantry", 2, 2);
    const tank = addUnit(state, 0, "tank", 3, 2);
    const dead = addUnit(state, 0, "infantry", 4, 2);
    dead.hp = 0;
    const neutral = addUnit(state, 0, "infantry", 5, 2);
    neutral.neutral = true;
    const stateRef = { current: state };
    const setState = vi.fn();
    const { result } = renderHook(() => useGameSelection({ stateRef, setState }));

    act(() => result.current.commitSelection([infantry.id, tank.id, dead.id, neutral.id, 9999]));
    expect(result.current.assignControlGroup(1)).toBe(2);
    expect(state.controlGroups).toEqual({ 1: [infantry.id, tank.id] });

    state.controlGroups = { 1: [infantry.id, tank.id, dead.id, neutral.id, 9999] };
    act(() => result.current.recallControlGroup(1));
    expect(result.current.selectedIds).toEqual([infantry.id, tank.id]);
    expect(state.controlGroups).toEqual({ 1: [infantry.id, tank.id] });
  });

  it("clears combat alerts after their display window and pauses mission music with menus and results", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useCombatAlert());
      act(() => result.current.onAlert("Contact"));
      expect(result.current.combatAlert).toBe("Contact");
      act(() => vi.advanceTimersByTime(3000));
      expect(result.current.combatAlert).toBeNull();
    } finally {
      vi.useRealTimers();
    }

    const music = await import("@/lib/audio/music");
    const { pauseMusic, setMusicCue, setMusicDucked } = music;
    const { rerender } = renderHook((props: Parameters<typeof useGameAudioLifecycle>[0]) => useGameAudioLifecycle(props), {
      initialProps: { seed: 421, missionIndex: 3, tutorial: false, paused: true, result: "playing" },
    });
    expect(pauseMusic).toHaveBeenCalledOnce();
    expect(setMusicCue).not.toHaveBeenCalled();

    rerender({ seed: 421, missionIndex: 3, tutorial: false, paused: false, result: "playing" });
    expect(setMusicDucked).toHaveBeenCalledWith(false);
    expect(setMusicCue).toHaveBeenCalledWith("mission", 421, 3);
    vi.mocked(setMusicCue).mockClear();

    rerender({ seed: 421, missionIndex: 3, tutorial: false, paused: false, result: "won" as const });
    expect(pauseMusic).toHaveBeenCalledTimes(2);
    expect(setMusicCue).not.toHaveBeenCalled();

    rerender({ seed: 421, missionIndex: 3, tutorial: false, paused: false, result: "lost" as const });
    expect(pauseMusic).toHaveBeenCalledTimes(3);
    expect(setMusicCue).not.toHaveBeenCalled();
  });
});

describe("useGameKeyboard", () => {
  it("dispatches pause, tabs, tools, save, and navigation commands", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const refs = {
      stateRef: { current: state },
      pausedRef: { current: false },
      pauseViewRef: { current: "main" as PauseView },
      activeTabRef: { current: "construction" as CommandTab },
      place: { current: null },
      repair: { current: false },
      sell: { current: false },
    };
    const openPauseMenu = vi.fn();
    const setActiveTab = vi.fn();
    const toggleRepair = vi.fn();
    const saveMission = vi.fn();
    const onNavigateHome = vi.fn();
    renderHook(() => useGameKeyboard({
      ...refs,
      openPauseMenu,
      resumeMission: vi.fn(),
      setPauseView: vi.fn(),
      setPauseNotice: vi.fn(),
      setActiveTab,
      activateCameo: vi.fn(),
      assignControlGroup: vi.fn(),
      recallControlGroup: vi.fn(),
      jumpHome: vi.fn(),
      centerSelection: vi.fn(),
      toggleRepair,
      toggleSell: vi.fn(),
      stopSelected: vi.fn(),
      clearTools: vi.fn(),
      saveMission,
      loadMission: vi.fn(),
      viewMissionBriefing: vi.fn(),
      restartMission: vi.fn(),
      toggleSound: vi.fn(),
      toggleMusic: vi.fn(),
      resultPrimary: vi.fn(),
      onNavigateHome,
    }));

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" })));
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" })));
    refs.pausedRef.current = true;
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" })));

    expect(openPauseMenu).toHaveBeenCalledOnce();
    expect(setActiveTab).toHaveBeenCalledWith("production");
    expect(toggleRepair).toHaveBeenCalledOnce();
    expect(saveMission).toHaveBeenCalledOnce();
    expect(onNavigateHome).not.toHaveBeenCalled();
  });

  it("uses Escape to cancel an open mission confirmation without dispatching another command", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const cancelConfirmation = vi.fn();
    const resumeMission = vi.fn();
    const saveMission = vi.fn();
    renderHook(() => useGameKeyboard({
      stateRef: { current: state },
      pausedRef: { current: true },
      pauseViewRef: { current: "main" },
      activeTabRef: { current: "construction" },
      place: { current: null },
      repair: { current: false },
      sell: { current: false },
      openPauseMenu: vi.fn(),
      resumeMission,
      setPauseView: vi.fn(),
      setPauseNotice: vi.fn(),
      setActiveTab: vi.fn(),
      activateCameo: vi.fn(),
      assignControlGroup: vi.fn(),
      recallControlGroup: vi.fn(),
      jumpHome: vi.fn(),
      centerSelection: vi.fn(),
      toggleRepair: vi.fn(),
      toggleSell: vi.fn(),
      stopSelected: vi.fn(),
      clearTools: vi.fn(),
      saveMission,
      loadMission: vi.fn(),
      viewMissionBriefing: vi.fn(),
      restartMission: vi.fn(),
      toggleSound: vi.fn(),
      toggleMusic: vi.fn(),
      resultPrimary: vi.fn(),
      onNavigateHome: vi.fn(),
      confirmationOpen: true,
      cancelConfirmation,
    }));

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    expect(cancelConfirmation).toHaveBeenCalledOnce();
    expect(resumeMission).not.toHaveBeenCalled();
    expect(saveMission).not.toHaveBeenCalled();
  });
});

describe("save before navigation", () => {
  it.each(["goHomeNow", "viewMissionBriefing", "goCampaignMap", "goNextBriefing", "resultPrimary"] as const)(
    "persists the latest tick before %s", (action) => {
      const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
      state.tick = 29;
      const storage = localStorageAdapter();
      const { result } = renderHook(() => useMissionRoutes({
        stateRef: { current: state }, saveSession: createSaveSession(storage, 421), onSaveError: vi.fn(),
      }));
      router.push.mockImplementationOnce(() => {
        expect(readSave(storage, 421)?.tick).toBe(29);
      });
      act(() => result.current[action]());
      expect(router.push).toHaveBeenCalledOnce();
    },
  );

  it.each(["failed", "conflict"] as const)("keeps the mission open on a %s save", (status) => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const onSaveError = vi.fn();
    const saveSession = { write: vi.fn(() => status), adoptCurrent: vi.fn(), markExternalChange: vi.fn() };
    const { result } = renderHook(() => useMissionRoutes({ stateRef: { current: state }, saveSession, onSaveError }));
    act(() => result.current.goHomeNow());
    act(() => result.current.viewMissionBriefing());
    expect(router.push).not.toHaveBeenCalled();
    expect(onSaveError).toHaveBeenCalled();
    expect(result.current.prepareLeave()).toBe(false);
  });

  it("retains the requested destination as a leave-without-save fallback", () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const onSaveError = vi.fn();
    const saveSession = { write: vi.fn(() => "failed" as const), adoptCurrent: vi.fn(), markExternalChange: vi.fn() };
    const { result } = renderHook(() => useMissionRoutes({ stateRef: { current: state }, saveSession, onSaveError }));
    act(() => result.current.goHomeNow());
    expect(onSaveError).toHaveBeenCalledOnce();
    const fallback = onSaveError.mock.calls[0]![1] as () => void;
    act(fallback);
    expect(router.push).toHaveBeenCalledWith("/");
  });
});

function persistenceProps(): Parameters<typeof useGameSession>[0] {
  return {
    seed: 421, stateRef: { current: makeFixture({ seed: 421, win: { kind: "annihilate" } }) },
    setState: vi.fn(), commitSelection: vi.fn(), cmdQRef: { current: [] }, fxRef: { current: [] },
    clearTools: vi.fn(), resetInput: vi.fn(), resetCamera: vi.fn(),
    pausedRef: { current: true }, setPaused: vi.fn(), setPauseView: vi.fn(), setPauseNotice: vi.fn(),
    campaignRecordedRef: { current: false }, terminalSaveRef: { current: false },
    settings: defaultSettings(), setSettings: vi.fn(), saveSession: createSaveSession(localStorageAdapter(), 421),
  };
}

describe("partial persistence feedback", () => {
  it("reports the named slot as saved when only the autosave update fails", () => {
    const props = persistenceProps();
    props.saveSession.write = vi.fn(() => "failed" as const);
    const { result } = renderHook(() => useGameSession(props));
    act(() => { expect(result.current.saveNamedSlot("Fallback", null)).toBe(true); });
    expect(listSlots(localStorageAdapter())).toHaveLength(1);
    expect(props.setPauseView).toHaveBeenCalledWith("main");
    expect(props.setPauseNotice).toHaveBeenCalledWith(expect.stringContaining('Saved “Fallback”, but'));
  });

  it.each([0, 1])("does not apply or navigate to mission %s after a failed campaign restore", (missionIndex) => {
    const props = persistenceProps();
    const storage = localStorageAdapter();
    writeSave(storage, props.stateRef.current);
    const before = storage.getItem(saveKey(421));
    writeSlot(storage, {
      name: "Earlier", state: { ...props.stateRef.current, missionIndex, tick: 88 },
      campaign: freshCampaignProgress(421),
    });
    const { result } = renderHook(() => useGameSession(props));
    const entry = result.current.listLoadEntries().find((entry) => entry.kind === "slot")!;
    const original = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === campaignKey(421)) throw new Error("quota");
      original.call(this, key, value);
    });
    try {
      act(() => result.current.loadArchiveEntry(entry));
      expect(props.stateRef.current.tick).toBe(0);
      expect(props.setState).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
      expect(storage.getItem(saveKey(421))).toBe(before);
      expect(props.setPauseNotice).toHaveBeenCalledWith(expect.stringContaining("previous autosave was restored"));
    } finally { spy.mockRestore(); }
  });

  it("shows a failed leave in the pause menu", () => {
    const props = persistenceProps();
    props.saveSession.write = vi.fn(() => "failed" as const);
    const { result } = renderHook(() => useGameSession(props));
    act(() => result.current.goMenu());
    act(() => result.current.confirmAction());
    expect(router.push).not.toHaveBeenCalled();
    expect(props.setPaused).toHaveBeenCalledWith(true);
    expect(props.setPauseView).toHaveBeenCalledWith("main");
    expect(props.setPauseNotice).toHaveBeenCalledWith(expect.stringContaining("Couldn't save"));
  });

  it("can leave without saving after a failed confirmed leave", () => {
    const props = persistenceProps();
    props.saveSession.write = vi.fn(() => "failed" as const);
    const { result } = renderHook(() => useGameSession(props));
    act(() => result.current.goMenu());
    act(() => result.current.confirmAction());
    expect(result.current.canLeaveWithoutSave).toBe(true);
    act(() => result.current.leaveWithoutSave());
    expect(router.push).toHaveBeenCalledWith("/");
    expect(result.current.canLeaveWithoutSave).toBe(false);
  });
});
