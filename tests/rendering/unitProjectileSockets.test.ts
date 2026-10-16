import { expect, it, vi } from "vitest";
import { drawCombatProjectileBursts } from "../../lib/render/combat/projectiles";
import { unitWeaponSockets } from "../../lib/render/unitVehicleLayers";
import { tileToScreen } from "../../lib/iso";
import type { FxBurst } from "../../lib/render/fx";

it("launches from the authored socket and preserves it as the shooter and camera move", () => {
  const cam = { x: 100, y: 50, zoom: 1 };
  const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() } as unknown as CanvasRenderingContext2D;
  const burst: FxBurst = { id: 1, kind: "muzzle", bornMs: 0, durationMs: 500, projectileDurationMs: 500,
    x: 2, y: 2, elev: 0, owner: 0, entityKind: "tank", entityClass: "unit", ammoEffect: "beam",
    sourceEntityId: 99, sourceX: 2, sourceY: 2, targetX: 4, targetY: 3 };
  const source = tileToScreen(2, 2, cam, 0);
  unitWeaponSockets.set(99, { x: source.x + 25, y: source.y - 10 });
  try {
    drawCombatProjectileBursts(ctx, cam, [burst], 0);
    expect(ctx.moveTo).toHaveBeenCalledWith(source.x + 25, source.y - 10);
    // A later socket reflects movement, and must not drag an in-flight shot.
    unitWeaponSockets.set(99, { x: source.x + 200, y: source.y + 200 });
    vi.mocked(ctx.moveTo).mockClear();
    const movedCam = { x: 200, y: 80, zoom: 2 };
    const movedSource = tileToScreen(2, 2, movedCam, 0);
    drawCombatProjectileBursts(ctx, movedCam, [burst], 100);
    expect(ctx.moveTo).toHaveBeenCalledWith(movedSource.x + 50, movedSource.y - 20);
  } finally { unitWeaponSockets.delete(99); }
});
