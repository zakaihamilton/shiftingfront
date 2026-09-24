// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConsoleButton } from "../../components/ui/ConsoleButton";

afterEach(() => cleanup());

describe("Box Model, Padding, and Ergonomics Invariants", () => {
  it("enforces WCAG 2.5.5 minimum touch target (>= 44px) for ConsoleButton", () => {
    const css = readFileSync(resolve(process.cwd(), "components/ui/ConsoleButton.module.css"), "utf-8");

    // Standard desktop min-height: 2.75rem (44px at 16px root font)
    expect(css).toMatch(/min-height:\s*2\.75rem;/);

    // Explicit 44px minimum height enforced on mobile viewports (< 800px)
    expect(css).toMatch(/@media\s*\(max-width:\s*799px\)\s*\{\s*\.button\s*\{\s*min-height:\s*44px;/);

    // Verify component renders with the button class
    render(<ConsoleButton>DEPLOY</ConsoleButton>);
    const button = screen.getByRole("button", { name: "DEPLOY" });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain("button");
  });

  it("enforces 48px touch target for MobileCommandLauncher button", () => {
    const css = readFileSync(resolve(process.cwd(), "components/game/MobileCommandLauncher.module.css"), "utf-8");

    // Button must be at least 3rem (48px)
    expect(css).toMatch(/width:\s*3rem;/);
    expect(css).toMatch(/min-width:\s*3rem;/);
    expect(css).toMatch(/height:\s*3rem;/);
    expect(css).toMatch(/min-height:\s*3rem;/);
  });

  it("employs min-width: 0 on flex/grid children in ResourceDock and PowerMeter to prevent horizontal overflow", () => {
    const dockCss = readFileSync(resolve(process.cwd(), "components/game/ResourceDock.module.css"), "utf-8");
    const powerCss = readFileSync(resolve(process.cwd(), "components/game/PowerMeter.module.css"), "utf-8");

    // ResourceDock host and power totals must have min-width: 0 to prevent grid blowout
    expect(dockCss).toMatch(/\.host\s*\{[^}]*min-width:\s*0;/);
    expect(dockCss).toMatch(/\.powerTotals\s*\{[^}]*min-width:\s*0;/);
    expect(dockCss).toMatch(/\.powerTotals\s*>\s*span\s*\{[^}]*min-width:\s*0;/);

    // PowerMeter root must specify min-width
    expect(powerCss).toMatch(/min-width:\s*5\.4rem;/);
  });

  it("protects text containers with ellipsis and nowrap against multiline wrapping", () => {
    const dockCss = readFileSync(resolve(process.cwd(), "components/game/ResourceDock.module.css"), "utf-8");

    expect(dockCss).toMatch(/overflow:\s*hidden;/);
    expect(dockCss).toMatch(/text-overflow:\s*ellipsis;/);
    expect(dockCss).toMatch(/white-space:\s*nowrap;/);
  });

  it("incorporates safe-area-inset padding/offsets on mobile floating affordances", () => {
    const launcherCss = readFileSync(resolve(process.cwd(), "components/game/MobileCommandLauncher.module.css"), "utf-8");
    const hintCss = readFileSync(resolve(process.cwd(), "components/game/MobileOrientationHint.module.css"), "utf-8");

    // MobileCommandLauncher stays bottom-centered above the home indicator
    expect(launcherCss).toContain("env(safe-area-inset-bottom)");
    expect(launcherCss).toContain("left: 50%");
    expect(launcherCss).toContain("translateX(-50%)");

    // MobileOrientationHint must respect bottom safe area (home indicator bar)
    expect(hintCss).toContain("env(safe-area-inset-bottom)");
  });

  it("constrains modal dialogs within 90vh with scrollable overflow on mobile landscape", () => {
    const keybindingsCss = readFileSync(resolve(process.cwd(), "components/settings/KeybindingsModal.module.css"), "utf-8");
    const dialogCss = readFileSync(resolve(process.cwd(), "components/game/dialog.module.css"), "utf-8");

    // Dialogs must not exceed viewport height and must allow vertical scrolling
    expect(keybindingsCss).toContain("max-height: 90vh");
    expect(keybindingsCss).toContain("overflow-y: auto");

    // Standard dialog must clamp max-width
    expect(dialogCss).toContain("max-width: min(100%, 38rem)");
  });
});
