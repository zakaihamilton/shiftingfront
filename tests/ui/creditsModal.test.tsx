// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreditsModal } from "../../components/menu/CreditsModal";
import { APP_ISSUES_URL, APP_REPO_URL, APP_VERSION } from "../../lib/site";

afterEach(() => {
  cleanup();
});

describe("CreditsModal", () => {
  it("renders credits, attributions, and version info", () => {
    const onBack = vi.fn();
    render(<CreditsModal onBack={onBack} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Credits & Attributions")).toBeInTheDocument();
    expect(screen.getByText("Zakai Hamilton")).toBeInTheDocument();
    expect(screen.getByText(`Version ${APP_VERSION}`)).toBeInTheDocument();

    const repoLink = screen.getByRole("link", { name: "GitHub Repository" });
    expect(repoLink).toHaveAttribute("href", APP_REPO_URL);

    const issuesLink = screen.getByRole("link", { name: "Report an Issue / Feedback" });
    expect(issuesLink).toHaveAttribute("href", APP_ISSUES_URL);
  });

  it("calls onBack when clicking Return to Menu", () => {
    const onBack = vi.fn();
    render(<CreditsModal onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "Return to Menu" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("calls onBack on Escape key", () => {
    const onBack = vi.fn();
    render(<CreditsModal onBack={onBack} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
