import { clearVisualProfileCache } from "../gen/visualProfile";
import { invalidateMinimap } from "./minimap";
import { clearEntityVisibilityCache } from "./renderPicking";
import { clearTurretAimCache } from "./renderStructures/turret";
import { clearTooltipRenderCache } from "./renderOverlays/tooltips";
import { clearTurretRasterCache } from "./gl/turretRaster";
import { resetUnitTransformTracker } from "./gl/unitTransformTracker";
import { clearSpriteCache } from "./sprites";
import { invalidateTerrainAtlas } from "./terrainAtlas";
import { clearTerrainMaterialCache } from "./terrainMaterials";
import { clearTerrainPaintCache } from "./terrainPaint/world";
import { clearTerrainAtmosphereCache } from "./terrainAtmosphere";
import { clearTerrainLightCache } from "./terrainLighting";
import { clearRendererSessionCache } from "./renderer/cache";

let activeRenderSessionLeases = 0;
let deferredCleanup: ReturnType<typeof setTimeout> | null = null;

/** Releases per-mission render state when the browser leaves a game session. */
export function clearRenderSessionCaches(): void {
  clearSpriteCache();
  clearVisualProfileCache();
  clearEntityVisibilityCache();
  clearTurretAimCache();
  clearTurretRasterCache();
  resetUnitTransformTracker();
  clearTerrainMaterialCache();
  clearTerrainPaintCache();
  clearTerrainAtmosphereCache();
  clearTerrainLightCache();
  clearTooltipRenderCache();
  invalidateTerrainAtlas();
  invalidateMinimap();
  clearRendererSessionCache();
}

/** Keeps a strict-mode effect replay from clearing caches for a live session. */
export function acquireRenderSessionCacheLease(): () => void {
  if (deferredCleanup !== null) {
    clearTimeout(deferredCleanup);
    deferredCleanup = null;
  }
  activeRenderSessionLeases += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeRenderSessionLeases = Math.max(0, activeRenderSessionLeases - 1);
    if (activeRenderSessionLeases > 0 || deferredCleanup !== null) return;

    deferredCleanup = setTimeout(() => {
      deferredCleanup = null;
      if (activeRenderSessionLeases === 0) clearRenderSessionCaches();
    }, 0);
  };
}
