// @vitest-environment jsdom

import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCampaign } from "../../lib/gen/campaign";
import { defaultSettings } from "../../lib/persist/settings";
import { addUnit, makeFixture } from "../../lib/sim/fixtures";
import { generateVisualProfile } from "../../lib/gen/visualProfile";
import type { GameCamera } from "../../components/game/hooks/useGameCamera";
import type { OverlaySurfaceModel } from "../../components/game/hooks/runtime/types";
import { GameOverlays } from "../../components/game/GameOverlays";
import { MissionResult } from "../../components/game/MissionResult";
import { MissionResultActions } from "../../components/game/MissionResultActions";
import { MissionOutcome } from "../../components/game/MissionResultSections";
import { missionDebrief } from "../../lib/sim/debrief";
import { MISSION_MAX } from "../../lib/seed/rng";

vi.mock("../../components/game/MobileCommandLauncher", () => ({
  MobileCommandLauncher: ({ open }: { open: boolean }) => <div data-testid="surface-mobile-launcher" data-open={open ? "true" : "false"} />,
}));
vi.mock("../../components/game/CommandSidebar", () => ({
  CommandSidebar: ({
    onStop,
    onStance,
    onFormation,
  }: {
    onStop: () => void;
    onStance: (stance: "aggressive") => void;
    onFormation: (formation: "line") => void;
  }) => {
    onStop();
    onStance("aggressive");
    onFormation("line");
    return <div data-testid="surface-sidebar" />;
  },
}));
vi.mock("../../components/game/PauseMenu", () => ({
  PauseMenu: ({
    onOptions,
    onBack,
  }: {
    onOptions: () => void;
    onBack: () => void;
  }) => {
    onOptions();
    onBack();
    return <div data-testid="surface-pause" />;
  },
}));

afterEach(() => cleanup());

function testCommands() {
  const noop = vi.fn();
  return {
    placeKind: null,
    repairMode: false,
    sellMode: false,
    onPlace: noop,
    onRepair: noop,
    onSell: noop,
    onCancelBuilding: noop,
    onQueueUnit: noop,
    onCancelUnit: noop,
    availableProducer: noop,
    onStop: noop,
    onStance: noop,
    onFormation: noop,
  };
}

function testPauseSession() {
  const noop = vi.fn();
  return {
    saveSlots: [],
    loadEntries: [],
    defaultSlotName: "Test · M1",
    telemetryEnabled: false,
    onResume: noop,
    onSave: noop,
    onLoad: noop,
    onCommitSave: () => false,
    onLoadEntry: noop,
    onBriefing: noop,
    onRestart: noop,
    onMenu: noop,
    onToggleSound: noop,
    onToggleMusic: noop,
    onVolumeChange: noop,
  };
}

describe("game overlay surfaces", () => {
  it("switches mobile, sidebar, pause, tutorial, and terminal states", () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 2, 2);
    const camera = {
      onMinimapPointerDown: vi.fn(),
      onMinimapPointerMove: vi.fn(),
      onMinimapPointerUp: vi.fn(),
      isMinimapDragging: false,
    } as unknown as GameCamera;
    const props: OverlaySurfaceModel = {
      campaign: createCampaign(421),
      state,
      playerVisualProfile: generateVisualProfile(421, 0),
      selectedIds: [unit.id],
      tutorial: false,
      mobilePanelOpen: true,
      mobileLauncherRef: createRef<HTMLButtonElement>(),
      miniRef: createRef<HTMLCanvasElement>(),
      activeTab: "construction" as const,
      onTab: vi.fn(),
      paused: false,
      audioSettings: defaultSettings(),
      camera,
      onToggleMobilePanel: vi.fn(),
      sidebar: {
        factionName: "Test faction",
        state,
        palette: state.factions[0].palette,
        profile: generateVisualProfile(421, 0),
        selected: state.entities.find((entity) => entity.id === unit.id),
        activeTab: "construction",
        power: 0,
        produced: 0,
        used: 0,
        miniRef: createRef<HTMLCanvasElement>(),
        camera,
        onPause: vi.fn(),
        onToggleMobilePanel: vi.fn(),
        onTab: vi.fn(),
        commands: testCommands(),
        mobilePanelOpen: true,
        selectionCount: 1,
      },
      pause: {
        view: "main",
        notice: "",
        settings: defaultSettings(),
        tutorial: false,
        setView: vi.fn(),
        setNotice: vi.fn(),
        session: testPauseSession(),
      },
      confirmation: null,
    };
    const { rerender } = render(<GameOverlays {...props} />);

    expect(screen.getByTestId("surface-mobile-launcher")).toBeVisible();
    expect(screen.getByTestId("surface-sidebar")).toBeVisible();

    rerender(
      <GameOverlays
        {...props}
        confirmation={{
          value: {
            action: "menu",
            title: "Leave mission?",
            message: "Return to the main menu?",
            confirmLabel: "Leave mission",
          },
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        }}
      />,
    );
    expect(screen.queryByTestId("surface-mobile-launcher")).toBeNull();
    expect(screen.getByTestId("mission-confirmation")).toBeVisible();

    rerender(<GameOverlays {...props} paused />);
    expect(screen.queryByTestId("surface-mobile-launcher")).toBeNull();
    expect(screen.getByTestId("surface-pause")).toBeVisible();

    rerender(<GameOverlays {...props} tutorial state={{ ...state, result: "won" }} paused={false} />);
    expect(screen.queryByTestId("surface-mobile-launcher")).toBeNull();
    expect(screen.queryByTestId("surface-sidebar")).toBeNull();
    expect(screen.queryByTestId("surface-pause")).toBeNull();
  });

  it("offers to replay a completed mission", () => {
    const state = { ...makeFixture({ seed: 421, win: { kind: "annihilate" } }), result: "won" as const };
    const onRetry = vi.fn();

    render(
      <MissionResultActions
        state={state}
        onNextBriefing={vi.fn()}
        onCampaignVictory={vi.fn()}
        onRetry={onRetry}
        onMenu={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Replay mission" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Share result" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Next briefing" })).toHaveAttribute("data-default-action", "true");
  });

  it("offers campaign victory after the final mission", () => {
    const state = {
      ...makeFixture({ seed: 421, win: { kind: "annihilate" } }),
      result: "won" as const,
      missionIndex: MISSION_MAX,
    };
    const onCampaignVictory = vi.fn();

    render(
      <MissionResultActions
        state={state}
        onNextBriefing={vi.fn()}
        onCampaignVictory={onCampaignVictory}
        onRetry={vi.fn()}
        onMenu={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Next briefing" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Campaign victory" }));
    expect(onCampaignVictory).toHaveBeenCalledOnce();
  });

  it("uses retry as the default action and removes sharing after a failure", () => {
    const state = { ...makeFixture({ seed: 421, win: { kind: "annihilate" } }), result: "lost" as const };

    render(
      <MissionResultActions
        state={state}
        onNextBriefing={vi.fn()}
        onCampaignVictory={vi.fn()}
        onRetry={vi.fn()}
        onMenu={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Share result" })).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toHaveAttribute("data-default-action", "true");
    expect(screen.queryByRole("button", { name: "Campaign map" })).toBeNull();
  });

  it("keeps result art and status semantics for win and loss states", () => {
    const lost = { ...makeFixture({ seed: 421, win: { kind: "annihilate" } }), result: "lost" as const };
    const callbacks = {
      onNextBriefing: vi.fn(),
      onCampaignVictory: vi.fn(),
      onRetry: vi.fn(),
      onMenu: vi.fn(),
    };
    const { rerender } = render(<MissionResult state={lost} {...callbacks} />);

    const result = screen.getByTestId("mission-result");
    expect(result).toHaveAttribute("data-result", "lost");
    expect(result).toHaveStyle({ "--result-art": 'url("/art/results/defeat.webp")' });

    const won = { ...lost, result: "won" as const };
    rerender(<MissionResult state={won} {...callbacks} />);
    expect(screen.getByTestId("mission-result")).toHaveAttribute("data-result", "won");
    expect(screen.getByTestId("mission-result")).toHaveStyle({ "--result-art": 'url("/art/results/victory.webp")' });
  });

  it("separates required mission conditions from bonus objectives", () => {
    const state = makeFixture({ seed: 421, win: { kind: "rescue", targetCount: 1, ticks: 144 } });
    state.result = "lost";
    state.lossReason = "yardDestroyed";
    state.runtime = {
      kind: "rescue",
      phase: "complete",
      targetIds: [42],
      deadline: 144,
      rescued: 0,
      required: 1,
      secondary: [
        { id: "yard", kind: "preserveYard", label: "Keep the Command HQ standing", completed: false },
        { id: "time", kind: "completeBefore", label: "Complete the operation within 12 min", target: 144, completed: true },
        { id: "survivors", kind: "keepUnits", label: "Keep at least one combat unit alive", completed: false },
      ],
    };

    render(<MissionOutcome debrief={missionDebrief(state)} />);

    expect(screen.getByTestId("required-objectives")).toHaveTextContent("Primary objectives");
    expect(screen.getByTestId("required-objectives")).toHaveTextContent("Command HQ destroyed");
    expect(screen.getByTestId("required-objectives")).toHaveTextContent("Operation not finished within 12 min");
    expect(screen.getByTestId("required-objectives")).toHaveTextContent("Stranded units return to Command HQ");
    expect(screen.getByTestId("optional-objectives")).toHaveTextContent("Bonus objectives");
    expect(screen.getByTestId("optional-objectives")).toHaveTextContent("No combat unit survived");
    expect(screen.queryByText("Secondary objectives")).toBeNull();
    expect(screen.queryByText("Tactical profile")).toBeNull();

    const retry = screen.getByTestId("retry-guidance");
    expect(retry).toHaveAttribute("open");

    fireEvent.click(screen.getByText("Retry guidance"));
    expect(retry).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Retry guidance"));
    expect(retry).toHaveAttribute("open");
  });

  it("keeps command controls available during tutorial play", () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const props: OverlaySurfaceModel = {
      campaign: createCampaign(421),
      state,
      playerVisualProfile: generateVisualProfile(421, 0),
      selectedIds: [],
      tutorial: true,
      mobilePanelOpen: false,
      mobileLauncherRef: createRef<HTMLButtonElement>(),
      miniRef: createRef<HTMLCanvasElement>(),
      activeTab: "construction" as const,
      onTab: vi.fn(),
      paused: false,
      audioSettings: defaultSettings(),
      camera: {
        onMinimapPointerDown: vi.fn(),
        onMinimapPointerMove: vi.fn(),
        onMinimapPointerUp: vi.fn(),
        isMinimapDragging: false,
      } as unknown as GameCamera,
      onToggleMobilePanel: vi.fn(),
      sidebar: {
        factionName: "Test faction",
        state,
        palette: state.factions[0].palette,
        profile: generateVisualProfile(421, 0),
        selected: undefined,
        activeTab: "construction",
        power: 0,
        produced: 0,
        used: 0,
        miniRef: createRef<HTMLCanvasElement>(),
        camera: {
          onMinimapPointerDown: vi.fn(),
          onMinimapPointerMove: vi.fn(),
          onMinimapPointerUp: vi.fn(),
          isMinimapDragging: false,
        } as unknown as GameCamera,
        onPause: vi.fn(),
        onToggleMobilePanel: vi.fn(),
        onTab: vi.fn(),
        commands: testCommands(),
        mobilePanelOpen: false,
        selectionCount: 0,
      },
      pause: {
        view: "main",
        notice: "",
        settings: defaultSettings(),
        tutorial: true,
        setView: vi.fn(),
        setNotice: vi.fn(),
        session: testPauseSession(),
      },
      confirmation: null,
    };

    render(<GameOverlays {...props} />);

    expect(screen.getByTestId("surface-mobile-launcher")).toBeVisible();
    expect(screen.getByTestId("surface-sidebar")).toBeVisible();
  });
});
