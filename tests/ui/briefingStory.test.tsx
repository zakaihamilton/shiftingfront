// @vitest-environment jsdom

import { createRef } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCampaign } from "../../lib/gen/campaign";
import { BriefingStory, type RevealedLine } from "../../components/briefing/BriefingStory";

vi.mock("@/components/shared/Face", () => ({
  Face: ({ who, talking, tone }: { who: { name: string }; talking: boolean; tone: string }) => (
    <canvas data-testid="briefing-portrait" data-name={who.name} data-talking={String(talking)} data-tone={tone} />
  ),
}));

vi.mock("../../components/briefing/TypewriterBody", () => ({
  TypewriterBody: ({ visible, live }: { visible: string; live: boolean }) => (
    <p>{visible}{live ? <span>▌</span> : null}</p>
  ),
}));

afterEach(() => cleanup());

describe("BriefingStory", () => {
  it("embeds each speaker portrait and faction in its dialogue entry", () => {
    const campaign = createCampaign(421);
    const lines: RevealedLine[] = [
      { speaker: "advisor", text: "Recon reports movement.", visible: "Recon reports movement.", started: true, complete: true },
      { speaker: "commander", text: "Hold the line.", visible: "Hold the line.", started: true, complete: false },
      { speaker: "enemyLeader", text: "You are surrounded.", visible: "You are surrounded.", started: true, complete: false },
    ];
    const expected = [
      { role: "advisor", who: campaign.characters.advisor, tone: "ally", faction: campaign.factions[0].name },
      { role: "commander", who: campaign.characters.commander, tone: "command", faction: campaign.factions[0].name },
      { role: "enemyLeader", who: campaign.characters.enemyLeader, tone: "enemy", faction: campaign.factions[1].name },
    ];

    render(
      <BriefingStory
        storyRef={createRef<HTMLDivElement>()}
        campaign={campaign}
        lines={lines}
        talking
        speakerRole="commander"
        complete={false}
        onStoryScroll={vi.fn()}
      />,
    );

    const entries = screen.getAllByTestId("briefing-line");
    expect(entries).toHaveLength(expected.length);

    expected.forEach(({ role, who, tone, faction }, index) => {
      const entry = entries[index];
      if (!entry) throw new Error(`Missing dialogue entry ${index}`);
      expect(entry).toHaveAttribute("data-role", role);
      expect(within(entry).getByTestId("briefing-portrait")).toHaveAttribute("data-name", who.name);
      expect(within(entry).getByTestId("briefing-portrait")).toHaveAttribute("data-tone", tone);
      expect(within(entry).getByTestId("briefing-faction")).toHaveTextContent(faction);
    });

    expect(entries[0]).not.toHaveAttribute("data-live");
    expect(entries[1]).toHaveAttribute("data-live", "true");
    expect(entries[2]).not.toHaveAttribute("data-live");
    expect(within(entries[1]!).getByTestId("briefing-portrait")).toHaveAttribute("data-talking", "true");
  });
});
