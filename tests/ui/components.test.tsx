// @vitest-environment jsdom

import { createRef, useRef, useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileCommandLauncher } from "../../components/game/MobileCommandLauncher";
import { MobileTouchControls } from "../../components/game/MobileTouchControls";
import { SelectionOrders } from "../../components/game/SelectionOrders";
import { CommandCatalogContent } from "../../components/game/CommandCatalogContent";
import { MenuHero } from "../../components/menu/MenuHero";
import { MenuOverlay } from "../../components/menu/MenuOverlay";
import { MenuMainPanel } from "../../components/menu/MenuMainPanel";
import { NewGameSetup } from "../../components/menu/NewGameSetup";
import { SeedEntry } from "../../components/menu/SeedEntry";
import { PauseMenu } from "../../components/game/PauseMenu";
import { PauseDiagnostics } from "../../components/game/PauseDiagnostics";
import { PauseOptions } from "../../components/settings/PauseOptions";
import { PauseSaveSlots } from "../../components/game/PauseSaveSlots";
import { PauseLoadSlots } from "../../components/game/PauseLoadSlots";
import { CommandHeader } from "../../components/game/CommandHeader";
import { CommandTabs } from "../../components/game/CommandTabs";
import { TutorialOverlay } from "../../components/game/TutorialOverlay";
import type { ArchiveEntry, SlotMeta } from "../../lib/persist/save";
import { MissionConfirmation } from "../../components/game/MissionConfirmation";
import { BriefingActions } from "../../components/briefing/BriefingActions";
import { createCampaign } from "../../lib/gen/campaign";
import { biomeLabel } from "../../lib/gen/names";
import { defaultSettings } from "../../lib/persist/settings";
import type { Palette } from "../../lib/types";
import { generateVisualProfile } from "../../lib/gen/visualProfile";
import { makeFixture } from "../../lib/sim/fixtures";

const palette: Palette = {
  primary: "#4a7",
  secondary: "#253",
  accent: "#fd0",
  outline: "#111",
  light: "#8c8",
  dark: "#131",
};

vi.mock("@/components/game/ConstructionCameos", () => ({ ConstructionCameos: () => <div data-testid="construction-catalog" /> }));
vi.mock("@/components/game/ProductionCameos", () => ({ ProductionCameos: () => <div data-testid="production-catalog" /> }));
vi.mock("@/components/game/SelectionPanel", () => ({ SelectionPanel: () => <div data-testid="selection-catalog" /> }));

function ControlledSeedEntry() {
  const [code, setCode] = useState("0421");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <SeedEntry
      code={code}
      error=""
      previewLine="Preview"
      inputRef={inputRef}
      onChange={setCode}
      onRandomize={vi.fn()}
      onLaunch={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe("mobile command controls", () => {
  it("describes selection mode and exposes map commands only for a unit selection", () => {
    const onCommand = vi.fn();
    const onSelectionMode = vi.fn();
    const { rerender } = render(
      <MobileTouchControls
        selectedCount={0}
        hasUnitSelection={false}
        selectionMode={false}
        activeCommand={null}
        onCommand={onCommand}
        onSelectionMode={onSelectionMode}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByTestId("mobile-touch-controls")).toHaveTextContent("No selection");
    expect(screen.queryByTestId("mobile-command-move")).toBeNull();
    fireEvent.click(screen.getByTestId("mobile-select-mode"));
    expect(onSelectionMode).toHaveBeenCalledWith(true);

    rerender(
      <MobileTouchControls
        selectedCount={1}
        hasUnitSelection
        selectionMode
        activeCommand="move"
        onCommand={onCommand}
        onSelectionMode={onSelectionMode}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mobile-command-move")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("mobile-command-move"));
    expect(onCommand).toHaveBeenCalledWith("move");
  });

  it("keeps select available without a unit selection", () => {
    render(
      <MobileTouchControls
        selectedCount={0}
        hasUnitSelection={false}
        selectionMode={false}
        activeCommand={null}
        onCommand={vi.fn()}
        onSelectionMode={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mobile-select-mode")).toBeVisible();
    expect(screen.queryByTestId("mobile-command-move")).toBeNull();
  });
});

describe("command header", () => {
  it("opens the main game menu rather than the options view", () => {
    const onPause = vi.fn();
    render(<CommandHeader factionName="Eastern Republic" onPause={onPause} />);

    fireEvent.click(screen.getByRole("button", { name: /Open Shifting Front pause menu/ }));

    expect(onPause).toHaveBeenCalledWith("main");
  });
});

describe("MobileCommandLauncher", () => {
  it("opens and closes the portrait command panel from the compact rail", () => {
    const onToggle = vi.fn();
    const buttonRef = createRef<HTMLButtonElement>();
    const { rerender } = render(
      <MobileCommandLauncher open={false} onToggle={onToggle} buttonRef={buttonRef} />,
    );

    expect(screen.getByTestId("mobile-command-toggle")).toHaveAttribute("aria-label", "Open commands");
    expect(screen.getByTestId("mobile-command-icon").querySelectorAll("path")).toHaveLength(3);
    expect(screen.queryByTestId("mobile-command-scrim")).toBeNull();
    fireEvent.click(screen.getByTestId("mobile-command-toggle"));
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(<MobileCommandLauncher open onToggle={onToggle} buttonRef={buttonRef} />);
    expect(screen.getByTestId("mobile-command-toggle")).toHaveAttribute("aria-label", "Close commands");
    fireEvent.click(screen.getByTestId("mobile-command-scrim"));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("spotlights the command launcher when a tutorial step needs the sheet", () => {
    render(<MobileCommandLauncher open={false} onToggle={vi.fn()} buttonRef={createRef<HTMLButtonElement>()} tutorialFocus="command-launcher" />);
    expect(screen.getByTestId("mobile-command-launcher")).toHaveAttribute("data-tutorial-focus", "command-launcher");
  });

  it("does not spotlight the launcher while the command sheet is open", () => {
    render(<MobileCommandLauncher open buttonRef={createRef<HTMLButtonElement>()} onToggle={vi.fn()} />);
    expect(screen.getByTestId("mobile-command-launcher")).not.toHaveAttribute("data-tutorial-focus");
  });
});

describe("tutorial coach", () => {
  it("waits for the player instead of exposing a stage-skipping button", () => {
    render(
      <TutorialOverlay
        prompt="Move to the target."
        stage="move"
        targets={[{ kind: "tile", x: 4, y: 5, label: "Move destination" }]}
        onExit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("tutorial-overlay")).toHaveAttribute("data-stage", "move");
    expect(screen.getByText("Focus:")).toBeVisible();
    expect(screen.getByText("Waiting for your action")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("renames the exit action to command desk after the final stage", () => {
    const onExit = vi.fn();
    render(
      <TutorialOverlay
        prompt="Training complete."
        stage="complete"
        targets={[{ kind: "entity", entityId: 1, label: "Command desk" }]}
        onExit={onExit}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Return to Command Desk" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Exit Training" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Return to Command Desk" }));
    expect(onExit).toHaveBeenCalledOnce();
  });
});

describe("tutorial command focus", () => {
  it("marks the live command target with a stable focus attribute", () => {
    render(
      <CommandTabs
        activeTab="construction"
        repairMode={false}
        sellMode={false}
        tutorialFocus="construction-tab"
        onConstruction={vi.fn()}
        onProduction={vi.fn()}
        onSelected={vi.fn()}
        onRepair={vi.fn()}
        onSell={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Construction" })).toHaveAttribute("data-tutorial-focus", "construction-tab");
    expect(screen.getByRole("tab", { name: "Production" })).not.toHaveAttribute("data-tutorial-focus");
  });
});

describe("BriefingActions", () => {
  it("shows Escape on the briefing back action", () => {
    render(
      <BriefingActions
        campaign={createCampaign(421)}
        returnToGame={false}
        onReplay={vi.fn()}
        onLaunch={vi.fn()}
        onBack={vi.fn()}
        backLabel="Back to menu"
      />,
    );

    const backButton = screen.getByRole("button", { name: "Back to menu" });
    expect(backButton).toHaveAttribute("data-shortcut", "Esc");
    expect(backButton).toHaveAttribute("data-tooltip", "Back to menu");
    expect(screen.getByRole("button", { name: "Launch" })).toHaveAttribute("data-default-action", "true");
  });

  it("removes the duplicate back button when returning to a mission", () => {
    render(
      <BriefingActions
        campaign={createCampaign(421)}
        returnToGame
        onReplay={vi.fn()}
        onLaunch={vi.fn()}
        onBack={vi.fn()}
        backLabel="Back to mission"
      />,
    );

    expect(screen.queryByRole("button", { name: "Back to mission" })).toBeNull();
    expect(screen.getByRole("button", { name: "Return to mission" })).toBeVisible();
  });
});

describe("SelectionOrders", () => {
  it("routes stop, stance, and formation actions to the selected units", async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    const onStance = vi.fn();
    const onFormation = vi.fn();

    render(
      <SelectionOrders
        stance="aggressive"
        formation={undefined}
        onStop={onStop}
        onStance={onStance}
        onFormation={onFormation}
      />,
    );

    await user.click(screen.getByTestId("selected-action-stop"));
    await user.click(screen.getByTestId("selected-action-stance-hold"));
    await user.click(screen.getByTestId("selected-action-formation-wedge"));

    expect(onStop).toHaveBeenCalledOnce();
    expect(onStance).toHaveBeenCalledWith("hold");
    expect(onFormation).toHaveBeenCalledWith("wedge");
  });
});

describe("CommandCatalogContent", () => {
  it("routes each tab to one shared content surface", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const props = {
      state,
      palette,
      profile: generateVisualProfile(421, 0),
      activeTab: "construction" as const,
      placeKind: null,
      selected: undefined,
      power: 0,
      availableProducer: vi.fn(),
      onPlace: vi.fn(),
      onCancelBuilding: vi.fn(),
      onQueueUnit: vi.fn(),
      onCancelUnit: vi.fn(),
      onStop: vi.fn(),
      onStance: vi.fn(),
      onFormation: vi.fn(),
    };
    const { rerender } = render(<CommandCatalogContent {...props} />);
    expect(screen.getByTestId("construction-catalog")).toBeVisible();
    rerender(<CommandCatalogContent {...props} activeTab="production" />);
    expect(screen.getByTestId("production-catalog")).toBeVisible();
    rerender(<CommandCatalogContent {...props} activeTab="selected" />);
    expect(screen.getByTestId("selection-catalog")).toBeVisible();
  });
});

describe("SeedEntry", () => {
  it("selects an existing seed so typing replaces it", async () => {
    const user = userEvent.setup();
    render(<ControlledSeedEntry />);
    const input = screen.getByLabelText<HTMLInputElement>("Four digit campaign code");

    await user.click(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(4);

    await user.keyboard("0000");
    expect(input).toHaveValue("0000");
  });

  it("sanitizes input and launches on Enter or Roll", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onLaunch = vi.fn();
    const onRandomize = vi.fn();
    render(
      <SeedEntry
        code="12"
        error=""
        previewLine="Preview"
        inputRef={createRef<HTMLInputElement>()}
        onChange={onChange}
        onRandomize={onRandomize}
        onLaunch={onLaunch}
      />,
    );
    const input = screen.getByLabelText("Four digit campaign code");
    fireEvent.change(input, { target: { value: "a1b23456" } });
    expect(onChange).toHaveBeenCalledWith("1234");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onLaunch).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Roll" }));
    expect(onRandomize).toHaveBeenCalledOnce();
    expect(screen.queryByText("placeholder")).toBeNull();
  });

  it("keeps seed status height without a placeholder word", () => {
    render(
      <SeedEntry
        code="12"
        error=""
        previewLine="Preview"
        inputRef={createRef<HTMLInputElement>()}
        onChange={vi.fn()}
        onRandomize={vi.fn()}
        onLaunch={vi.fn()}
      />,
    );
    expect(document.body.textContent).not.toContain("placeholder");
  });
});

describe("MenuOverlay", () => {
  it("renders only the active overlay view", () => {
    const props = {
      code: "0421",
      error: "",
      previewLine: "Campaign",
      preview: null,
      copied: false,
      inputRef: createRef<HTMLInputElement>(),
      settings: defaultSettings(),
      onChange: vi.fn(),
      onRandomize: vi.fn(),
      onThisWeek: vi.fn(),
      onCopyLink: vi.fn(),
      onLaunch: vi.fn(),
      onToggleSound: vi.fn(),
      onToggleMusic: vi.fn(),
      onVolumeChange: vi.fn(),
      onBack: vi.fn(),
    };
    const { rerender } = render(<MenuOverlay {...props} view="main" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<MenuOverlay {...props} view="newGame" />);
    expect(screen.getByRole("dialog", { name: "New campaign" })).toBeVisible();
    rerender(<MenuOverlay {...props} view="options" />);
    expect(screen.getByRole("dialog", { name: "Game options" })).toBeVisible();
  });
});

describe("NewGameSetup", () => {
  it("does not expose an operations map action", () => {
    render(
      <NewGameSetup
        code="0421"
        error=""
        previewLine="Campaign"
        preview={null}
        copied={false}
        inputRef={createRef<HTMLInputElement>()}
        onChange={vi.fn()}
        onRandomize={vi.fn()}
        onThisWeek={vi.fn()}
        onCopyLink={vi.fn()}
        onLaunch={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "New campaign" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Operations map" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
    expect(screen.getByTestId("campaign-code-pane")).toBeVisible();
    expect(screen.getByTestId("campaign-info-pane")).toHaveTextContent("Choose a code");
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(screen.queryByTestId("campaign-backdrop")).toBeNull();
  });

  it("shows campaign backdrop, details, and copied-link state", () => {
    const campaign = createCampaign(421);
    const onCopyLink = vi.fn();
    const { rerender } = render(
      <NewGameSetup
        code="0421"
        error=""
        previewLine="Campaign"
        preview={campaign}
        copied={false}
        inputRef={createRef<HTMLInputElement>()}
        onChange={vi.fn()}
        onRandomize={vi.fn()}
        onThisWeek={vi.fn()}
        onCopyLink={onCopyLink}
        onLaunch={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("campaign-backdrop")).toBeVisible();
    expect(screen.getByTestId("campaign-backdrop")).toHaveAttribute(
      "aria-label",
      `${biomeLabel(campaign.world.biome)} campaign backdrop`,
    );
    expect(campaign.missions.every((mission) => mission.biome === campaign.world.biome)).toBe(true);
    const startButton = screen.getByRole("button", { name: "Start" });
    expect(screen.getByTestId("campaign-info-pane")).toContainElement(startButton);
    expect(startButton).toHaveAttribute("data-default-action", "true");
    const codePane = screen.getByTestId("campaign-code-pane");
    expect(codePane).toContainElement(screen.getByRole("button", { name: "Copy link" }));
    expect(codePane).not.toHaveTextContent(campaign.world.name);
    const copyButton = screen.getByRole("button", { name: "Copy link" });
    expect(copyButton).toHaveAttribute("data-tooltip", "Copy campaign link to clipboard");
    expect(copyButton.querySelector("svg")).not.toBeNull();
    expect(copyButton.parentElement).toContainElement(screen.getByRole("button", { name: "Roll" }));
    expect(copyButton.parentElement).toContainElement(screen.getByRole("button", { name: "This Week" }));
    expect(screen.getByText(campaign.world.name)).toBeVisible();
    expect(screen.getByText(campaign.characters.commander.name)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(onCopyLink).toHaveBeenCalledOnce();

    rerender(
      <NewGameSetup
        code="0421"
        error=""
        previewLine="Campaign"
        preview={campaign}
        copied
        inputRef={createRef<HTMLInputElement>()}
        onChange={vi.fn()}
        onRandomize={vi.fn()}
        onThisWeek={vi.fn()}
        onCopyLink={onCopyLink}
        onLaunch={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Link copied!" })).toBeVisible();
  });

  it("uses a versus layout when faction names are long", () => {
    const campaign = createCampaign(421);
    render(
      <NewGameSetup
        code="0421"
        error=""
        previewLine="Campaign"
        preview={campaign}
        copied={false}
        inputRef={createRef<HTMLInputElement>()}
        onChange={vi.fn()}
        onRandomize={vi.fn()}
        onThisWeek={vi.fn()}
        onCopyLink={vi.fn()}
        onLaunch={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("campaign-details")).toHaveAttribute("data-wide", "true");
    expect(screen.getByText(campaign.factions[0].name)).toBeVisible();
    expect(screen.getByText(campaign.factions[1].name)).toBeVisible();
    expect(screen.queryByText(`${campaign.factions[0].name} vs ${campaign.factions[1].name}`)).toBeNull();
  });

  it("keeps a compact faction line when names are short", () => {
    const campaign = createCampaign(201);
    render(
      <NewGameSetup
        code="0201"
        error=""
        previewLine="Campaign"
        preview={campaign}
        copied={false}
        inputRef={createRef<HTMLInputElement>()}
        onChange={vi.fn()}
        onRandomize={vi.fn()}
        onThisWeek={vi.fn()}
        onCopyLink={vi.fn()}
        onLaunch={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("campaign-details")).not.toHaveAttribute("data-wide");
    expect(screen.getByText(campaign.factions[0].name)).toBeVisible();
    expect(screen.getByText(campaign.factions[1].name)).toBeVisible();
    expect(screen.getByText("VS")).toBeVisible();
  });

  it("restores the weekly seed from This Week", () => {
    const onThisWeek = vi.fn();
    render(
      <NewGameSetup
        code="0421"
        error=""
        previewLine="Campaign"
        preview={createCampaign(421)}
        copied={false}
        inputRef={createRef<HTMLInputElement>()}
        onChange={vi.fn()}
        onRandomize={vi.fn()}
        onThisWeek={onThisWeek}
        onCopyLink={vi.fn()}
        onLaunch={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "This Week" }));
    expect(onThisWeek).toHaveBeenCalledOnce();
  });
});

describe("MenuHero", () => {
  it("renders the product title once without repeating it as an eyebrow", () => {
    render(<MenuHero />);

    expect(screen.getByRole("heading", { name: "SHIFTING" })).toBeVisible();
    expect(screen.getByText("FRONT")).toBeVisible();
    expect(screen.getByText("Harvest. Build. Conquer.")).toBeInTheDocument();
    expect(screen.queryByText("Shifting Front")).toBeNull();
  });
});

describe("MenuMainPanel dashboard", () => {
  const handlers = {
    onNewGame: vi.fn(),
    onTutorial: vi.fn(),
    onLoadMission: vi.fn(),
    onOptions: vi.fn(),
  };

  const renderDashboard = () => render(
    <MenuMainPanel
      {...handlers}
    />,
  );

  it("shows one unified main menu when the archive is empty", () => {
    renderDashboard();

    expect(screen.getByTestId("menu-dashboard")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Main menu" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Main menu" })).toHaveTextContent("TUTORIAL");
    expect(screen.getByRole("navigation", { name: "Main menu" })).toHaveTextContent("LOAD MISSION");
    expect(screen.getByRole("navigation", { name: "Main menu" })).not.toHaveTextContent("Campaign archive");
    expect(screen.queryByRole("button", { name: "IMPORT SAVE" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "NEW GAME" }));
    fireEvent.click(screen.getByRole("button", { name: "TUTORIAL" }));
    fireEvent.click(screen.getByRole("button", { name: "LOAD MISSION" }));
    fireEvent.click(screen.getByRole("button", { name: "OPTIONS" }));
    expect(handlers.onNewGame).toHaveBeenCalledOnce();
    expect(handlers.onTutorial).toHaveBeenCalledOnce();
    expect(handlers.onLoadMission).toHaveBeenCalledOnce();
    expect(handlers.onOptions).toHaveBeenCalledOnce();
  });
});

describe("PauseMenu", () => {
  it("routes main actions and alternate views through callbacks", () => {
    const onResume = vi.fn();
    const onOptions = vi.fn();
    const onControls = vi.fn();
    const onDiagnostics = vi.fn();
    const onBackToOptions = vi.fn();
    const onBack = vi.fn();
    const onCommitSave = vi.fn(() => true);
    const onLoadEntry = vi.fn();
    const onLeaveWithoutSave = vi.fn();
    const props = {
      view: "main" as const,
      notice: "Mission saved.",
      settings: defaultSettings(),
      saveSlots: [],
      loadEntries: [],
      defaultSlotName: "Test · M1",
      onResume,
      onSave: vi.fn(),
      onLoad: vi.fn(),
      onCommitSave,
      onLoadEntry,
      onBriefing: vi.fn(),
      onRestart: vi.fn(),
      onControls,
      onDiagnostics,
      onBackToOptions,
      onOptions,
      onMenu: vi.fn(),
      onLeaveWithoutSave,
      onToggleSound: vi.fn(),
      onToggleMusic: vi.fn(),
      onVolumeChange: vi.fn(),
      onBack,
    };
    const { rerender } = render(<PauseMenu {...props} />);
    expect(screen.getByTestId("pause-menu")).toHaveTextContent("Mission saved.");
    expect(screen.getByText("Mission")).toBeVisible();
    expect(screen.getByText("Operation")).toBeVisible();
    expect(screen.getByText("Campaign")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Export Save" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume Mission" }));
    expect(onResume).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Assets" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Controls" }));
    expect(onControls).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Soundtrack" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(onOptions).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Main Menu" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Leave without saving" }));
    expect(onLeaveWithoutSave).toHaveBeenCalledOnce();

    rerender(<PauseMenu {...props} view="controls" notice="" />);
    expect(screen.getByTestId("pause-controls")).toBeVisible();
    expect(screen.getByTestId("pause-controls")).toHaveTextContent("Double-click");

    rerender(<PauseMenu {...props} view="options" notice="" />);
    expect(screen.getByRole("button", { name: "Diagnostics" })).toBeVisible();
    expect(screen.queryByText(/Stored mission telemetry/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Diagnostics" }));
    expect(onDiagnostics).toHaveBeenCalledOnce();

    rerender(<PauseMenu {...props} view="diagnostics" notice="" />);
    expect(screen.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBackToOptions).toHaveBeenCalledOnce();

    rerender(<PauseMenu {...props} view="save" notice="" />);
    expect(screen.getByRole("heading", { name: "Save mission" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onCommitSave).toHaveBeenCalledWith("Test · M1", null);

    rerender(<PauseMenu {...props} view="main" notice="" tutorial />);
    expect(screen.queryByRole("button", { name: "Save Mission" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Load Mission" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mission Briefing" })).toBeNull();
    expect(screen.getByRole("button", { name: "Restart Mission" })).toBeVisible();

    expect(onBack).not.toHaveBeenCalled();
  });
});

describe("PauseDiagnostics telemetry controls", () => {
  it("exports telemetry, confirms clearing, and reports status without touching saves", () => {
    const onExportTelemetry = vi.fn(() => true);
    const onClearTelemetry = vi.fn(() => true);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <PauseDiagnostics
        onBack={vi.fn()}
        telemetryRecordCount={3}
        onExportTelemetry={onExportTelemetry}
        onClearTelemetry={onClearTelemetry}
      />,
    );

    expect(screen.getByText("Stored mission telemetry: 3 records")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Export Telemetry" }));
    expect(onExportTelemetry).toHaveBeenCalledOnce();
    expect(screen.getByText("Telemetry exported.", { exact: true })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Clear Telemetry" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(onClearTelemetry).toHaveBeenCalledOnce();
    expect(screen.getByText("Telemetry cleared.", { exact: true })).toBeVisible();

    confirm.mockRestore();
  });

  it("does not clear telemetry when confirmation is cancelled", () => {
    const onClearTelemetry = vi.fn(() => true);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <PauseDiagnostics
        onBack={vi.fn()}
        telemetryRecordCount={1}
        onExportTelemetry={vi.fn(() => true)}
        onClearTelemetry={onClearTelemetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear Telemetry" }));
    expect(onClearTelemetry).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

});

describe("PauseOptions controls", () => {
  it("cycles colorblind mode and configures custom keybinds", () => {
    const onCycleColorblind = vi.fn();
    const onUpdateKeyBindings = vi.fn();

    render(
      <PauseOptions
        settings={defaultSettings()}
        onToggleSound={vi.fn()}
        onToggleMusic={vi.fn()}
        onCycleColorblind={onCycleColorblind}
        onUpdateKeyBindings={onUpdateKeyBindings}
        onVolumeChange={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    // Verify toggles are structured inside toggleGrid container
    const musicBtn = screen.getByRole("button", { name: /Music:/ });
    const soundBtn = screen.getByRole("button", { name: /Sound effects:/ });
    expect(musicBtn.parentElement).toHaveClass(/toggleGrid/);
    expect(soundBtn.parentElement).toHaveClass(/toggleGrid/);

    // Colorblind toggle
    const colorblindBtn = screen.getByRole("button", { name: /Colorblind: Off/ });
    expect(colorblindBtn).toBeVisible();
    fireEvent.click(colorblindBtn);
    expect(onCycleColorblind).toHaveBeenCalledOnce();

    // Open keybinds modal
    const keybindsBtn = screen.getByRole("button", { name: "Configure Keybinds…" });
    fireEvent.click(keybindsBtn);

    const dialog = screen.getByRole("dialog", { name: "Keybindings" });
    expect(dialog).toBeVisible();

    // Rebind "Repair Mode"
    const repairRebindBtn = screen.getByTitle("Rebind Repair Mode");
    fireEvent.click(repairRebindBtn);
    expect(repairRebindBtn).toHaveTextContent("Press key…");

    fireEvent.keyDown(window, { key: "p" });
    expect(repairRebindBtn).toHaveTextContent("P");

    // Save keybindings
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onUpdateKeyBindings).toHaveBeenCalledWith(
      expect.objectContaining({ repair: "p" }),
    );
    expect(screen.queryByRole("dialog", { name: "Keybindings" })).toBeNull();
  });

  it("opens the structured bug form for player feedback", () => {
    render(
      <PauseOptions
        settings={defaultSettings()}
        onToggleSound={vi.fn()}
        onToggleMusic={vi.fn()}
        onVolumeChange={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "Report an Issue / Feedback ↗" })).toHaveAttribute(
      "href",
      expect.stringContaining("/issues/new?template=bug.yml"),
    );
  });
});

describe("MissionConfirmation", () => {
  it("shows the requested action and routes confirm/cancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <MissionConfirmation
        confirmation={{
          action: "restart",
          title: "Restart mission?",
          message: "Restart this mission from the beginning?",
          confirmLabel: "Restart mission",
        }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Restart mission?" })).toHaveTextContent("Restart this mission");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart mission" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("PauseSaveSlots", () => {
  const sampleSlot: SlotMeta = {
    id: "slot1234slot1234",
    seed: "0421",
    name: "Base Alpha",
    missionIndex: 0,
    savedAt: 1000,
    tick: 10,
    result: "playing",
    campaignName: "Eos Prime",
    missionName: "Operation Alpha",
  };

  it("submits a save on Enter key inside the name input", () => {
    const onCommit = vi.fn(() => true);
    render(
      <PauseSaveSlots
        defaultName="New Save"
        slots={[sampleSlot]}
        onCommit={onCommit}
        onBack={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Save slot name");
    fireEvent.change(input, { target: { value: "Custom Name" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).toHaveBeenCalledWith("Custom Name", null);
  });

  it("triggers onBack when pressing Escape inside the name input", () => {
    const onBack = vi.fn();
    render(
      <PauseSaveSlots
        defaultName="New Save"
        slots={[]}
        onCommit={vi.fn(() => true)}
        onBack={onBack}
      />,
    );

    const input = screen.getByLabelText("Save slot name");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("toggles slot selection when clicking the already-selected slot", () => {
    render(
      <PauseSaveSlots
        defaultName="Default Name"
        slots={[sampleSlot]}
        onCommit={vi.fn(() => true)}
        onBack={vi.fn()}
      />,
    );

    const slotButton = screen.getByRole("button", { name: /Select Base Alpha/ });
    fireEvent.click(slotButton);
    expect(screen.getByLabelText("Save slot name")).toHaveValue("Base Alpha");

    // Click again to toggle off
    fireEvent.click(slotButton);
    expect(screen.getByLabelText("Save slot name")).toHaveValue("Default Name");
  });

  it("deletes a slot and notifies onDelete", () => {
    const onDelete = vi.fn();
    render(
      <PauseSaveSlots
        defaultName="Default Name"
        slots={[sampleSlot]}
        onCommit={vi.fn(() => true)}
        onDelete={onDelete}
        onBack={vi.fn()}
      />,
    );

    const deleteBtn = screen.getByRole("button", { name: "Delete save slot Base Alpha" });
    fireEvent.click(deleteBtn);

    // Confirm dialog appears
    expect(screen.getByRole("dialog", { name: "Delete save slot?" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Delete save slot" }));

    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "slot1234slot1234" }));
    expect(screen.queryByText("Base Alpha")).toBeNull();
  });
});

describe("PauseLoadSlots", () => {
  const sampleSlot: ArchiveEntry = {
    kind: "slot",
    id: "slot1234slot1234",
    seed: "0421",
    name: "Base Alpha",
    missionIndex: 0,
    savedAt: 1000,
    tick: 10,
    result: "playing",
    campaignName: "Eos Prime",
    missionName: "Operation Alpha",
  };

  it("prompts to load mission when pressing Enter on selected slot", () => {
    const onLoad = vi.fn();
    render(
      <PauseLoadSlots
        entries={[sampleSlot]}
        onLoad={onLoad}
        onBack={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "Load mission?" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Load mission" }));
    expect(onLoad).toHaveBeenCalledWith(sampleSlot);
  });

  it("prompts to load mission when clicking a slot entry directly", () => {
    const onLoad = vi.fn();
    render(
      <PauseLoadSlots
        entries={[sampleSlot]}
        onLoad={onLoad}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Resume Base Alpha/ }));
    expect(screen.getByRole("dialog", { name: "Load mission?" })).toBeVisible();
  });

  it("deletes an entry and invokes onDelete", () => {
    const onDelete = vi.fn();
    render(
      <PauseLoadSlots
        entries={[sampleSlot]}
        onLoad={vi.fn()}
        onDelete={onDelete}
        onBack={vi.fn()}
      />,
    );

    const deleteBtn = screen.getByRole("button", { name: "Delete save slot Base Alpha" });
    fireEvent.click(deleteBtn);

    expect(screen.getByRole("dialog", { name: "Delete save slot?" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Delete save slot" }));

    expect(onDelete).toHaveBeenCalledWith(sampleSlot);
    expect(screen.queryByText("Base Alpha")).toBeNull();
  });

  it("keeps Enter in nested delete confirmation from opening load confirmation", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    const onDelete = vi.fn();
    render(
      <PauseLoadSlots
        entries={[sampleSlot]}
        onLoad={onLoad}
        onDelete={onDelete}
        onBack={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete save slot Base Alpha" }));
    const deleteDialog = screen.getByRole("dialog", { name: "Delete save slot?" });
    const deleteButton = within(deleteDialog).getByRole("button", { name: "Delete save slot" });
    deleteButton.focus();
    await user.keyboard("{Enter}");

    expect(onDelete).toHaveBeenCalledWith(sampleSlot);
    expect(onLoad).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Load mission?" })).toBeNull();
  });
});
