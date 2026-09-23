// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BriefingScreen } from "../../components/briefing/BriefingScreen";
import { CampaignArchiveScreen } from "../../components/campaign/CampaignArchiveScreen";
import { CampaignCompleteScreen } from "../../components/campaign/CampaignCompleteScreen";
import { MenuScreen } from "../../components/menu/MenuScreen";
import overlayStyles from "../../components/menu/MenuSignalOverlay.module.css";
import { freshCampaignProgress, writeCampaignProgress } from "../../lib/persist/campaign";
import { cachedLocalStorage, exportSlot, localStorageAdapter, writeSave, writeSlot } from "../../lib/persist/save";
import { readSettings } from "../../lib/persist/settings";
import { makeFixture } from "../../lib/sim/fixtures";
import { APP_VERSION } from "../../lib/site";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/audio/music", () => ({ setMusicEnabled: vi.fn(), clearMusicPosition: vi.fn() }));
vi.mock("@/lib/audio/synth", () => ({ setSfxEnabled: vi.fn(), beep: vi.fn() }));
vi.mock("@/lib/audio/mixer", () => ({ setAudioLevels: vi.fn() }));
vi.mock("@/components/shared/MenuBackdrop", () => ({ MenuBackdrop: () => <div data-testid="menu-backdrop" /> }));
vi.mock("@/components/menu/MenuHero", () => ({ MenuHero: () => <h1>Shifting Front</h1> }));
vi.mock("@/components/menu/MenuMainPanel", () => ({
  MenuMainPanel: ({ onNewGame, onTutorial, onLoadMission, onOptions }: { onNewGame: () => void; onTutorial: () => void; onLoadMission: () => void; onOptions: () => void }) => (
    <div>
      <button onClick={onNewGame}>NEW GAME</button>
      <button onClick={onTutorial}>TUTORIAL</button>
      <button onClick={onLoadMission}>LOAD MISSION</button>
      <button onClick={onOptions}>OPTIONS</button>
    </div>
  ),
}));
vi.mock("@/components/menu/MenuOverlay", () => ({
  MenuOverlay: ({ view, onLaunch, onBack }: { view: string; onLaunch: () => void; onBack: () => void }) =>
    view === "main" ? null : <div role="dialog"><span>{view}</span><button onClick={onLaunch}>Launch</button><button onClick={onBack}>Back</button></div>,
}));
vi.mock("@/components/briefing/BriefingMast", () => ({ BriefingMast: () => <div data-testid="briefing-mast" /> }));
vi.mock("@/components/briefing/BriefingPortraits", () => ({
  BriefingAllyPortraits: () => <div data-testid="ally-portraits" />,
  BriefingEnemyPortrait: () => <div data-testid="enemy-portrait" />,
}));
vi.mock("@/components/briefing/BriefingStory", () => ({ BriefingStory: () => <div data-testid="briefing-story" /> }));
vi.mock("@/components/briefing/BriefingObjectives", () => ({ BriefingObjectives: () => <div data-testid="briefing-objectives" /> }));
vi.mock("@/components/briefing/BriefingActions", () => ({
  BriefingActions: ({ onLaunch, onReplay }: { onLaunch: () => void; onReplay: () => void }) => (
    <div data-testid="briefing-actions"><button onClick={onLaunch}>Launch</button><button onClick={onReplay}>Replay</button></div>
  ),
}));

beforeEach(() => {
  router.push.mockReset();
  window.localStorage.clear();
});

function stubMatchMedia(matchesReducedMotion: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? matchesReducedMotion : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }),
  });
}

afterEach(() => cleanup());

describe("MenuScreen", () => {
  it("opens setup and launches the daily campaign", () => {
    render(<MenuScreen />);
    fireEvent.click(screen.getByRole("button", { name: "NEW GAME" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("newGame");
    fireEvent.click(screen.getByRole("button", { name: "Launch" }));
    expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/briefing\?seed=\d{4}&mission=0&from=newGame$/));
  });

  it("opens the training range from the welcome tutorial action", () => {
    render(<MenuScreen />);
    fireEvent.click(screen.getByRole("button", { name: "TUTORIAL" }));
    expect(router.push).toHaveBeenCalledWith("/tutorial");
  });

  it("keeps the full product name out of the welcome topbar", () => {
    render(<MenuScreen />);

    expect(screen.getByText("COMMAND DESK")).toBeVisible();
    expect(screen.queryByText("SHIFTING FRONT")).toBeNull();
  });

  it("renders legal links instead of marketing promo copy in the welcome footer", () => {
    render(<MenuScreen />);

    expect(screen.queryByText("SEED YOUR OWN CAMPAIGN")).toBeNull();
    expect(screen.queryByText("8 OPERATIONS / NO TWO WARS ALIKE")).toBeNull();
    expect(screen.queryByText("PLAYS IN YOUR BROWSER")).toBeNull();
    const footer = document.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(screen.getByRole("button", { name: "Credits" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: `v${APP_VERSION}` })).toHaveAttribute(
      "href",
      "https://github.com/zakaihamilton/shiftingfront",
    );
  });

  it("opens the credits dialog from the welcome footer", () => {
    render(<MenuScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Credits" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("credits");
  });

  it("renders the ISR signal overlay over the welcome scene", () => {
    render(<MenuScreen />);

    const overlay = screen.getByTestId("menu-signal-overlay");
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveAttribute("data-reduced-motion", "false");
    expect(overlay).toHaveAttribute("data-paused", "false");
    expect(overlay).not.toHaveClass(overlayStyles.static);
    expect(overlay.querySelectorAll("[data-lock]")).toHaveLength(3);
    expect(overlay.querySelectorAll("canvas")).toHaveLength(3);
    expect(overlay.querySelector('[data-lock="a"]')).toHaveAttribute("data-expanded", "false");
    expect(overlay.querySelector('[data-lock="b"]')).toHaveAttribute("data-expanded", "false");
    expect(overlay.querySelector('[data-lock="c"]')).toHaveAttribute("data-expanded", "false");
  });

  it("freezes the signal overlay in its locked pose when motion is reduced", () => {
    const originalMatchMedia = window.matchMedia;
    stubMatchMedia(true);
    try {
      render(<MenuScreen />);

      const overlay = screen.getByTestId("menu-signal-overlay");
      expect(overlay).toHaveAttribute("data-reduced-motion", "true");
      expect(overlay).toHaveClass(overlayStyles.static);
      expect(overlay.querySelectorAll("[data-lock]")).toHaveLength(3);
      expect(overlay.querySelectorAll("canvas")).toHaveLength(0);
      expect(overlay.querySelector("[data-expanded='true']")).toBeNull();
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    }
  });

  it("pauses the signal overlay while a menu page is open", () => {
    render(<MenuScreen />);

    const overlay = screen.getByTestId("menu-signal-overlay");
    fireEvent.click(screen.getByRole("button", { name: "NEW GAME" }));
    expect(overlay).toHaveAttribute("data-paused", "true");
    expect(overlay).toHaveClass(overlayStyles.paused);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(overlay).toHaveAttribute("data-paused", "false");
    expect(overlay).not.toHaveClass(overlayStyles.paused);

    fireEvent.click(screen.getByRole("button", { name: "OPTIONS" }));
    expect(overlay).toHaveAttribute("data-paused", "true");
  });
});

describe("CampaignArchiveScreen", () => {
  it("loads as a separate archive page and returns to the menu", () => {
    render(<CampaignArchiveScreen />);

    expect(screen.getByTestId("campaign-archive")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Load mission" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "IMPORT SAVE" })).toBeNull();
    expect(screen.queryByText("Stored slots")).toBeNull();
    expect(screen.queryByText("Damaged saves")).toBeNull();
    expect(screen.getByText("No save slots.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Return to menu" }));
    expect(router.push).toHaveBeenCalledWith("/");
  });

  it("cancels an open delete dialog with Escape instead of leaving", async () => {
    writeSave(localStorageAdapter(), makeFixture({ seed: 421, win: { kind: "annihilate" } }));
    render(<CampaignArchiveScreen />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Delete autosave for/ })).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: /Delete autosave for/ }));
    expect(screen.getByRole("dialog", { name: "Delete autosave?" })).toBeVisible();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Delete autosave?" })).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("resumes a named save slot", async () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const written = writeSlot(localStorageAdapter(), {
      name: "Bridgehead",
      state,
      campaign: freshCampaignProgress(421),
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    render(<CampaignArchiveScreen />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Resume Bridgehead" })).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Resume Bridgehead" }));
    expect(router.push).toHaveBeenCalledWith(`/play?seed=0421&mission=0&slot=${written.id}`);
  });

  it("imports a named slot from JSON into the campaign archive", async () => {
    const source = localStorageAdapter();
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const written = writeSlot(source, {
      name: "Portable",
      state,
      campaign: freshCampaignProgress(421),
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    const raw = exportSlot(source, written.id);
    expect(raw).toBeTruthy();
    window.localStorage.clear();

    render(<CampaignArchiveScreen />);
    const file = new File([raw!], "portable.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Import named save slot JSON"), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Imported save as a new named slot."));
    expect(screen.getByRole("button", { name: "Resume Portable" })).toBeVisible();
  });

  it("resumes an autosave with mission index", async () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    state.missionIndex = 2;
    writeSave(localStorageAdapter(), state);
    render(<CampaignArchiveScreen />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Resume .* autosave/ })).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: /Resume .* autosave/ }));
    expect(router.push).toHaveBeenCalledWith("/play?seed=0421&resume=1&mission=2");
  });
});

describe("BriefingScreen", () => {
  it("renders missing, locked, and unlocked mission states", () => {
    const { rerender } = render(<BriefingScreen seed={421} mission={99} />);
    expect(screen.getByText("This mission isn't available.")).toBeVisible();
    rerender(<BriefingScreen seed={421} mission={1} />);
    expect(screen.getByText(/Mission locked/)).toBeVisible();
    rerender(<BriefingScreen seed={421} mission={0} />);
    expect(screen.getByTestId("briefing-screen")).toBeVisible();
    expect(screen.queryByTestId("briefing-profile")).toBeNull();
    expect(screen.queryByText("Tactical profile")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Launch" }));
    expect(router.push).toHaveBeenCalledWith("/play?seed=0421&mission=0&fresh=1");
  });

  it("shows first-encounter guide topics once and persists dismissal for later briefings", async () => {
    const first = render(<BriefingScreen seed={421} mission={0} />);
    await waitFor(() => expect(screen.getByTestId("field-guide-first-encounter")).toBeVisible());
    expect(screen.getByLabelText("Field conditions")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(readSettings(cachedLocalStorage()).seenFieldGuideTopics).toHaveLength(2);

    first.unmount();
    render(<BriefingScreen seed={421} mission={0} />);
    await waitFor(() => expect(screen.getByLabelText("Field conditions")).toBeVisible());
    expect(screen.queryByTestId("field-guide-first-encounter")).toBeNull();
  });
});

describe("CampaignCompleteScreen", () => {
  it("shows archived progress and returns to the menu", () => {
    const progress = freshCampaignProgress(421);
    progress.completedMissions = [0];
    progress.medals = { "0": 3 };
    progress.bestScores = { "0": 1234 };
    writeCampaignProgress(localStorageAdapter(), progress);
    render(<CampaignCompleteScreen seed={421} />);

    expect(screen.getByRole("heading", { name: "Campaign record" })).toBeVisible();
    expect(screen.getByText("Best score 1234")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Return to menu" }));
    expect(router.push).toHaveBeenCalledWith("/");
  });

  it("previews available operations and keeps later missions locked", () => {
    const progress = freshCampaignProgress(421);
    progress.tutorialComplete = true;
    progress.unlockedMission = 1;
    progress.completedMissions = [0];
    writeCampaignProgress(localStorageAdapter(), progress);
    render(<CampaignCompleteScreen seed={421} mode="operations" />);

    expect(screen.getByRole("heading", { name: "Operations map" })).toBeVisible();
    expect(screen.getByTestId("mission-card-0")).toHaveAccessibleName(/Replay mission 1/i);
    expect(screen.getByTestId("mission-card-1")).toHaveAccessibleName(/Deploy mission 2/i);
    expect(screen.getByTestId("mission-card-2")).toHaveAccessibleName(/Locked mission 3/i);

    fireEvent.click(screen.getByTestId("mission-card-2"));
    expect(screen.getByTestId("mission-detail")).toHaveTextContent(/Primary objective/i);
    expect(screen.getByTestId("mission-detail")).toHaveTextContent(/Primary requirements/i);
    expect(screen.getByTestId("mission-detail")).not.toHaveTextContent(/Secondary objectives/i);
    expect(screen.getByTestId("mission-detail")).toHaveTextContent(/Time limit/i);
    expect(screen.getByTestId("mission-detail")).toHaveTextContent(/Unlocks after completion/i);
    fireEvent.click(screen.getByTestId("mission-card-4"));
    expect(screen.getByTestId("mission-detail")).toHaveTextContent(/Expected duration/i);
    fireEvent.click(screen.getByTestId("mission-card-1"));
    expect(screen.getByTestId("mission-detail")).toHaveTextContent(/Bonus objectives/i);
    fireEvent.click(screen.getByTestId("launch-selected-mission"));
    expect(router.push).toHaveBeenCalledWith("/briefing?seed=0421&mission=1&from=campaign");
    fireEvent.click(screen.getByTestId("mission-card-0"));
    fireEvent.click(screen.getByTestId("launch-selected-mission"));
    expect(router.push).toHaveBeenCalledWith("/briefing?seed=0421&mission=0&from=campaign");
  });

  it("deploys the first operation to briefing without training", () => {
    render(<CampaignCompleteScreen seed={421} mode="operations" />);

    expect(screen.getByTestId("launch-selected-mission")).toHaveTextContent("Deploy mission 1");
    fireEvent.click(screen.getByTestId("launch-selected-mission"));
    expect(router.push).toHaveBeenCalledWith("/briefing?seed=0421&mission=0&from=campaign");
  });

  it("returns to the menu when Escape is pressed on the operations map", () => {
    render(<CampaignCompleteScreen seed={421} mode="operations" />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(router.push).toHaveBeenCalledWith("/");
  });
});
