// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipLayer } from "../../components/TooltipLayer";

afterEach(() => cleanup());

function TooltipPage({ showTarget, tooltipText = "Open the next page" }: { showTarget: boolean; tooltipText?: string }) {
  return (
    <>
      {showTarget ? <button data-tooltip={tooltipText}>Open</button> : null}
      <TooltipLayer />
    </>
  );
}

describe("tooltip layer", () => {
  it("hides the active tooltip when navigation removes its page target", async () => {
    const { rerender } = render(<TooltipPage showTarget />);
    const target = screen.getByRole("button", { name: "Open" });
    fireEvent.pointerOver(target);

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Open the next page");

    rerender(<TooltipPage showTarget={false} />);

    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("keeps explicit line breaks in tooltip text", async () => {
    render(<TooltipPage showTarget tooltipText={"Open the next page\nUse the arrow keys to continue"} />);
    fireEvent.pointerOver(screen.getByRole("button", { name: "Open" }));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent?.split("\n")).toEqual([
      "Open the next page",
      "Use the arrow keys to continue",
    ]);
  });

  it("dismisses the active tooltip when pointer interaction begins", async () => {
    render(<TooltipPage showTarget />);
    const target = screen.getByRole("button", { name: "Open" });
    fireEvent.pointerOver(target);
    expect(await screen.findByRole("tooltip")).toBeVisible();

    fireEvent.pointerDown(target);

    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
