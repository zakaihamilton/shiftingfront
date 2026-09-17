// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { CommandNotice } from "../../components/game/CommandNotice";

afterEach(() => cleanup());

describe("command notices", () => {
  it("renders SVG icons for every notification kind", () => {
    const { rerender } = render(<CommandNotice notice={{ kind: "success", text: "Done" }} />);

    for (const kind of ["success", "info", "warning", "error"] as const) {
      rerender(<CommandNotice notice={{ kind, text: "Notice" }} />);
      const notice = screen.getByTestId("command-notice");
      expect(notice.querySelector("svg")).toBeInTheDocument();
      expect(notice.textContent).not.toMatch(/[✓×!·]/);
    }
  });
});
