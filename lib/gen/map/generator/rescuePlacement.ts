import type { Vec2 } from "../../../types";
import type { GeneratedMap } from "./types";

// Keep targets on the enemy-side quadrant while placing them away from both
// bases. This gives the operation a real approach without auto-contacting the
// first target from the player's starting formation.
const RESCUE_FLANK_X_RATIO = 0.52;
const RESCUE_FLANK_Y_RATIO = 0.52;

/**
 * Returns the center of the flank that sits offset perpendicularly to the
 * line between the player and enemy bases.
 */
export function rescueFlankCenter(
  map: Pick<GeneratedMap, "width" | "height" | "enemyStart"> & { playerStart?: Vec2 },
): Vec2 {
  if (map.playerStart) {
    const dx = map.enemyStart.x - map.playerStart.x;
    const dy = map.enemyStart.y - map.playerStart.y;
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular vector pointing to the lateral flank
    const perpX = -dy / len;
    const perpY = dx / len;
    // Position biased toward the enemy side of the frontline
    const targetX = map.playerStart.x + dx * 0.55;
    const targetY = map.playerStart.y + dy * 0.55;
    const span = Math.min(map.width, map.height) * 0.22;
    return {
      x: Math.max(4, Math.min(map.width - 5, Math.round(targetX + perpX * span))),
      y: Math.max(4, Math.min(map.height - 5, Math.round(targetY + perpY * span))),
    };
  }

  const enemyOnRight = map.enemyStart.x >= map.width / 2;
  const enemyOnTop = map.enemyStart.y < map.height / 2;
  return {
    x: Math.round(map.width * (enemyOnRight ? RESCUE_FLANK_X_RATIO : 1 - RESCUE_FLANK_X_RATIO)),
    y: Math.round(map.height * (enemyOnTop ? RESCUE_FLANK_Y_RATIO : 1 - RESCUE_FLANK_Y_RATIO)),
  };
}

/** Whether a map cell belongs to the rescue flank region. */
export function inRescueFlank(
  map: Pick<GeneratedMap, "width" | "height" | "enemyStart"> & { playerStart?: Vec2 },
  x: number,
  y: number,
): boolean {
  if (map.playerStart) {
    const flank = rescueFlankCenter(map);
    return Math.hypot(x - flank.x, y - flank.y) <= Math.min(map.width, map.height) * 0.35;
  }

  const enemyOnRight = map.enemyStart.x >= map.width / 2;
  const enemyOnTop = map.enemyStart.y < map.height / 2;
  const onEnemyHorizontalSide = enemyOnRight ? x >= map.width / 2 : x < map.width / 2;
  const onMirroredVerticalSide = enemyOnTop ? y >= map.height / 2 : y < map.height / 2;
  return onEnemyHorizontalSide && onMirroredVerticalSide;
}
