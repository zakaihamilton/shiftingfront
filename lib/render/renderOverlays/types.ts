import type { FxBurst } from "../fx";
import type { BuildingKind } from "../../types";
import type { ColorblindMode } from "../../persist/settings";

export type CommandMarkerKind = "move" | "attack" | "harvest" | "support" | "invalid";

export type CommandMarker = {
  x: number;
  y: number;
  bornMs: number;
  expiresMs?: number;
  kind?: CommandMarkerKind;
  mode?: "attack" | "attackMove";
  unitIds?: number[];
  targetId?: number;
};

export type RenderExtras = {
  cursor?: { x: number; y: number } | null;
  placeKind?: BuildingKind | null;
  repairMode?: boolean;
  sellMode?: boolean;
  clockMs?: number;
  selectBox?: { x0: number; y0: number; x1: number; y1: number } | null;
  fx?: FxBurst[];
  commandMarker?: CommandMarker | null;
  subTickAlpha?: number;
  reducedMotion?: boolean;
  render3dUnits?: boolean;
  colorblindMode?: ColorblindMode;
};
