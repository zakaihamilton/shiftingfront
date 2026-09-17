// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { CombatAlert } from "../../components/game/CombatAlert";

afterEach(() => cleanup());

describe("combat alerts", () => {
  it("renders SVG icons for every upper notification kind", () => {
    const { rerender } = render(<CombatAlert kind="warning" text="Warning" />);

    for (const kind of ["warning", "objective", "contact", "system"] as const) {
      rerender(<CombatAlert kind={kind} text="Alert" />);
      const alert = screen.getByTestId("combat-alert");
      expect(alert.querySelector("svg")).toBeInTheDocument();
      expect(alert.textContent).not.toMatch(/[◆⌁▣!]/);
    }
  });
});
