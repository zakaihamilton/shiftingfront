// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductionCameos, productionBlockerText } from "../../components/game/ProductionCameos";
import { addBuilding, makeFixture } from "../../lib/sim/fixtures";
import { generateVisualProfile } from "../../lib/gen/visualProfile";

vi.mock("../../components/game/SpritePreview", () => ({
  SpritePreview: () => <span data-testid="sprite-preview" />,
}));

afterEach(() => cleanup());

describe("production cameo availability", () => {
  it("explains that the required producer must be built", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });

    expect(productionBlockerText(state, "tank", 0, undefined)).toBe("Build a Vehicle Plant");
  });

  it("explains credit and power blockers together", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    addBuilding(state, 0, "factory", 4, 4);
    state.credits[0] = 0;

    const producer = state.entities.find((entity) => entity.kind === "factory");
    expect(productionBlockerText(state, "tank", -1, producer)).toBe("Need 425 more credits · Restore power");
  });

  it("keeps unavailable units visible and puts the next step in the tooltip", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    render(
      <ProductionCameos
        state={state}
        palette={state.factions[0].palette}
        profile={generateVisualProfile(state.seed, 0)}
        power={0}
        availableProducer={() => undefined}
        onQueueUnit={vi.fn()}
        onCancelUnit={vi.fn()}
      />,
    );

    const tank = screen.getByRole("button", { name: /Tank, 425 credits/ });
    expect(tank).toBeDisabled();
    expect(tank.parentElement).toHaveAttribute("data-tooltip", expect.stringContaining("Build a Vehicle Plant"));
    expect(tank.parentElement).toHaveAttribute("data-shortcut", "Alt+4");
    expect(tank).toHaveAttribute("aria-keyshortcuts", "Alt+4");
  });

  it("reserves the training detail row before a unit is queued", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    render(
      <ProductionCameos
        state={state}
        palette={state.factions[0].palette}
        profile={generateVisualProfile(state.seed, 0)}
        power={0}
        availableProducer={() => undefined}
        onQueueUnit={vi.fn()}
        onCancelUnit={vi.fn()}
      />,
    );

    const infantry = screen.getByRole("button", { name: /Infantry, 75 credits/ });
    const detail = infantry.querySelector('[class*="detail"]');

    expect(detail).toBeInTheDocument();
    expect(detail?.textContent).toBe("\u00a0");
  });

  it("shows Option labels for cameo shortcuts on Mac", () => {
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });

    try {
      const state = makeFixture({ win: { kind: "annihilate" } });
      render(
        <ProductionCameos
          state={state}
          palette={state.factions[0].palette}
          profile={generateVisualProfile(state.seed, 0)}
          power={0}
          availableProducer={() => undefined}
          onQueueUnit={vi.fn()}
          onCancelUnit={vi.fn()}
        />,
      );

      const tank = screen.getByRole("button", { name: /Tank, 425 credits/ });
      expect(tank.parentElement).toHaveAttribute("data-shortcut", "Option+4");
      expect(tank).toHaveAttribute("aria-keyshortcuts", "Option+4");
    } finally {
      Object.defineProperty(navigator, "platform", { configurable: true, value: originalPlatform });
    }
  });

  it("explains how to unlock a gated unit", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });

    expect(productionBlockerText(state, "convoyTruck", 0, undefined)).toBe("Advance the campaign to unlock this unit");
    expect(productionBlockerText(state, "medic", 0, undefined)).toBe("Build a Barracks");
    expect(productionBlockerText(state, "repairTruck", 0, undefined)).toBe("Build a Vehicle Plant");
  });
});
