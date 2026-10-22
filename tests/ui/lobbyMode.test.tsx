// @vitest-environment jsdom

import { useEffect, useRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MultiplayerSession } from "../../lib/multiplayer/session";
import { useLobbyMode, type LobbyEscapeHandlers } from "../../components/multiplayer/lobby/useLobbyMode";

function Probe({
  session,
  calls,
}: {
  session: MultiplayerSession | null;
  calls: { backToMenu: () => void; cancelJoin: () => void; endCurrentMatch: () => void };
}) {
  const escapeRef = useRef<LobbyEscapeHandlers>({
    mode: "choose",
    session: null,
    backToMenu: () => undefined,
    backToChoose: () => undefined,
    cancelJoin: () => undefined,
    endCurrentMatch: () => undefined,
  });
  const lobby = useLobbyMode(escapeRef);
  useEffect(() => {
    escapeRef.current = {
      mode: lobby.mode,
      session,
      backToMenu: calls.backToMenu,
      backToChoose: lobby.backToChoose,
      cancelJoin: calls.cancelJoin,
      endCurrentMatch: calls.endCurrentMatch,
    };
  }, [calls, lobby.backToChoose, lobby.mode, session]);
  return (
    <>
      <span data-testid="mode">{lobby.mode}</span>
      <button type="button" onClick={lobby.showHostSetup}>Host setup</button>
      <button type="button" onClick={() => lobby.setMode("joining")}>Joining</button>
      <button type="button" onClick={() => lobby.setMode("waiting")}>Waiting</button>
      <button type="button" onClick={lobby.enterBattle}>Battle</button>
    </>
  );
}

function pressEscape() {
  fireEvent.keyDown(window, { key: "Escape" });
}

afterEach(() => cleanup());

describe("useLobbyMode", () => {
  it("routes Escape through choose, host setup, joining, and the other modes", () => {
    const calls = { backToMenu: vi.fn(), cancelJoin: vi.fn(), endCurrentMatch: vi.fn() };
    render(<Probe session={null} calls={calls} />);

    pressEscape();
    expect(calls.backToMenu).toHaveBeenCalledOnce();
    expect(calls.cancelJoin).not.toHaveBeenCalled();
    expect(calls.endCurrentMatch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Host setup" }));
    expect(screen.getByTestId("mode")).toHaveTextContent("hostSetup");
    pressEscape();
    expect(screen.getByTestId("mode")).toHaveTextContent("choose");
    expect(calls.backToMenu).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Joining" }));
    pressEscape();
    expect(calls.cancelJoin).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Waiting" }));
    pressEscape();
    expect(calls.endCurrentMatch).toHaveBeenCalledOnce();
  });

  it("ignores Escape during a live battle and ends a disconnected one", () => {
    const calls = { backToMenu: vi.fn(), cancelJoin: vi.fn(), endCurrentMatch: vi.fn() };
    const { rerender } = render(<Probe session={{ status: "connected" } as MultiplayerSession} calls={calls} />);
    fireEvent.click(screen.getByRole("button", { name: "Battle" }));
    expect(screen.getByTestId("mode")).toHaveTextContent("battle");
    pressEscape();
    expect(calls.endCurrentMatch).not.toHaveBeenCalled();

    rerender(<Probe session={{ status: "disconnected" } as MultiplayerSession} calls={calls} />);
    pressEscape();
    expect(calls.endCurrentMatch).toHaveBeenCalledOnce();
  });
});
