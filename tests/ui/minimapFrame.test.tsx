// @vitest-environment jsdom

import { createRef, type PointerEventHandler } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MINIMAP_POWER_OFF_MS, MINIMAP_POWER_ON_MS, MinimapFrame } from "../../components/game/MinimapFrame";

function frame(powered: boolean, offlineCause: "radar" | "power" = "radar") {
  const onPointer = (() => undefined) as PointerEventHandler<HTMLCanvasElement>;
  return (
    <MinimapFrame
      canvasRef={createRef()}
      onPointerDown={onPointer}
      onPointerMove={onPointer}
      onPointerUp={onPointer}
      isDragging={false}
      powered={powered}
      offlineCause={offlineCause}
      mapWidth={48}
      mapHeight={48}
    />
  );
}

describe("minimap cathode-ray power", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("collapses and restores the picture when radar power changes", () => {
    const view = render(frame(false));
    expect(screen.getByTestId("minimap-frame")).toHaveAttribute("data-power", "off");
    expect(screen.getByTestId("tactical-radar")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Radar offline")).toBeVisible();

    view.rerender(frame(true));
    expect(screen.getByTestId("minimap-frame")).toHaveAttribute("data-power", "powering-on");
    act(() => { vi.advanceTimersByTime(MINIMAP_POWER_ON_MS); });
    expect(screen.getByTestId("minimap-frame")).toHaveAttribute("data-power", "on");
    expect(screen.getByTestId("tactical-radar")).not.toHaveAttribute("aria-disabled");

    view.rerender(frame(false));
    expect(screen.getByTestId("minimap-frame")).toHaveAttribute("data-power", "powering-off");
    act(() => { vi.advanceTimersByTime(MINIMAP_POWER_OFF_MS); });
    expect(screen.getByTestId("minimap-frame")).toHaveAttribute("data-power", "off");
  });

  it("cuts the picture immediately when motion is reduced", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const view = render(frame(false));
    view.rerender(frame(true));
    expect(screen.getByTestId("minimap-frame")).toHaveAttribute("data-power", "on");
  });

  it("names a power deficit separately from a missing radar", () => {
    const view = render(frame(false, "power"));
    const radar = screen.getByTestId("tactical-radar");
    expect(screen.getByTestId("minimap-frame")).toHaveAttribute("data-offline-cause", "power");
    expect(radar.getAttribute("aria-label")).toMatch(/restore power/i);
    expect(screen.getByText("Low power")).toBeVisible();

    view.rerender(frame(false, "radar"));
    expect(screen.getByTestId("minimap-frame")).toHaveAttribute("data-offline-cause", "radar");
    expect(radar.getAttribute("aria-label")).toMatch(/build a radar/i);
    expect(screen.getByText("Radar offline")).toBeVisible();
  });
});
