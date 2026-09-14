// @vitest-environment jsdom

import { cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TacticalRoster, rosterEntities } from "../../components/game/TacticalRoster";
import { useGameActions } from "../../components/game/hooks/useGameActions";
import type { GameActions } from "../../components/game/hooks/useGameActions";
import type { GameCamera } from "../../components/game/hooks/useGameCamera";
import { fogIndex } from "../../lib/sim/fog";
import { addUnit, makeFixture } from "../../lib/sim/fixtures";
import type { Command } from "../../lib/types";

vi.mock("../../lib/audio/synth", () => ({ beep: vi.fn() }));

afterEach(() => cleanup());

function testActions() {
  return {
    issueSelectedCommand: vi.fn(),
    issueCoordinateCommand: vi.fn(() => true),
    issueTargetCommand: vi.fn(() => true),
  } as unknown as GameActions;
}

function testCamera() {
  return { centerSelection: vi.fn() } as unknown as GameCamera;
}

describe("tactical roster", () => {
  it("keeps friendly entities available while filtering enemies through fog", () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const friendly = addUnit(state, 0, "infantry", 1, 1);
    const enemy = addUnit(state, 1, "tank", 10, 10);
    state.fog.fill(0);
    const visible = fogIndex(state, friendly.x, friendly.y);
    if (visible !== null) state.fog[visible] = 2;

    expect(rosterEntities(state).map((entity) => entity.id)).toContain(friendly.id);
    expect(rosterEntities(state).map((entity) => entity.id)).not.toContain(enemy.id);
  });

  it("selects rows and routes coordinate and target commands through existing APIs", () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const friendly = addUnit(state, 0, "infantry", 1, 1);
    const enemy = addUnit(state, 1, "tank", 3, 3);
    const actions = testActions();
    const camera = testCamera();
    const onSelect = vi.fn();
    render(
      <TacticalRoster
        state={state}
        selectedIds={[friendly.id]}
        actions={actions}
        camera={camera}
        announcement=""
        onSelect={onSelect}
        onAnnounce={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Select Infantry/ }));
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    fireEvent.click(screen.getByRole("button", { name: "Attack" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Center" })[0]!);

    expect(onSelect).toHaveBeenCalledWith([friendly.id]);
    expect(actions.issueCoordinateCommand).toHaveBeenCalledWith("move", 1, 1);
    expect(actions.issueTargetCommand).toHaveBeenCalledWith("attack", enemy.id);
    expect(camera.centerSelection).toHaveBeenCalled();
    expect(screen.getByTestId("tactical-roster")).toHaveTextContent("Position 1, 1");
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveAttribute("data-owner", "0");
    expect(rows[1]).toHaveAttribute("data-owner", "1");
  });

  it("rejects commands when the selected unit type is ineligible", () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const harvester = addUnit(state, 0, "harvester", 1, 1);
    const enemy = addUnit(state, 1, "tank", 3, 3);
    const commandQueue = { current: [] as Command[] };
    const selected = { current: new Set([harvester.id]) };
    const { result } = renderHook(() => useGameActions({
      stateRef: { current: state },
      cmdQ: commandQueue,
      selected,
      selectedIds: [harvester.id],
    }));

    expect(result.current.issueTargetCommand("attack", enemy.id)).toBe(false);
    expect(result.current.issueCoordinateCommand("attackMove", 2, 2)).toBe(false);
    expect(result.current.issueCoordinateCommand("harvest", 2, 2)).toBe(false);
    expect(commandQueue.current).toHaveLength(0);
  });

  it("shows discovered stranded units without offering selection", () => {
    const state = makeFixture({ seed: 421, win: { kind: "rescue", targetCount: 1, ticks: 100 } });
    const stranded = addUnit(state, 0, "infantry", 3, 3);
    stranded.neutral = false;
    stranded.scenarioRole = "stranded";

    render(
      <TacticalRoster
        state={state}
        selectedIds={[]}
        actions={testActions()}
        camera={testCamera()}
        announcement=""
        onSelect={vi.fn()}
        onAnnounce={vi.fn()}
      />,
    );

    const row = screen.getByText(/Role Stranded/).closest('[role="listitem"]');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByRole("button", { name: /Select Infantry/ })).not.toBeInTheDocument();
    expect(within(row as HTMLElement).getByRole("button", { name: "Center" })).toBeInTheDocument();
  });

  it("prioritizes the mission result in the live region", () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    state.result = "won";
    render(
      <TacticalRoster
        state={state}
        selectedIds={[]}
        actions={testActions()}
        camera={testCamera()}
        announcement="A previous combat alert"
        onSelect={vi.fn()}
        onAnnounce={vi.fn()}
      />,
    );
    expect(screen.getByText("Mission complete.")).toBeVisible();
  });

  it("announces a readable mission-loss reason in the live region", () => {
    const state = makeFixture({ seed: 421, win: { kind: "extraction", targetCount: 2, ticks: 100 } });
    state.result = "lost";
    state.lossReason = "objectiveTargetLost";
    render(
      <TacticalRoster
        state={state}
        selectedIds={[]}
        actions={testActions()}
        camera={testCamera()}
        announcement="A previous combat alert"
        onSelect={vi.fn()}
        onAnnounce={vi.fn()}
      />,
    );
    expect(screen.getByText("Mission lost: The cargo was lost.")).toBeVisible();
  });
});
