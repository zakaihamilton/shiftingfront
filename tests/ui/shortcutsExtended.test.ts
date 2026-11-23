import { describe, expect, it } from "vitest";
import {
  assetsCommandFromKey,
  briefingCommandFromKey,
  gameCommandFromKey,
  menuCommandFromKey,
} from "../../lib/ui/shortcuts";

const play = {
  typing: false,
  playing: true,
  paused: false,
  pauseView: "main" as const,
  result: "playing" as const,
  toolActive: false,
};

describe("shortcuts uncovered branches", () => {
  it("uses alt for cameos and bare numbers for control-group recall", () => {
    expect(gameCommandFromKey({ key: "q", altKey: true }, play)).toBeNull();
    expect(gameCommandFromKey({ key: "2", altKey: true }, play)).toEqual({
      type: "cameo",
      index: 1,
      cancel: false,
    });
    expect(gameCommandFromKey({ key: "2" }, play)).toEqual({ type: "recallGroup", slot: 2 });
  });

  it("returns null when not playing and not paused", () => {
    expect(gameCommandFromKey({ key: "q" }, { ...play, playing: false })).toBeNull();
  });

  it("ignores ctrl/meta in paused main view", () => {
    const paused = { ...play, paused: true };
    expect(gameCommandFromKey({ key: "s", ctrlKey: true }, paused)).toBeNull();
    expect(gameCommandFromKey({ key: "s", metaKey: true }, paused)).toBeNull();
  });

  it("returns null for unknown keys in pause view", () => {
    const paused = { ...play, paused: true };
    expect(gameCommandFromKey({ key: "z" }, paused)).toBeNull();
  });

  it("returns null for unknown keys in playing state", () => {
    expect(gameCommandFromKey({ key: "z" }, play)).toBeNull();
  });

  it("ignores shift key with cameo events", () => {
    expect(gameCommandFromKey({ key: "2", shiftKey: true }, play)).toBeNull();
  });

  it("leaves higher alt-number slots unused and rejects combined modifiers", () => {
    expect(gameCommandFromKey({ key: "9", altKey: true }, play)).toBeNull();
    expect(gameCommandFromKey({ key: "2", ctrlKey: true, altKey: true }, play)).toBeNull();
  });

  it("ignores ctrl/meta in playing state for non-cameo keys", () => {
    expect(gameCommandFromKey({ key: "q", ctrlKey: true }, play)).toBeNull();
  });

  it("Home key maps to home command", () => {
    expect(gameCommandFromKey({ key: "Home" }, play)).toEqual({ type: "home" });
  });

  it("Spacebar and Space map to center", () => {
    expect(gameCommandFromKey({ key: "Spacebar" }, play)).toEqual({ type: "center" });
    expect(gameCommandFromKey({ key: "Space" }, play)).toEqual({ type: "center" });
  });

  it("result overlay ignores ctrl", () => {
    expect(
      gameCommandFromKey({ key: "Enter", ctrlKey: true }, { ...play, result: "won" }),
    ).toBeNull();
  });

  it("briefing returnToGame space when revealed returns null", () => {
    expect(
      briefingCommandFromKey({ key: " " }, { typing: false, revealed: true, returnToGame: true }),
    ).toBeNull();
  });

  it("briefing returnToGame non-space non-escape returns null", () => {
    expect(
      briefingCommandFromKey({ key: "q" }, { typing: false, revealed: false, returnToGame: true }),
    ).toBeNull();
  });

  it("briefing non-returnToGame with repeat or modified returns null", () => {
    expect(
      briefingCommandFromKey({ key: "Enter", repeat: true }, { typing: false, revealed: false }),
    ).toBeNull();
    expect(
      briefingCommandFromKey({ key: "Enter", ctrlKey: true }, { typing: false, revealed: false }),
    ).toBeNull();
  });

  it("briefing Escape backs out when it was opened from a menu destination", () => {
    expect(briefingCommandFromKey({ key: "Escape" }, { typing: false, revealed: true })).toEqual({
      type: "back",
    });
  });

  it("menuCommandFromKey ignores repeats and modified keys", () => {
    expect(
      menuCommandFromKey({ key: "n", repeat: true }, { typing: false, setupOpen: false }),
    ).toBeNull();
    expect(
      menuCommandFromKey({ key: "n", ctrlKey: true }, { typing: false, setupOpen: false }),
    ).toBeNull();
  });

  it("menuCommandFromKey typing in setup view returns null except Escape", () => {
    expect(menuCommandFromKey({ key: "q" }, { typing: true, setupOpen: true })).toBeNull();
  });

  it("menuCommandFromKey typing in main menu returns null", () => {
    expect(menuCommandFromKey({ key: "n" }, { typing: true, setupOpen: false })).toBeNull();
  });

  it("menuCommandFromKey typing in options returns null", () => {
    expect(
      menuCommandFromKey({ key: "m" }, { typing: true, setupOpen: false, optionsOpen: true }),
    ).toBeNull();
  });

  it("assetsCommandFromKey ignores repeats on non-arrow keys", () => {
    expect(assetsCommandFromKey({ key: "Escape", repeat: true }, { typing: false })).toBeNull();
    expect(assetsCommandFromKey({ key: " ", repeat: true }, { typing: false })).toBeNull();
  });

  it("assetsCommandFromKey returns null for unknown keys", () => {
    expect(assetsCommandFromKey({ key: "q" }, { typing: false })).toBeNull();
  });
});
