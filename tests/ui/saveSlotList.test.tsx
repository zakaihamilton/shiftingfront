// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  archiveEntryKey,
  archiveEntryLabel,
  SaveSlotList,
} from "../../components/save/SaveSlotList";
import type { ArchiveEntry, SlotMeta } from "../../lib/persist/save";

afterEach(() => cleanup());

const mockSlot: SlotMeta & { kind: "slot" } = {
  kind: "slot",
  id: "slot-alpha",
  name: "Sector Delta Assault",
  seed: "4210",
  missionIndex: 2,
  campaignName: "Iron Dawn",
  missionName: "Sector Delta Assault",
  savedAt: 1711200000000,
  tick: 1800,
  result: "playing",
};

const mockAutosave: ArchiveEntry = {
  kind: "autosave",
  seed: "9942",
  missionIndex: 0,
  campaignName: "Vanguard Protocol",
  missionName: "Operation Alpha",
  savedAt: 1711200500000,
  tick: 360,
  result: "playing",
};

describe("SaveSlotList UI component", () => {
  it("formats entry keys and readable labels properly", () => {
    expect(archiveEntryKey(mockSlot)).toBe("slot:slot-alpha");
    expect(archiveEntryKey(mockAutosave)).toBe("autosave:9942");

    expect(archiveEntryLabel(mockSlot)).toContain("Sector Delta Assault");
    expect(archiveEntryLabel(mockSlot)).toContain("Iron Dawn");
    expect(archiveEntryLabel(mockSlot)).toContain("Mission 3");

    expect(archiveEntryLabel(mockAutosave)).toContain("AUTOSAVE");
    expect(archiveEntryLabel(mockAutosave)).toContain("Vanguard Protocol");
  });

  it("renders empty state when no archive entries exist", () => {
    render(<SaveSlotList entries={[]} emptyLabel="No saved operations found." />);
    expect(screen.getByText("No saved operations found.")).toBeInTheDocument();
  });

  it("renders slot entries and triggers onSelect and onResume", () => {
    const onSelect = vi.fn();
    const onResume = vi.fn();

    render(
      <SaveSlotList
        entries={[mockSlot, mockAutosave]}
        showActions
        onSelect={onSelect}
        onResume={onResume}
      />,
    );

    expect(screen.getByText("Sector Delta Assault")).toBeInTheDocument();
    expect(screen.getByText("Autosave")).toBeInTheDocument();

    const resumeSlotButton = screen.getByRole("button", { name: "Resume Sector Delta Assault" });
    fireEvent.click(resumeSlotButton);
    expect(onSelect).toHaveBeenCalledWith(mockSlot);
    expect(onResume).toHaveBeenCalledWith(mockSlot);
  });

  it("handles the delete confirmation modal flow safely", () => {
    const onDelete = vi.fn();

    render(
      <SaveSlotList
        entries={[mockSlot]}
        showActions
        onDelete={onDelete}
      />,
    );

    // Delete confirmation dialog is not open initially
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Click initial delete button
    const deleteButton = screen.getByRole("button", { name: `Delete save slot ${mockSlot.name}` });
    fireEvent.click(deleteButton);

    // Delete dialog opens
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/This save slot cannot be recovered/)).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    // Cancel dismisses without deleting
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    // Reopen and confirm deletion
    fireEvent.click(screen.getByRole("button", { name: `Delete save slot ${mockSlot.name}` }));
    const confirmButtons = screen.getAllByRole("button", { name: "Delete save slot" });
    // The confirm button inside the dialog
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    expect(onDelete).toHaveBeenCalledWith(mockSlot);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dismisses delete dialog on Escape keypress", () => {
    render(
      <SaveSlotList
        entries={[mockSlot]}
        showActions
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: `Delete save slot ${mockSlot.name}` }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
