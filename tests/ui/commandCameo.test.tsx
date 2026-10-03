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
        statusLabel={disabled ? "Need 300 cr" : undefined}
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
    expect(screen.getByTestId("cameo-status-factory")).toHaveTextContent("Need 300 cr");
    expect(button).toHaveAttribute("aria-label", expect.stringContaining("Vehicle Plant"));
    expect(button).toHaveAttribute("aria-label", expect.stringContaining("Need 300 more credits"));
    expect(button.parentElement).toHaveAttribute("data-tooltip", expect.stringContaining("Vehicle Plant"));
    expect(button.parentElement).toHaveAttribute("data-tooltip", expect.stringContaining("Need 300 more credits"));
  });

  it("keeps a fixed three-row caption for ready and busy states", () => {
    const { rerender } = render(
      <CommandCameo
        kind="factory"
        palette={palette}
        profile={profile}
        cost={800}
        detail="Produces a long amount of power"
        cameo={{ ratio: 0, queued: 0, phase: "idle" }}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId("cameo-status-factory")).toHaveTextContent("Ready");
    expect(screen.getByTestId("cameo-status-factory").parentElement?.children).toHaveLength(3);

    rerender(
      <CommandCameo
        kind="factory"
        palette={palette}
        profile={profile}
        cost={800}
        detail="12s remaining"
        cameo={{ ratio: 0.4, queued: 2, phase: "progress" }}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId("cameo-status-factory")).toHaveTextContent("40% ready");
    expect(screen.getByTestId("cameo-status-factory").parentElement?.children).toHaveLength(3);
  });

  it("shows a compact locked status and keeps the full campaign explanation accessible", () => {
    render(
      <CommandCameo
        kind="strikePlane"
        palette={palette}
        profile={profile}
        cost={650}
        disabled
        disabledReason="Advance the campaign to unlock this unit"
        statusLabel="Locked"
        cameo={{ ratio: 0, queued: 0, phase: "idle" }}
        onClick={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: /Strike Plane, 650 credits/ });
    expect(screen.getByTestId("cameo-status-strikePlane")).toHaveTextContent("Locked");
    expect(button).toHaveAttribute("aria-label", expect.stringContaining("Advance the campaign to unlock this unit"));
  });

  it("shows full card details on hover, including for disabled cards", async () => {
    const user = userEvent.setup();
    render(<CameoWithTooltip disabled />);

    const button = screen.getByRole("button", { name: /Vehicle Plant, 800 credits/ });
    await user.hover(button.parentElement!);

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Vehicle Plant");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Need 300 more credits");
  });

  it("formats cameo tooltip details on separate lines", () => {
    render(
      <CommandCameo
        kind="repairTruck"
        palette={palette}
        profile={profile}
        cost={350}
        detail="Recommended · 2 damaged vehicle units"
        cameo={{ ratio: 0, queued: 0, phase: "idle" }}
        onClick={vi.fn()}
      />,
    );

    const tooltip = screen.getByRole("button", { name: /Repair Truck, 350 credits/ }).parentElement?.getAttribute("data-tooltip");
    expect(tooltip?.split("\n")).toEqual([
      "Repair Truck · 350 credits",
      "light armor · smallArms weapon",
      "Recommended · 2 damaged vehicle units",
    ]);
  });

  it("shows full card details when an enabled card receives keyboard focus", async () => {
    const user = userEvent.setup();
    render(<CameoWithTooltip />);

    await user.tab();

    expect(screen.getByRole("button", { name: /Vehicle Plant, 800 credits/ })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Vehicle Plant");
  });
});
