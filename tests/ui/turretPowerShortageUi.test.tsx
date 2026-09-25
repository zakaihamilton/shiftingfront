// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { SelectionPanel } from "../../components/game/SelectionPanel";
import { addBuilding, makeFixture } from "../../lib/sim/fixtures";
import { generateVisualProfile } from "../../lib/gen/visualProfile";
import type { Palette } from "../../lib/types";

const palette: Palette = {
  primary: "#4a7",
  secondary: "#253",
  accent: "#fd0",
  outline: "#111",
  light: "#8c8",
  dark: "#131",
};
const profile = generateVisualProfile(0, 0);

describe("SelectionPanel Turret Power Shortage UI", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders power shortage warning badge when a defensive turret is selected during a power deficit", () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const turret = addBuilding(state, 0, "turret", 4, 4);
    turret.constructing = 0;

    render(
      <SelectionPanel
        selected={turret}
        selectionCount={1}
        palette={palette}
        profile={profile}
        power={-8}
      />,
    );

    const badge = screen.getByTestId("turret-power-shortage");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("⚡ Low Power: 50% Fire Rate · -25% Range");
  });

  it("renders power shortage warning badge for anti-air turrets during a power deficit", () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const aaTurret = addBuilding(state, 0, "antiAirTurret", 4, 4);
    aaTurret.constructing = 0;

    render(
      <SelectionPanel
        selected={aaTurret}
        selectionCount={1}
        palette={palette}
        profile={profile}
        power={-8}
      />,
    );

    const badge = screen.getByTestId("turret-power-shortage");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("⚡ Low Power: 50% Fire Rate · -25% Range");
  });

  it("does not render power shortage badge when power is zero or positive", () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const turret = addBuilding(state, 0, "turret", 4, 4);
    turret.constructing = 0;

    const { rerender } = render(
      <SelectionPanel
        selected={turret}
        selectionCount={1}
        palette={palette}
        profile={profile}
        power={0}
      />,
    );

    expect(screen.queryByTestId("turret-power-shortage")).toBeNull();

    rerender(
      <SelectionPanel
        selected={turret}
        selectionCount={1}
        palette={palette}
        profile={profile}
        power={15}
      />,
    );

    expect(screen.queryByTestId("turret-power-shortage")).toBeNull();
  });

  it("does not render power shortage badge for non-defense buildings even during power deficit", () => {
    const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    const factory = addBuilding(state, 0, "factory", 4, 4);
    factory.constructing = 0;

    render(
      <SelectionPanel
        selected={factory}
        selectionCount={1}
        palette={palette}
        profile={profile}
        power={-12}
      />,
    );

    expect(screen.queryByTestId("turret-power-shortage")).toBeNull();
  });
});
