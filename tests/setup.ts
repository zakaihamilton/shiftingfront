import { beforeEach, vi } from "vitest";
import { resetFxTileIndex } from "../lib/render/terrainWeather";
import { clearTurretRasterCache } from "../lib/render/gl/turretRaster";
import { invalidateMinimap } from "../lib/render/minimap";
import { resetPerfHudFlag } from "../lib/render/perfHud";
import { clearSpriteCache } from "../lib/render/sprites";
import { clearVisualProfileCache } from "../lib/gen/visualProfile";

// Persistence tests intentionally feed corrupted envelopes to the readers;
// keep their [persist] debug diagnostics out of test output.
vi.spyOn(console, "debug").mockImplementation(() => {});

beforeEach(() => {
  resetFxTileIndex();
  clearTurretRasterCache();
  invalidateMinimap();
  resetPerfHudFlag();
  clearSpriteCache();
  clearVisualProfileCache();
});
