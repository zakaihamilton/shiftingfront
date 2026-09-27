// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipLayer } from "../../components/TooltipLayer";
import { CommandCameo } from "../../components/game/CommandCameo";
import type { FactionVisualProfile, Palette } from "../../lib/types";

vi.mock("../../components/game/SpritePreview", () => ({
  SpritePreview: () => <span data-testid="sprite-preview" />,
}));

const palette: Palette = {
  primary: "#4a7",
  secondary: "#253",
  accent: "#fd0",
  outline: "#111",
  light: "#8c8",
  dark: "#131",
};

const profile: FactionVisualProfile = {
  designFamily: 0,
  material: "brushed",
  trimPattern: 0,
  insignia: 0,
  weathering: 0,
  lightRig: "cyan",
};

afterEach(() => cleanup());

function CameoWithTooltip({ disabled = false }: { disabled?: boolean }) {
  return (
    <>
      <CommandCameo
        kind="factory"
        palette={palette}
        profile={profile}
        cost={800}
        disabled={disabled}
        disabledReason={disabled ? "Need 300 more credits" : undefined}
        cameo={{ ratio: 0, queued: 0, phase: "idle" }}
        onClick={vi.fn()}
      />
      <TooltipLayer />
    </>
  );
}

describe("command cameo labels", () => {
  it("keeps the complete name visible, accessible, and in the card tooltip", () => {
    render(<CameoWithTooltip disabled />);

    const button = screen.getByRole("button", { name: /Vehicle Plant, 800 credits/ });
    expect(screen.getByTestId("cameo-label-factory")).toHaveTextContent("Vehicle Plant");
    expect(button).toHaveAttribute("aria-label", expect.stringContaining("Vehicle Plant"));
    expect(button.parentElement).toHaveAttribute("data-tooltip", expect.stringContaining("Vehicle Plant"));
    expect(button.parentElement).toHaveAttribute("data-tooltip", expect.stringContaining("Need 300 more credits"));
  });

  it("shows full card details on hover, including for disabled cards", async () => {
    const user = userEvent.setup();
    render(<CameoWithTooltip disabled />);

    const button = screen.getByRole("button", { name: /Vehicle Plant, 800 credits/ });
    await user.hover(button.parentElement!);

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Vehicle Plant");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Need 300 more credits");
  });

  it("shows full card details when an enabled card receives keyboard focus", async () => {
    const user = userEvent.setup();
    render(<CameoWithTooltip />);

    await user.tab();

    expect(screen.getByRole("button", { name: /Vehicle Plant, 800 credits/ })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Vehicle Plant");
  });
});
