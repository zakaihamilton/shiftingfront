// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileOrientationHint } from "../../components/game/MobileOrientationHint";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("MobileOrientationHint component", () => {
  it("renders when the viewport matches narrow portrait orientation", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("orientation: portrait") && query.includes("max-width: 600px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<MobileOrientationHint />);
    expect(screen.getByTestId("orientation-hint")).toBeInTheDocument();
    expect(screen.getByText("Rotate For Tactical View")).toBeInTheDocument();
  });

  it("does not render when viewport is landscape", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<MobileOrientationHint />);
    expect(screen.queryByTestId("orientation-hint")).not.toBeInTheDocument();
  });

  it("dismisses and stores dismissal state in sessionStorage", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("orientation: portrait") && query.includes("max-width: 600px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { rerender } = render(<MobileOrientationHint />);
    const dismissButton = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.click(dismissButton);

    expect(screen.queryByTestId("orientation-hint")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("shiftingfront:orientation-dismissed")).toBe("1");

    // Re-rendering honors session dismissal
    rerender(<MobileOrientationHint />);
    expect(screen.queryByTestId("orientation-hint")).not.toBeInTheDocument();
  });
});
