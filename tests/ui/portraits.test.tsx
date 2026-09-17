// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortraitGallery } from "../../components/portraits/PortraitGallery";

vi.mock("@/components/portraits/FaceCanvas", () => ({
  FaceCanvas: () => <div data-testid="mock-face-canvas" />,
}));

vi.mock("@/components/portraits/useFacePortrait", () => ({
  useFacePortrait: () => ({
    offsetsRef: { current: { blink: { dx: 0, dy: 0 }, talk: { dx: 0, dy: 0 } } },
    mouthClipRef: { current: { cx: 0.5, cy: 0.635, rx: 0.18, ry: 0.09 } },
  }),
}));

afterEach(() => cleanup());

describe("PortraitGallery", () => {
  it("toggles a commander when its portrait is clicked", () => {
    render(<PortraitGallery />);

    const portrait = screen.getByTestId("portrait-canvas-toggle-commander-01");
    expect(portrait).toHaveAttribute("aria-pressed", "false");
    expect(portrait).toHaveAccessibleName("Make commander-01 talk");

    fireEvent.click(portrait);

    expect(portrait).toHaveAttribute("aria-pressed", "true");
    expect(portrait).toHaveAccessibleName("Set commander-01 idle");
    expect(screen.getByTestId("portrait-toggle-commander-01")).toHaveTextContent("Set idle");
  });
});
