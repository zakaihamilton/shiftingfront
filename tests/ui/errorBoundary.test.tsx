// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href} data-testid="home-link">{children}</a>
  ),
}));

let shouldThrow = true;

function MaybeBoom() {
  if (shouldThrow) throw new Error("reactor breach");
  return <p>systems nominal</p>;
}

function renderCrashing(props: { title?: string; eyebrow?: string } = {}) {
  return render(
    <ErrorBoundary {...props}>
      <MaybeBoom />
    </ErrorBoundary>,
  );
}

afterEach(() => {
  shouldThrow = true;
  vi.restoreAllMocks();
  cleanup();
});

describe("ErrorBoundary", () => {
  it("renders children while they are healthy", () => {
    shouldThrow = false;
    render(
      <ErrorBoundary>
        <MaybeBoom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("systems nominal")).toBeInTheDocument();
    expect(screen.queryByTestId("screen-error")).not.toBeInTheDocument();
  });

  it("shows the themed fallback with contextual copy on crash", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderCrashing({ title: "Battlefield offline", eyebrow: "Deployment failed" });
    expect(screen.getByTestId("screen-error")).toBeInTheDocument();
    expect(screen.getByText("Deployment failed")).toBeInTheDocument();
    expect(screen.getByText("Battlefield offline")).toBeInTheDocument();
    expect(screen.getByText("reactor breach")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByTestId("issue-link")).toHaveAttribute(
      "href",
      expect.stringContaining("github.com/zakaihamilton/shiftingfront/issues/new"),
    );
    expect(screen.getByTestId("issue-link")).toHaveAttribute("href", expect.stringContaining("template=crash.md"));
    expect(screen.getByTestId("issue-link")).toHaveAttribute("href", expect.stringContaining("reactor"));
    expect(screen.getByTestId("home-link")).toHaveAttribute("href", "/");
  });

  it("uses generic copy when no title is provided", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderCrashing();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Transmission interrupted")).toBeInTheDocument();
  });

  it("recovers via Try again once the child stops throwing", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderCrashing();
    expect(screen.getByTestId("screen-error")).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("systems nominal")).toBeInTheDocument();
    expect(screen.queryByTestId("screen-error")).not.toBeInTheDocument();
  });

  it("renders a custom fallback instead of the default UI", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<span>custom fallback</span>}>
        <MaybeBoom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("custom fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("screen-error")).not.toBeInTheDocument();
  });
});
