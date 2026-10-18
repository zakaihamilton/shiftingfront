// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RULES_REBUILD_NOTICE } from "../../lib/persist/rulesRetirement";
import { SaveRepositoryRoot } from "../../components/shared/SaveRepositoryRoot";

vi.mock("@/lib/persist/save/repository", () => ({
  initializeSaveRepository: vi.fn(async () => ({
    notice: RULES_REBUILD_NOTICE,
    subscribe: () => () => undefined,
  })),
}));

afterEach(() => cleanup());

describe("save repository notice", () => {
  it("lets pointer movement pass through the rules-rebuild banner", async () => {
    const css = readFileSync(resolve(process.cwd(), "components/shared/SaveRepositoryRoot.module.css"), "utf-8");
    expect(css).toMatch(/\.notice\s*\{[^}]*pointer-events:\s*none;/);

    render(
      <SaveRepositoryRoot>
        <button type="button">Continue</button>
      </SaveRepositoryRoot>,
    );

    const notice = await screen.findByTestId("save-repository-notice");
    expect(notice).toHaveTextContent(RULES_REBUILD_NOTICE);
    expect(notice.className).toContain("notice");
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument());
  });
});
