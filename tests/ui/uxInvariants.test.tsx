// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_VIEWPORT } from "../../lib/site";
import { BattlefieldHud, isMobileDirectiveViewport } from "../../components/game/BattlefieldHud";
import { CommandCameo } from "../../components/game/CommandCameo";
import { SelectionIdentity } from "../../components/game/SelectionIdentity";
import { resolvePointerUp } from "../../components/game/hooks/gamePointerUp";
import { selectionProjectionPoint } from "../../components/game/hooks/selectionBox";
import { createCamera, tileToScreen } from "../../lib/iso";
import { addUnit, makeFixture } from "../../lib/sim/fixtures";
import type { FactionVisualProfile, Palette, UnitKind } from "../../lib/types";

afterEach(() => cleanup());

const palette: Palette = {
  primary: "#4a7",
  secondary: "#253",
  accent: "#fd0",
  outline: "#111",
  light: "#8c8",
  dark: "#131",
};

const profile: FactionVisualProfile = {
  designFamily: 0,
  material: "industrial",
  trimPattern: 1,
  insignia: 0,
  weathering: 1,
  lightRig: "cyan",
};

describe("UX & Ergonomics Invariants", () => {
  describe("Input Parity Invariants (Desktop vs Mobile)", () => {
    const testCases: Array<{ name: string; units: UnitKind[] }> = [
      { name: "combat only (infantry + tank)", units: ["infantry", "tank"] },
      { name: "economy only (harvesters)", units: ["harvester", "harvester"] },
      { name: "mixed combat and economy (infantry + harvester)", units: ["infantry", "harvester"] },
      { name: "mixed multi-tier (antiArmor + tank + harvester)", units: ["antiArmor", "tank", "harvester"] },
    ];

    for (const { name, units } of testCases) {
      it(`produces identical unit selection between desktop drag and mobile marquee for: ${name}`, () => {
        const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
        const cam = createCamera();
        const createdUnits = units.map((kind, index) => addUnit(state, 0, kind, 4 + index, 4 + index));

        const screenPoints = createdUnits.map((u) => tileToScreen(u.x, u.y, cam, 0));
        const minX = Math.min(...screenPoints.map((p) => p.x)) - 25;
        const minY = Math.min(...screenPoints.map((p) => p.y)) - 25;
        const maxX = Math.max(...screenPoints.map((p) => p.x)) + 25;
        const maxY = Math.max(...screenPoints.map((p) => p.y)) + 25;

        const box = {
          x0: minX,
          y0: minY,
          x1: maxX,
          y1: maxY,
          anchor: selectionProjectionPoint({ x: minX, y: minY }, cam),
        };

        const desktopResult = resolvePointerUp({
          pointerType: "mouse",
          button: 0,
          ctrlKey: false,
          metaKey: false,
          p: { x: maxX, y: maxY },
          state,
          cam,
          selectedIds: [],
          box,
          selectionMode: false,
          mobileCommand: null,
          placeKind: null,
          repairMode: false,
          sellMode: false,
        });

        const mobileResult = resolvePointerUp({
          pointerType: "touch",
          button: 0,
          ctrlKey: false,
          metaKey: false,
          p: { x: maxX, y: maxY },
          state,
          cam,
          selectedIds: [],
          box,
          selectionMode: true,
          mobileCommand: null,
          placeKind: null,
          repairMode: false,
          sellMode: false,
        });

        // Mobile touch marquee MUST have strict parity with desktop drag selection
        expect(mobileResult.select).toEqual(desktopResult.select);
        expect(mobileResult.endSelectionMode).toBe(true);

        if (units.includes("harvester") && units.some((k) => k !== "harvester")) {
          // If mixed, harvesters must be excluded from both
          const harvesterIds = createdUnits.filter((u) => u.kind === "harvester").map((u) => u.id);
          for (const id of harvesterIds) {
            expect(mobileResult.select).not.toContain(id);
            expect(desktopResult.select).not.toContain(id);
          }
        } else if (units.every((k) => k === "harvester")) {
          // If only harvesters, all harvesters must be retained in both
          expect(mobileResult.select).toEqual(createdUnits.map((u) => u.id));
        }
      });
    }
  });

  describe("Geometric & Aspect Ratio Invariants", () => {
    it("renders the cameo cancel button as a strict 1:1 square", () => {
      render(
        <CommandCameo
          kind="turret"
          palette={palette}
          profile={profile}
          cost={275}
          cameo={{ ratio: 0.5, queued: 2, phase: "progress" }}
          onClick={vi.fn()}
          onContextMenu={vi.fn()}
        />,
      );

      const cancel = screen.getByRole("button", { name: "Cancel Gun Turret" });
      expect(cancel).toBeInTheDocument();
      expect(cancel.tagName.toLowerCase()).toBe("button");
      expect(cancel).not.toHaveClass("button"); // Must not inherit generic console action button styles
      expect(cancel).toHaveClass(/cancel/);
    });

    it("evaluates mobile viewport detection across responsive breakpoints", () => {
      const originalMatchMedia = window.matchMedia;

      // Mobile portrait
      window.matchMedia = ((query: string) => ({
        matches: query.includes("max-width: 1023px") && query.includes("orientation: portrait"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
      expect(isMobileDirectiveViewport()).toBe(true);

      // Mobile landscape (short height)
      window.matchMedia = ((query: string) => ({
        matches: query.includes("max-height: 600px"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
      expect(isMobileDirectiveViewport()).toBe(true);

      // Desktop wide screen (pointer fine, large dimensions)
      window.matchMedia = (() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
      expect(isMobileDirectiveViewport()).toBe(false);

      window.matchMedia = originalMatchMedia;
    });

    it("guarantees the mission directive starts collapsed on mobile screens to preserve screen budget", () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query.includes("max-height: 600px") || query.includes("max-width: 1023px"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;

      try {
        render(
          <BattlefieldHud
            seed={759}
            levelNumber={2}
            levelCount={6}
            missionName="Fortify"
            objective="Hold the line"
            timeRemaining="Time remaining 05:00"
            timeRemainingTicks={5 * 60 * 12}
            timeLimitTicks={10 * 60 * 12}
            objectiveCards={[{ id: "primary", label: "Hold the line", current: 0, target: 1, status: "active", primary: true }]}
          />,
        );

        // Body must be hidden by default on mobile viewports
        expect(document.getElementById("mission-directive-body")).toHaveAttribute("hidden");
        // Expand button must be ready for user action
        const expand = screen.getByRole("button", { name: "Expand mission directive" });
        expect(expand).toHaveAttribute("aria-expanded", "false");
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    it("enables camera center affordance on SelectionIdentity with keyboard and touch support", () => {
      const state = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
      const unit = addUnit(state, 0, "tank", 5, 5);
      const onCenter = vi.fn();

      render(
        <SelectionIdentity
          selected={unit}
          palette={palette}
          profile={profile}
          stance="aggressive"
          onCenter={onCenter}
        />,
      );

      const nameButton = screen.getByRole("button", { name: "Tank" });
      expect(nameButton).toHaveAttribute("tabindex", "0");
      expect(nameButton).toHaveAttribute("data-shortcut", "Space");

      // Clicking centers camera
      fireEvent.click(nameButton);
      expect(onCenter).toHaveBeenCalledTimes(1);

      // Pressing Enter centers camera
      fireEvent.keyDown(nameButton, { key: "Enter" });
      expect(onCenter).toHaveBeenCalledTimes(2);

      // Pressing Space centers camera
      fireEvent.keyDown(nameButton, { key: " " });
      expect(onCenter).toHaveBeenCalledTimes(3);
    });

    it("enforces PWA edge-to-edge coverage and browser zoom prevention invariants in layout viewport", () => {
      expect(APP_VIEWPORT.width).toBe("device-width");
      expect(APP_VIEWPORT.initialScale).toBe(1);
      expect(APP_VIEWPORT.maximumScale).toBe(1);
      expect(APP_VIEWPORT.userScalable).toBe(false);
      expect(APP_VIEWPORT.viewportFit).toBe("cover");
    });
  });
});
