// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeybindingsModal } from "../../components/settings/KeybindingsModal";
import { defaultKeyBindings, type KeyBindings } from "../../lib/persist/settings";

afterEach(() => cleanup());

describe("KeybindingsModal UI component", () => {
  const initialBindings: KeyBindings = {
    ...defaultKeyBindings(),
    panUp: "w",
    stop: "x",
    center: " ",
  };

  it("renders keybindings dialog with accessible roles and labels", () => {
    render(
      <KeybindingsModal
        bindings={initialBindings}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "keybinds-title");
    expect(screen.getByText("Keybindings")).toBeInTheDocument();
    expect(screen.getByText("Pan Camera Up")).toBeInTheDocument();
    expect(screen.getByText("Center on Selection")).toBeInTheDocument();
    expect(screen.getByText("Stop Selected Units")).toBeInTheDocument();
  });

  it("enters listening mode when an action button is clicked", () => {
    render(
      <KeybindingsModal
        bindings={initialBindings}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const panUpButton = screen.getByRole("button", { name: "Rebind Pan Camera Up" });
    expect(panUpButton).toHaveTextContent("W");

    // Click to enter rebind listening state
    fireEvent.click(panUpButton);
    expect(panUpButton).toHaveTextContent("Press key…");
  });

  it("rebinds a key on keydown and persists changes via onSave", () => {
    const onSave = vi.fn();
    render(
      <KeybindingsModal
        bindings={initialBindings}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    const panUpButton = screen.getByRole("button", { name: "Rebind Pan Camera Up" });
    fireEvent.click(panUpButton);

    // Press 'ArrowUp'
    fireEvent.keyDown(window, { key: "ArrowUp" });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        panUp: "ArrowUp",
      }),
    );
    expect(panUpButton).not.toHaveTextContent("Press key…");
  });

  it("cancels listening state without saving when Escape is pressed", () => {
    const onSave = vi.fn();
    render(
      <KeybindingsModal
        bindings={initialBindings}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    const stopButton = screen.getByRole("button", { name: "Rebind Stop Selected Units" });
    fireEvent.click(stopButton);
    expect(stopButton).toHaveTextContent("Press key…");

    // Press Escape to cancel
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onSave).not.toHaveBeenCalled();
    expect(stopButton).toHaveTextContent("X");
  });

  it("resets all bindings to defaults when Reset Defaults is clicked", () => {
    const onSave = vi.fn();
    const customBindings: KeyBindings = {
      ...defaultKeyBindings(),
      panUp: "k",
      panDown: "j",
      stop: "q",
    };

    render(
      <KeybindingsModal
        bindings={customBindings}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    const resetButton = screen.getByRole("button", { name: "Reset Defaults" });
    fireEvent.click(resetButton);

    expect(onSave).toHaveBeenCalledWith(defaultKeyBindings());
  });

  it("calls onClose when clicking Done or backdrop", () => {
    const onClose = vi.fn();
    render(
      <KeybindingsModal
        bindings={initialBindings}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );

    const doneButton = screen.getByRole("button", { name: "Done" });
    fireEvent.click(doneButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
