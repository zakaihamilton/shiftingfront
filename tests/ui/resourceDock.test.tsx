// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { CreditsCounter } from "../../components/game/CreditsCounter";
import { PowerMeter } from "../../components/game/PowerMeter";
import { ResourceDock } from "../../components/game/ResourceDock";

afterEach(() => cleanup());

describe("Resource Management UI components", () => {
  describe("CreditsCounter", () => {
    it("renders formatted credits with thousand separators", () => {
      render(<CreditsCounter value={2500} />);
      expect(screen.getByText("2,500")).toBeInTheDocument();
    });

    it("renders zero credits properly", () => {
      render(<CreditsCounter value={0} />);
      expect(screen.getByText("0")).toBeInTheDocument();
    });
  });

  describe("PowerMeter", () => {
    it("displays surplus power with positive sign and healthy status", () => {
      const { container } = render(<PowerMeter produced={150} used={80} />);
      const digits = screen.getByTestId("power");
      expect(digits).toHaveTextContent("+70");

      const meter = container.firstChild as HTMLElement;
      expect(meter).toHaveAttribute(
        "aria-label",
        "Base power surplus: +70, using 80 of 150 power",
      );
      expect(meter.className).not.toMatch(/low/);
      expect(meter.className).not.toMatch(/tight/);
    });

    it("displays deficit power with negative sign and low power warning status", () => {
      const { container } = render(<PowerMeter produced={80} used={120} />);
      const digits = screen.getByTestId("power");
      expect(digits).toHaveTextContent("-40");

      const meter = container.firstChild as HTMLElement;
      expect(meter).toHaveAttribute(
        "aria-label",
        "Power deficit: -40, using 120 of 80 power",
      );
      expect(meter.className).toMatch(/low/);
    });

    it("displays grid near capacity status when usage reaches or exceeds 82%", () => {
      const { container } = render(<PowerMeter produced={100} used={85} />);
      const digits = screen.getByTestId("power");
      expect(digits).toHaveTextContent("+15");

      const meter = container.firstChild as HTMLElement;
      expect(meter).toHaveAttribute(
        "aria-label",
        "Power grid near capacity: +15, using 85 of 100 power",
      );
      expect(meter.className).toMatch(/tight/);
      expect(meter.className).not.toMatch(/low/);
    });

    it("clamps ratio safely when power produced is 0", () => {
      const { container } = render(<PowerMeter produced={0} used={50} />);
      const meter = container.firstChild as HTMLElement;
      expect(meter).toHaveAttribute(
        "aria-label",
        "Power deficit: -50, using 50 of 0 power",
      );
      expect(meter.className).toMatch(/low/);
    });
  });

  describe("ResourceDock", () => {
    it("combines credits and power meter with tooltips and grid load", () => {
      render(
        <ResourceDock
          credits={3400}
          produced={200}
          used={120}
          surplus={80}
        />,
      );

      // Credits display
      expect(screen.getByText("3,400")).toBeInTheDocument();

      // Power meter display
      expect(screen.getByTestId("power")).toHaveTextContent("+80");

      // Power totals readout
      expect(screen.getByLabelText("Power used 120 of 200")).toBeInTheDocument();
      expect(screen.getByText("Grid load")).toBeInTheDocument();
    });

    it("surfaces deficit tooltips when power is in deficit", () => {
      const { container } = render(
        <ResourceDock
          credits={450}
          produced={100}
          used={160}
          surplus={-60}
        />,
      );

      const hosts = container.querySelectorAll("[data-tooltip]");
      expect(hosts[0]).toHaveAttribute("data-tooltip", "Available credits");
      expect(hosts[1]).toHaveAttribute(
        "data-tooltip",
        "Power deficit · Using 160 of 100 power",
      );
    });
  });
});
