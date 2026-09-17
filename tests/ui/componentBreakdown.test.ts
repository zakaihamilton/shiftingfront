import { describe, expect, it, vi } from "vitest";
import { canvasPointerPos } from "../../components/game/hooks/canvasPointer";
import { applyGameCommand } from "../../components/game/hooks/gameKeyboard";
import { leastLoadedProducer } from "../../components/game/hooks/gameActions";
import { resolvePointerUp, DOUBLE_CLICK_MS, isSameKindDoubleClick } from "../../components/game/hooks/gamePointerUp";
import { alertSfx, desiredMusicIntensity, rejectionSfx, warningAlert } from "../../components/game/hooks/gameLoopEffects";
import { missionConfirmationFor } from "../../components/game/hooks/missionConfirmation";
import { briefingBackPath, briefingPath, campaignCompletePath, menuPath, resultPrimaryPath, tutorialPath } from "../../components/game/hooks/missionRoutes";
import { gameOverlayModel } from "../../components/game/gameOverlayModel";
import { playFieldStatus } from "../../components/game/playFieldStatus";
import { createCamera, tileToScreen } from "../../lib/iso";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { createMission } from "../../lib/sim/api";
import { heightAt } from "../../lib/sim/world";
import { createCampaign } from "../../lib/gen/campaign";
import { missionObjectives } from "../../lib/gen/story";
import type { GameCommandHandlers } from "../../components/game/hooks/gameKeyboard";

vi.mock("@/lib/audio/synth", () => ({ beep: vi.fn() }));

function handlers(): GameCommandHandlers {
  return {
    activeTab: "construction",
    openPauseMenu: vi.fn(),
    resumeMission: vi.fn(),
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
    saveMission: vi.fn(),
    loadMission: vi.fn(),
    viewMissionBriefing: vi.fn(),
    restartMission: vi.fn(),
    toggleSound: vi.fn(),
    toggleMusic: vi.fn(),
    resultPrimary: vi.fn(),
    onNavigateHome: vi.fn(),
  };
}

describe("pointer canvas math", () => {
  it("maps client coordinates through the canvas scale", () => {
    expect(canvasPointerPos({
      currentTarget: {
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 50 }) as DOMRect,
        width: 200,
        height: 100,
      },
      clientX: 60,
      clientY: 45,
    })).toEqual({ x: 100, y: 50 });
  });
});

describe("pointer-up policy", () => {
  it("places a building, cancels tools on right-click, and issues a mobile command", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    addBuilding(state, 0, "constructionYard", 1, 1);
    const cam = createCamera();
    const p = tileToScreen(4, 5, cam, heightAt(state, 4, 5));

    expect(resolvePointerUp({
      pointerType: "mouse",
      button: 0,
      ctrlKey: false,
      metaKey: false,
      p,
      state,
      cam,
      selectedIds: [],
      box: null,
      selectionMode: false,
      mobileCommand: null,
      placeKind: "power",
      repairMode: false,
      sellMode: false,
    })).toMatchObject({
      clearBox: true,
      clearPlace: true,
      beep: "build",
      commands: [{ type: "build", building: "power", x: 4, y: 5 }],
    });

    const invalidPlacement = tileToScreen(0, 0, cam, heightAt(state, 0, 0));
    expect(resolvePointerUp({
      pointerType: "mouse",
      button: 0,
      ctrlKey: false,
      metaKey: false,
      p: invalidPlacement,
      state,
      cam,
      selectedIds: [],
      box: null,
      selectionMode: false,
      mobileCommand: null,
      placeKind: "power",
      repairMode: false,
      sellMode: false,
    })).toMatchObject({
      clearBox: true,
      clearPlace: false,
      beep: "build",
      commands: [{ type: "build", building: "power", x: 0, y: 0 }],
    });

    expect(resolvePointerUp({
      pointerType: "mouse",
      button: 2,
      ctrlKey: false,
      metaKey: false,
      p,
      state,
      cam,
      selectedIds: [],
      box: null,
      selectionMode: false,
      mobileCommand: null,
      placeKind: "power",
      repairMode: false,
      sellMode: false,
    })).toEqual({ preventDefault: true, clearPlace: true, beep: "cancel" });

    expect(resolvePointerUp({
      pointerType: "mouse",
      button: 2,
      ctrlKey: false,
      metaKey: false,
      p,
      state,
      cam,
      selectedIds: [],
      box: null,
      selectionMode: false,
      mobileCommand: null,
      placeKind: null,
      repairMode: true,
      sellMode: false,
    })).toEqual({ preventDefault: true, clearRepairAndSell: true, beep: "cancel" });

    expect(resolvePointerUp({
      pointerType: "mouse",
      button: 2,
      ctrlKey: true,
      metaKey: false,
      p,
      state,
      cam,
      selectedIds: [],
      box: null,
      selectionMode: false,
      mobileCommand: null,
      placeKind: null,
      repairMode: false,
      sellMode: false,
    })).toEqual({ preventDefault: true, contextOrder: true, attackMove: true });

    const unit = addUnit(state, 0, "infantry", 2, 2);
    expect(resolvePointerUp({
      pointerType: "touch",
      button: 0,
      ctrlKey: false,
      metaKey: false,
      p,
      state,
      cam,
      selectedIds: [unit.id],
      box: null,
      selectionMode: false,
      mobileCommand: "move",
      placeKind: null,
      repairMode: false,
      sellMode: false,
    })).toMatchObject({
      clearMobileCommand: true,
      beep: "ackAttack",
      commands: [{ type: "attackMove", unitIds: [unit.id], x: 4, y: 5 }],
    });
  });

  it("repairs a friendly building and drag-selects without a beep", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const yard = addBuilding(state, 0, "power", 3, 3);
    const cam = createCamera();
    const p = tileToScreen(yard.x, yard.y, cam, heightAt(state, yard.x, yard.y));

    const repair = resolvePointerUp({
      pointerType: "mouse",
      button: 0,
      ctrlKey: false,
      metaKey: false,
      p,
      state,
      cam,
      selectedIds: [],
      box: null,
      selectionMode: false,
      mobileCommand: null,
      placeKind: null,
      repairMode: true,
      sellMode: false,
    });
    expect(repair).toMatchObject({
      clearBox: true,
      commands: [{ type: "repair", buildingId: yard.id }],
    });
    expect(repair.beep).toBeUndefined();

    expect(resolvePointerUp({
      pointerType: "mouse",
      button: 0,
      ctrlKey: false,
      metaKey: false,
      p: { x: 0, y: 0 },
      state,
      cam,
      selectedIds: [],
      box: { x0: 0, y0: 0, x1: 20, y1: 20 },
      selectionMode: false,
      mobileCommand: null,
      placeKind: null,
      repairMode: false,
      sellMode: false,
    })).toEqual({ clearBox: true, select: [] });
  });

  it("does not issue a sell order for a building that cannot be sold", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const yard = addBuilding(state, 0, "constructionYard", 3, 3);
    const cam = createCamera();
    const p = tileToScreen(yard.x, yard.y, cam, heightAt(state, yard.x, yard.y));

    expect(resolvePointerUp({
      pointerType: "mouse",
      button: 0,
      ctrlKey: false,
      metaKey: false,
      p,
      state,
      cam,
      selectedIds: [],
      box: null,
      selectionMode: false,
      mobileCommand: null,
      placeKind: null,
      repairMode: false,
      sellMode: true,
    })).toEqual({
      clearBox: true,
      commandNotice: { text: "That building cannot be sold.", kind: "error" },
    });
  });

  it("keeps entity selection silent for units and buildings", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 2, 2);
    const building = addBuilding(state, 0, "power", 4, 4);
    const cam = createCamera();
    const screen = tileToScreen(unit.x, unit.y, cam, heightAt(state, unit.x, unit.y));
    const buildingScreen = tileToScreen(building.x, building.y, cam, heightAt(state, building.x, building.y));

    expect(resolvePointerUp({
      pointerType: "mouse",
      button: 0,
      ctrlKey: false,
      metaKey: false,
      p: { x: 0, y: 0 },
      state,
      cam,
      selectedIds: [],
      box: null,
      selectionMode: false,
      mobileCommand: null,
      placeKind: null,
      repairMode: false,
      sellMode: false,
    }).beep).toBeUndefined();

    expect(resolvePointerUp({
      pointerType: "mouse",
      button: 0,
      ctrlKey: false,
      metaKey: false,
      p: screen,
      state,
      cam,
      selectedIds: [],
      box: null,
      selectionMode: false,
      mobileCommand: null,
      placeKind: null,
      repairMode: false,
      sellMode: false,
    })).toMatchObject({ select: [unit.id] });
    expect(resolvePointerUp({
      pointerType: "mouse",
      button: 0,
      ctrlKey: false,
      metaKey: false,
      p: buildingScreen,
      state,
      cam,
      selectedIds: [],
      box: null,
      selectionMode: false,
      mobileCommand: null,
      placeKind: null,
      repairMode: false,
      sellMode: false,
    })).toMatchObject({ select: [building.id] });

    expect(resolvePointerUp({
      pointerType: "mouse",
      button: 0,
      ctrlKey: false,
      metaKey: false,
      p: { x: screen.x + 40, y: screen.y + 40 },
      state,
      cam,
      selectedIds: [],
      box: { x0: screen.x - 20, y0: screen.y - 20, x1: screen.x + 20, y1: screen.y + 20 },
      selectionMode: false,
      mobileCommand: null,
      placeKind: null,
      repairMode: false,
      sellMode: false,
    })).toMatchObject({ select: [unit.id] });
  });
});

describe("double-click selection policy", () => {
  it("treats a second same-kind click within the time and distance window as a double-click", () => {
    const first = { atMs: 1000, kind: "tank", x: 40, y: 40 };
    expect(isSameKindDoubleClick(null, first)).toBe(false);
    expect(isSameKindDoubleClick(first, { atMs: 1300, kind: "tank", x: 48, y: 42 })).toBe(true);
    expect(isSameKindDoubleClick(first, { atMs: 1000 + DOUBLE_CLICK_MS + 1, kind: "tank", x: 40, y: 40 })).toBe(false);
    expect(isSameKindDoubleClick(first, { atMs: 1200, kind: "infantry", x: 40, y: 40 })).toBe(false);
    expect(isSameKindDoubleClick(first, { atMs: 1200, kind: "tank", x: 80, y: 40 })).toBe(false);
  });

  it("expands a double-click onto visible units of that kind and keeps a single-click as one unit", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const cam = createCamera();
    const tank = addUnit(state, 0, "tank", 5, 5);
    const other = addUnit(state, 0, "tank", 6, 5);
    addUnit(state, 0, "infantry", 5, 6);
    const screen = tileToScreen(tank.x, tank.y, cam, heightAt(state, tank.x, tank.y));
    const viewport = { width: 800, height: 600 };
    const base = {
      pointerType: "mouse",
      button: 0,
      ctrlKey: false,
      metaKey: false,
      p: screen,
      state,
      cam,
      selectedIds: [] as number[],
      box: null,
      selectionMode: false,
      mobileCommand: null,
      placeKind: null,
      repairMode: false,
      sellMode: false,
      viewport,
    };

    expect(resolvePointerUp(base)).toMatchObject({ select: [tank.id] });
    expect(resolvePointerUp({ ...base, doubleClick: true })).toMatchObject({
      select: [tank.id, other.id],
    });
  });

  it("does not expand a double-click on a building", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const cam = createCamera();
    const yard = addBuilding(state, 0, "constructionYard", 3, 3);
    addBuilding(state, 0, "power", 6, 3);
    const p = tileToScreen(yard.x, yard.y, cam, heightAt(state, yard.x, yard.y));
    expect(resolvePointerUp({
      pointerType: "mouse",
      button: 0,
      ctrlKey: false,
      metaKey: false,
      p,
      state,
      cam,
      selectedIds: [],
      box: null,
      selectionMode: false,
      mobileCommand: null,
      placeKind: null,
      repairMode: false,
      sellMode: false,
      doubleClick: true,
      viewport: { width: 800, height: 600 },
    })).toMatchObject({ select: [yard.id] });
  });
});

describe("keyboard command dispatch", () => {
  it("routes pause, tabs, tools, and navigation commands", () => {
    const next = handlers();
    applyGameCommand({ type: "pause" }, next);
    applyGameCommand({ type: "resume" }, next);
    applyGameCommand({ type: "tab", tab: "production" }, next);
    applyGameCommand({ type: "cameo", index: 1, cancel: false }, next);
    applyGameCommand({ type: "repair" }, next);
    applyGameCommand({ type: "cancelTool" }, next);
    applyGameCommand({ type: "resultMenu" }, next);
    applyGameCommand({ type: "controls" }, next);
    expect(next.openPauseMenu).toHaveBeenCalledTimes(2);
    expect(next.openPauseMenu).toHaveBeenNthCalledWith(2, "controls");
    expect(next.setPauseView).not.toHaveBeenCalledWith("controls");
    expect(next.resumeMission).toHaveBeenCalledOnce();
    expect(next.setActiveTab).toHaveBeenCalledWith("production");
    expect(next.activateCameo).toHaveBeenCalledWith("construction", 1, false);
    expect(next.toggleRepair).toHaveBeenCalledOnce();
    expect(next.clearTools).toHaveBeenCalledOnce();
    expect(next.onNavigateHome).toHaveBeenCalledOnce();
  });

  it("ignores cameo shortcuts while the selected tab is open", () => {
    const next = handlers();
    next.activeTab = "selected";
    applyGameCommand({ type: "cameo", index: 0, cancel: true }, next);
    expect(next.activateCameo).not.toHaveBeenCalled();
  });
});

describe("mission confirmation and routes", () => {
  it("builds confirmation copy and result destinations", () => {
    expect(missionConfirmationFor("restart")).toMatchObject({
      action: "restart",
      confirmLabel: "Restart mission",
      message: "Restart this mission from the beginning? Unsaved mission progress will be lost.",
    });
    expect(briefingPath(421, 2, true)).toBe("/briefing?seed=0421&mission=2&return=game");
    expect(tutorialPath()).toBe("/tutorial");
    expect(briefingBackPath(421, 2, false, "campaign")).toBe("/campaign?seed=0421");
    expect(briefingBackPath(421, 2, false, "newGame")).toBe("/?seed=0421");
    expect(briefingBackPath(421, 2, false, "result")).toBe("/play?seed=0421&mission=2&resume=1");
    expect(campaignCompletePath(7)).toBe("/campaign-complete?seed=0007");
    expect(menuPath()).toBe("/");
    expect(resultPrimaryPath({ result: "won", seed: 421, missionIndex: 3 })).toBe("/briefing?seed=0421&mission=4&from=result");
    expect(resultPrimaryPath({ result: "won", seed: 421, missionIndex: 5 })).toBe("/campaign-complete?seed=0421");
    expect(resultPrimaryPath({ result: "won", seed: 421, missionIndex: 7 })).toBe("/campaign-complete?seed=0421");
    expect(resultPrimaryPath({ result: "lost", seed: 421, missionIndex: 3 })).toBe("/briefing?seed=0421&mission=3&from=result");
    expect(missionConfirmationFor("menu", "won").message).toBe("Return to the main menu?");
    expect(missionConfirmationFor("restart", "lost").message).toBe("Restart this mission from the beginning?");
  });
});

describe("production and overlay helpers", () => {
  it("picks the least-loaded ready producer", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const first = addBuilding(state, 0, "barracks", 2, 2);
    const second = addBuilding(state, 0, "barracks", 5, 2);
    first.producing = { kind: "infantry", remaining: 8 };
    expect(leastLoadedProducer(state, 0, "infantry")?.id).toBe(second.id);
    expect(leastLoadedProducer(state, 0, "medic")?.id).toBe(second.id);
  });

  it("derives play-field copy and overlay chrome from sim state", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 2, 2);
    addUnit(state, 1, "tank", 8, 8);
    expect(playFieldStatus(state)).toMatchObject({
      objective: "Hostiles left 1",
      secondary: [],
    });
    const overlay = gameOverlayModel({ state, selectedIds: [unit.id] });
    expect(overlay.selected?.id).toBe(unit.id);
    expect(gameOverlayModel({ state, selectedIds: [] }).selected).toBeUndefined();
  });

  it("does not show a duplicate operation window for hold missions", () => {
    const hold = makeFixture({ win: { kind: "holdTheLine", ticks: 120 } });
    expect(playFieldStatus(hold)).toMatchObject({
      objective: "Hold 00:10 remaining",
      timeRemaining: undefined,
    });

    const timed = makeFixture({ win: { kind: "rescue", targetCount: 1, ticks: 120 } });
    timed.runtime = {
      kind: "rescue",
      phase: "active",
      targetIds: [],
      deadline: 120,
      rescued: 0,
      required: 1,
      secondary: [],
    };
    expect(playFieldStatus(timed).timeRemaining).toBe("Time remaining 00:10");
  });

  it("shows the escort total limit separately from convoy departure", () => {
    const escort = createMission({ seed: 421, missionIndex: 3 });
    expect(playFieldStatus(escort)).toMatchObject({
      timeRemaining: "Time remaining 22:00",
      convoyDeparture: "Convoy departs in 03:00",
    });
  });

  it("passes the briefing objectives through to the battlefield status", () => {
    const campaign = createCampaign(421);
    const mission = campaign.missions[0]!;
    const state = createMission({ seed: 421, missionIndex: mission.index });

    expect(playFieldStatus(state, campaign).briefingObjectives).toEqual(missionObjectives(mission, campaign));
    expect(playFieldStatus(state, campaign).profileLabel).toMatch(/Resource Race|Forward Industry|Direct Route|Contested Route|Surgical Strike|Siege|Concentrated Waves|Crossfire/);
  });
});

describe("loop audio intensity", () => {
  it("escalates from director phase, recent combat, and warning alerts", () => {
    expect(desiredMusicIntensity("opening", 10, Number.NEGATIVE_INFINITY, false)).toBe("calm");
    expect(desiredMusicIntensity("pressure", 10, Number.NEGATIVE_INFINITY, false)).toBe("engaged");
    expect(desiredMusicIntensity("finale", 10, Number.NEGATIVE_INFINITY, false)).toBe("critical");
    expect(desiredMusicIntensity("opening", 50, 40, false)).toBe("engaged");
    expect(desiredMusicIntensity("finale", 50, 40, true)).toBe("critical");
    expect(warningAlert([{ type: "alert", kind: "warning", text: "Incoming" }])).toBe(true);
    expect(warningAlert([
      { type: "alert", kind: "contact", text: "Spotted" },
      { type: "alert", kind: "warning", text: "Incoming" },
    ])).toBe(false);
    expect(alertSfx("objective")).toBe("objective");
    expect(rejectionSfx("insufficient credits")).toBe("insufficientFunds");
    expect(rejectionSfx("power shortage")).toBe("powerShortage");
    expect(rejectionSfx("invalid placement")).toBe("uiError");
  });
});
