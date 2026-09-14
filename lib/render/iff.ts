import type { Owner } from "../types";
import type { ColorblindMode } from "../persist/settings";

/** Matches turret aim lasers and `--chrome-cyan`. */
export const ALLY_IFF_HEX = "#46e2ff";
/** Matches turret aim lasers. */
export const ENEMY_IFF_HEX = "#ff4d36";
/** Scenario neutrals (convoy / stranded) — not hostile. */
export const NEUTRAL_IFF_HEX = "#f5e6a8";

export type IffColors = {
  hex: string;
  laser: string;
  laserFill: string;
  pip: string;
};

const ALLY_IFF: IffColors = {
  hex: ALLY_IFF_HEX,
  laser: "rgba(70, 226, 255, 0.45)",
  laserFill: "rgba(70, 226, 255, 0.28)",
  pip: ALLY_IFF_HEX,
};

const ENEMY_IFF: IffColors = {
  hex: ENEMY_IFF_HEX,
  laser: "rgba(255, 77, 54, 0.45)",
  laserFill: "rgba(255, 77, 54, 0.28)",
  pip: ENEMY_IFF_HEX,
};

const NEUTRAL_IFF: IffColors = {
  hex: NEUTRAL_IFF_HEX,
  laser: "rgba(245, 230, 168, 0.45)",
  laserFill: "rgba(245, 230, 168, 0.28)",
  pip: NEUTRAL_IFF_HEX,
};

const DEUTERANOPIA_ALLY: IffColors = {
  hex: "#38bdf8",
  laser: "rgba(56, 189, 248, 0.45)",
  laserFill: "rgba(56, 189, 248, 0.28)",
  pip: "#38bdf8",
};

const DEUTERANOPIA_ENEMY: IffColors = {
  hex: "#fb923c",
  laser: "rgba(251, 146, 60, 0.45)",
  laserFill: "rgba(251, 146, 60, 0.28)",
  pip: "#fb923c",
};

const TRITANOPIA_ALLY: IffColors = {
  hex: "#14b8a6",
  laser: "rgba(20, 184, 166, 0.45)",
  laserFill: "rgba(20, 184, 166, 0.28)",
  pip: "#14b8a6",
};

const TRITANOPIA_ENEMY: IffColors = {
  hex: "#f43f5e",
  laser: "rgba(244, 63, 94, 0.45)",
  laserFill: "rgba(244, 63, 94, 0.28)",
  pip: "#f43f5e",
};

const TRITANOPIA_NEUTRAL: IffColors = {
  hex: "#e2e8f0",
  laser: "rgba(226, 232, 240, 0.45)",
  laserFill: "rgba(226, 232, 240, 0.28)",
  pip: "#e2e8f0",
};

export function iffColors(owner: Owner, neutral = false, mode: ColorblindMode = "none"): IffColors {
  if (neutral) {
    return mode === "tritanopia" ? TRITANOPIA_NEUTRAL : NEUTRAL_IFF;
  }
  if (mode === "deuteranopia" || mode === "protanopia") {
    return owner === 0 ? DEUTERANOPIA_ALLY : DEUTERANOPIA_ENEMY;
  }
  if (mode === "tritanopia") {
    return owner === 0 ? TRITANOPIA_ALLY : TRITANOPIA_ENEMY;
  }
  return owner === 0 ? ALLY_IFF : ENEMY_IFF;
}
