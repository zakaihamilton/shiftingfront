// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import NotFound from "../../app/not-found";
import { BriefingMast } from "../../components/briefing/BriefingMast";
import { BattlefieldHud } from "../../components/game/BattlefieldHud";
import { CommandTabs } from "../../components/game/CommandTabs";
import { DocumentTitle } from "../../components/ui/DocumentTitle";
import { PageFallback } from "../../components/ui/PageFallback";
import { createCampaign } from "../../lib/gen/campaign";
import { objectiveCardsFor } from "../../lib/ui/missionPresentation";
import { makeFixture } from "../../lib/sim/fixtures";

afterEach(() => cleanup());

describe("product chrome", () => {
  it("renders a themed standby fallback", () => {
    render(<PageFallback>Deploying…</PageFallback>);
    expect(screen.getByTestId("page-fallback")).toHaveTextContent("Stand by");
    expect(screen.getByTestId("page-fallback")).toHaveTextContent("Deploying…");
  });

  it("renders a themed not-found notice", () => {
    render(<NotFound />);
    expect(screen.getByTestId("not-found")).toHaveTextContent("This frequency is dark");
    expect(screen.getByTestId("home-link")).toHaveAttribute("href", "/");
  });

  it("sets the document title and restores the previous title on unmount", () => {
    document.title = "Shifting Front";
    const { unmount } = render(<DocumentTitle title="Seed 0421 · Operation 1 | Shifting Front" />);
    expect(document.title).toBe("Seed 0421 · Operation 1 | Shifting Front");
    unmount();
    expect(document.title).toBe("Shifting Front");
  });

  it("labels the HUD as an operation instead of a level", () => {
    const campaign = createCampaign(421);
    render(
      <BattlefieldHud
        seed={421}
        levelNumber={1}
        levelCount={campaign.missions.length}
        missionName="System Failure"
        objective="Hold the line"
        profileLabel="Resource Race"
      />,
    );
    expect(screen.getByTestId("level-progress")).toHaveTextContent("Operation 1 of 6");
    expect(screen.getByText("System Failure")).toBeVisible();
    expect(screen.getByTestId("mission-profile")).toHaveTextContent("Resource Race");
  });

  it("surfaces objective urgency with progress and non-color status", () => {
    const campaign = createCampaign(421);
    render(
      <BattlefieldHud
        seed={421}
        levelNumber={1}
        levelCount={campaign.missions.length}
        missionName="Recovery Zone"
        objective="Return the convoy"
        briefingObjectives={[{ id: "win", text: "Contact and return 2 stranded units within 10 min" }]}
        timeRemaining="Time remaining 00:09"
        timeRemainingTicks={9 * 12}
        timeLimitTicks={10 * 60 * 12}
        objectiveCards={[
          { id: "primary", label: "Return the convoy", current: 1, target: 2, status: "active", primary: true },
          { id: "escort", label: "Protect the escort", current: 0, target: 1, status: "active" },
        ]}
        phaseLabel="Extraction phase"
      />,
    );

    expect(screen.getByTestId("time-remaining")).toHaveAttribute("data-urgency", "critical");
    expect(screen.getByTestId("objective")).toHaveAttribute("data-status", "active");
    expect(screen.getByTestId("objective")).toHaveTextContent("Contact and return 2 stranded units within 10 min");
    expect(screen.getByTestId("objective")).toHaveTextContent("1 / 2");
    expect(screen.getByTestId("secondary-objectives")).toHaveTextContent("Bonus objectives 0/1");
    expect(screen.getByTestId("mission-phase")).toHaveTextContent("Extraction phase");
  });

  it("renders the primary progress counter only once in the mission directive", () => {
    const state = makeFixture({ win: { kind: "harvestQuota", target: 2 } });
    render(
      <BattlefieldHud
        seed={421}
        levelNumber={1}
        levelCount={6}
        missionName="Resource Run"
        objective="Extract credits"
        objectiveCards={objectiveCardsFor(state)}
      />,
    );

    const objectiveText = screen.getByTestId("objective").textContent ?? "";
    expect(objectiveText.match(/0 \/ 2/g) ?? []).toHaveLength(1);
    expect(objectiveText).not.toContain("Extracted 0 / 2");
  });

  it("keeps required secondary conditions in the primary objective rail", () => {
    const campaign = createCampaign(421);
    render(
      <BattlefieldHud
        seed={421}
        levelNumber={1}
        levelCount={campaign.missions.length}
        missionName="Recovery Zone"
        objective="Return the convoy"
        objectiveCards={[
          { id: "primary", label: "Return the convoy", current: 0, target: 1, status: "active", primary: true, priority: "primary" },
          { id: "yard", label: "Keep Command HQ standing", current: 1, target: 1, status: "complete", priority: "primary" },
          { id: "survivors", label: "Keep a combat unit alive", current: 0, target: 1, status: "active", priority: "optional" },
        ]}
      />,
    );

    expect(screen.getByTestId("primary-objectives")).toHaveTextContent("Primary objectives 1/1");
    expect(screen.getByTestId("primary-objectives")).toHaveTextContent("Keep Command HQ standing");
    expect(screen.getByTestId("secondary-objectives")).toHaveTextContent("Bonus objectives 0/1");
    expect(screen.getByTestId("secondary-objectives")).toHaveTextContent("Keep a combat unit alive");
  });

  it("starts the mission directive collapsed and keeps its accessible control", () => {
    render(
      <BattlefieldHud
        seed={421}
        levelNumber={1}
        levelCount={6}
        missionName="Recovery Zone"
        objective="Return the convoy"
        timeRemaining="Time remaining 08:00"
        timeRemainingTicks={8 * 60 * 12}
        timeLimitTicks={10 * 60 * 12}
        objectiveCards={[{ id: "primary", label: "Return the convoy", current: 0, target: 1, status: "active", primary: true }]}
      />,
    );

    const expand = screen.getByRole("button", { name: "Expand mission directive" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(expand).toHaveAttribute("data-tooltip", "Expand mission directive");
    expect(document.getElementById("mission-directive-body")).toHaveAttribute("hidden");
    expect(screen.getByTestId("time-remaining")).toHaveAttribute("data-placement", "collapsed");
    expect(screen.getByTestId("time-remaining")).toHaveTextContent("08:00");
    expect(screen.getByTestId("time-remaining").parentElement).toHaveAttribute("data-directive-expanded", "false");

    fireEvent.click(expand);
    const collapse = screen.getByRole("button", { name: "Collapse mission directive" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(collapse).toHaveAttribute("data-tooltip", "Collapse mission directive");
    expect(screen.getByTestId("objective")).toBeVisible();
    expect(screen.getByTestId("time-remaining")).toHaveAttribute("data-placement", "body");

    fireEvent.click(collapse);
    expect(document.getElementById("mission-directive-body")).toHaveAttribute("hidden");
  });

  it("defaults to collapsed on mobile viewports", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("max-width: 1023px") || query.includes("max-height: 600px"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    try {
      render(
        <BattlefieldHud
          seed={421}
          levelNumber={1}
          levelCount={6}
          missionName="Recovery Zone"
          objective="Return the convoy"
          timeRemaining="Time remaining 08:00"
          timeRemainingTicks={8 * 60 * 12}
          timeLimitTicks={10 * 60 * 12}
          objectiveCards={[{ id: "primary", label: "Return the convoy", current: 0, target: 1, status: "active", primary: true }]}
        />,
      );

      const expand = screen.getByRole("button", { name: "Expand mission directive" });
      expect(expand).toHaveAttribute("aria-expanded", "false");
      expect(expand).toHaveAttribute("data-tooltip", "Expand mission directive");
      expect(document.getElementById("mission-directive-body")).toHaveAttribute("hidden");
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("keeps command tabs accessible without rendering shortcut badges", () => {
    render(
      <CommandTabs
        activeTab="construction"
        repairMode={false}
        sellMode={false}
        onConstruction={() => undefined}
        onProduction={() => undefined}
        onSelected={() => undefined}
        onRepair={() => undefined}
        onSell={() => undefined}
      />,
    );

    expect(screen.getByRole("toolbar").querySelectorAll("kbd")).toHaveLength(0);
    expect(screen.getByRole("tab", { name: "Construction" })).not.toHaveTextContent("Construction");
    expect(screen.getByTestId("tab-selected")).toHaveAttribute("aria-keyshortcuts", "t");
    expect(screen.getByTestId("tab-selected")).not.toHaveAttribute("data-shortcut");
  });

  it("uses the generated campaign length in the briefing mast", () => {
    const campaign = createCampaign(421);
    const mission = campaign.missions[0]!;
    const shorterCampaign = { ...campaign, missions: campaign.missions.slice(0, 3) };

    render(<BriefingMast seed={421} mission={0} campaign={shorterCampaign} def={mission} />);

    expect(screen.getByTestId("seed")).toHaveTextContent("Mission 1/3");
  });
});
