// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuScreen } from "../../components/menu/MenuScreen";

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/audio/music", () => ({ setMusicEnabled: vi.fn(), clearMusicPosition: vi.fn() }));
vi.mock("@/lib/audio/synth", () => ({ setSfxEnabled: vi.fn(), beep: vi.fn() }));
vi.mock("@/lib/audio/mixer", () => ({ setAudioLevels: vi.fn() }));
vi.mock("@/components/menu/MenuSignalOverlay", () => ({ MenuSignalOverlay: () => null }));

afterEach(() => {
  cleanup();
  router.push.mockClear();
  window.localStorage.clear();
});

describe("menu dialog keyboard navigation", () => {
  it("focuses the code, wraps Tab, and restores the opener without hijacking Enter on Back", () => {
    render(<MenuScreen />);
    const opener = screen.getByRole("button", { name: "NEW GAME" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog");
    const code = within(dialog).getByLabelText("Four digit campaign code");
    expect(code).toHaveFocus();
    expect(opener.closest("[inert]")).not.toBeNull();
    const start = within(dialog).getByRole("button", { name: "Start" });
    start.focus();
    fireEvent.keyDown(start, { key: "Tab" });
    expect(code).toHaveFocus();
    fireEvent.keyDown(code, { key: "Tab", shiftKey: true });
    expect(start).toHaveFocus();

    const back = within(dialog).getByRole("button", { name: "Back" });
    back.focus();
    expect(fireEvent.keyDown(back, { key: "Enter" })).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(back);
    expect(opener).toHaveFocus();
    expect(opener.closest("[inert]")).toBeNull();
  });

  it("moves focus into Options and restores it after Escape", () => {
    render(<MenuScreen />);
    const opener = screen.getByRole("button", { name: "OPTIONS" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Game options" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    const back = within(dialog).getByRole("button", { name: "Back" });
    back.focus();
    fireEvent.keyDown(back, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});
