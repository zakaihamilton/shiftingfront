// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleButton } from "../../components/ui/ConsoleButton";
import { DialogPortal } from "../../components/ui/DialogPortal";
import { ProgressMeter } from "../../components/ui/ProgressMeter";

afterEach(() => cleanup());

describe("UI Primitives", () => {
  describe("ConsoleButton", () => {
    it("renders with tooltips, shortcuts, and default action flag", () => {
      render(
        <ConsoleButton
          tooltip="Engage hostile forces"
          shortcut="Enter"
          tooltipPos="top"
        >
          Engage
        </ConsoleButton>,
      );

      const button = screen.getByRole("button", { name: "Engage" });
      expect(button).toHaveAttribute("data-tooltip", "Engage hostile forces");
      expect(button).toHaveAttribute("data-shortcut", "Enter");
      expect(button).toHaveAttribute("data-default-action", "true");
      expect(button).toHaveAttribute("data-tooltip-pos", "top");
    });

    it("applies muted styling class when muted prop is true", () => {
      const { container } = render(<ConsoleButton muted>Standby</ConsoleButton>);
      const button = container.firstChild as HTMLButtonElement;
      expect(button.className).toMatch(/muted/);
    });

    it("handles click events properly", () => {
      const onClick = vi.fn();
      render(<ConsoleButton onClick={onClick}>Fire</ConsoleButton>);

      fireEvent.click(screen.getByRole("button", { name: "Fire" }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("ProgressMeter", () => {
    it("renders percentage and detail string", () => {
      render(
        <ProgressMeter
          label="Armor Integrity"
          ratio={0.75}
          detail="300 / 400"
        />,
      );

      expect(screen.getByText("Armor Integrity")).toBeInTheDocument();
      expect(screen.getByText("75% · 300 / 400")).toBeInTheDocument();
    });

    it("clamps ratio safely between 0% and 100%", () => {
      const { rerender } = render(
        <ProgressMeter label="Overcharged" ratio={1.4} />,
      );
      expect(screen.getByText("100%")).toBeInTheDocument();

      rerender(<ProgressMeter label="Depleted" ratio={-0.3} />);
      expect(screen.getByText("0%")).toBeInTheDocument();
    });
  });

  describe("DialogPortal", () => {
    it("portals children to [data-hud-scale] container when available to preserve HUD scaling", () => {
      const hudContainer = document.createElement("div");
      hudContainer.setAttribute("data-hud-scale", "large");
      document.body.appendChild(hudContainer);

      try {
        render(
          <DialogPortal>
            <div data-testid="portaled-dialog">Tactical Alert</div>
          </DialogPortal>,
        );

        const dialog = screen.getByTestId("portaled-dialog");
        expect(hudContainer.contains(dialog)).toBe(true);
      } finally {
        document.body.removeChild(hudContainer);
      }
    });

    it("falls back to document.body when [data-hud-scale] is not in DOM", () => {
      render(
        <DialogPortal>
          <div data-testid="fallback-dialog">System Notification</div>
        </DialogPortal>,
      );

      const dialog = screen.getByTestId("fallback-dialog");
      expect(document.body.contains(dialog)).toBe(true);
    });
  });
});
