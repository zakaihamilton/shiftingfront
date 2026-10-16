// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConstructionCameos } from "../../components/game/ConstructionCameos";
import { makeFixture } from "../../lib/sim/fixtures";
import { generateVisualProfile } from "../../lib/gen/visualProfile";

vi.mock("../../components/game/SpritePreview", () => ({
  SpritePreview: () => <span data-testid="sprite-preview" />,
}));

afterEach(() => cleanup());

describe("construction cameo compact status", () => {
  it("keeps a concise credit status and the full shortage in its accessible description", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    state.credits[0] = 0;
    render(
      <ConstructionCameos
        state={state}
        palette={state.factions[0].palette}
        profile={generateVisualProfile(state.seed, 0)}
        placeKind={null}
        onPlace={vi.fn()}
        onCancelBuilding={vi.fn()}
      />,
    );

    const power = screen.getByRole("button", { name: /Power Plant/ });
    expect(screen.getByTestId("cameo-status-power")).toHaveTextContent("Need 300 cr");
    expect(power).toHaveAttribute("aria-label", expect.stringContaining("Need 300 more credits"));
    expect(power.parentElement).toHaveAttribute("data-tooltip", expect.stringContaining("Need 300 more credits"));
  });
});
