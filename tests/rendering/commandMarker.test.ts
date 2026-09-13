import { describe, expect, it, vi } from "vitest";
import { createCamera } from "../../lib/iso";
import { UNIT_STATS } from "../../lib/catalog";
import { COMMAND_MARKER_COLORS, commandMarkerKind, commandMarkerReachedDestination, drawCommandMarker, drawRallyPoint } from "../../lib/render/renderOverlays";
import { drawCombatEffects } from "../../lib/render/renderCombat";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";

function mockCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    setLineDash: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    fillRect: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    shadowColor: "",
    shadowBlur: 0,
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    lineCap: "butt",
    canvas: { width: 400, height: 300 },
  } as unknown as CanvasRenderingContext2D;
}

describe("command markers", () => {
  it("draws a persistent rally marker and route from the selected producer", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const building = addBuilding(state, 0, "barracks", 2, 2);
    building.rallyPoint = { x: 7, y: 7 };
    const ctx = mockCtx();

    drawRallyPoint(ctx, state, createCamera(), building, 80);

    expect(ctx.setLineDash).toHaveBeenCalled();
    expect(ctx.ellipse).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalled();
  });

  it("maps order types onto attack, harvest, support, and move kinds", () => {
    expect(commandMarkerKind([{ type: "attack", unitIds: [1] }])).toBe("attack");
    expect(commandMarkerKind([{ type: "attackMove", unitIds: [1] }])).toBe("attack");
    expect(commandMarkerKind([{ type: "harvest", unitIds: [1] }])).toBe("harvest");
    expect(commandMarkerKind([{ type: "support", unitIds: [1] }])).toBe("support");
    expect(commandMarkerKind([{ type: "move", unitIds: [1] }])).toBe("move");
    expect(commandMarkerKind([{ type: "move", unitIds: [] }])).toBeNull();
    expect(commandMarkerKind([{ type: "build" }])).toBeNull();
  });

  it("paints each command-marker kind in its own color", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const cam = createCamera();
    for (const kind of ["move", "attack", "harvest", "support"] as const) {
      const ctx = mockCtx();
      drawCommandMarker(ctx, state, cam, { x: 2, y: 2, bornMs: 0, kind }, 80);
      expect(ctx.strokeStyle).toBe(COMMAND_MARKER_COLORS[kind].stroke);
      expect(ctx.fillStyle).toBe(COMMAND_MARKER_COLORS[kind].fill);
    }
  });

  it("draws invalid placement feedback as a transient yellow marker", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const cam = createCamera();
    const ctx = mockCtx();

    drawCommandMarker(ctx, state, cam, { x: 2, y: 2, bornMs: 0, kind: "invalid" }, 90);

    expect(ctx.strokeStyle).toBe(COMMAND_MARKER_COLORS.invalid.stroke);
    expect(ctx.ellipse).toHaveBeenCalledTimes(2);

    const expiredCtx = mockCtx();
    drawCommandMarker(expiredCtx, state, cam, { x: 2, y: 2, bornMs: 0, expiresMs: 900, kind: "invalid" }, 900);
    expect(expiredCtx.ellipse).not.toHaveBeenCalled();
  });

  it("removes an order marker after its units reach the destination", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 2, 2);
    unit.orderMode = "attackMove";
    unit.orderDestination = { x: 2, y: 2 };
    unit.idle = true;
    unit.routePending = false;
    const marker = { x: 2, y: 2, bornMs: 0, kind: "attack" as const, mode: "attackMove" as const, unitIds: [unit.id] };

    expect(commandMarkerReachedDestination(state, marker)).toBe(true);
    const ctx = mockCtx();
    drawCommandMarker(ctx, state, createCamera(), marker, 80);
    expect(ctx.ellipse).not.toHaveBeenCalled();
  });

  it("keeps an order marker visible while its units are still moving", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 2, 2);
    unit.orderMode = "attackMove";
    unit.orderDestination = { x: 8, y: 2 };
    unit.idle = false;
    unit.routePending = false;
    unit.path = [{ x: 3, y: 2 }];
    const marker = { x: 8, y: 2, bornMs: 0, kind: "attack" as const, mode: "attackMove" as const, unitIds: [unit.id] };

    expect(commandMarkerReachedDestination(state, marker)).toBe(false);
    const ctx = mockCtx();
    drawCommandMarker(ctx, state, createCamera(), marker, 80);
    expect(ctx.ellipse).toHaveBeenCalled();
  });

  it("keeps a direct attack marker visible when the target is unreachable", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 2, 2);
    const target = addUnit(state, 1, "infantry", 10, 2);
    unit.attackTarget = target.id;
    unit.orderMode = "attack";
    unit.orderDestination = { x: target.x, y: target.y };
    unit.idle = false;
    unit.routePending = false;
    unit.path = [];
    const marker = { x: target.x, y: target.y, bornMs: 0, kind: "attack" as const, mode: "attack" as const, targetId: target.id, unitIds: [unit.id] };

    expect(commandMarkerReachedDestination(state, marker)).toBe(false);
    const ctx = mockCtx();
    drawCommandMarker(ctx, state, createCamera(), marker, 80);
    expect(ctx.ellipse).toHaveBeenCalled();
  });

  it("removes a direct attack marker after the unit reaches weapon range", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const unit = addUnit(state, 0, "infantry", 2, 2);
    const target = addUnit(state, 1, "infantry", 4, 2);
    unit.attackTarget = target.id;
    unit.orderMode = "attack";
    unit.orderDestination = { x: target.x, y: target.y };
    unit.idle = false;
    unit.routePending = false;
    unit.path = [];
    const marker = { x: target.x, y: target.y, bornMs: 0, kind: "attack" as const, mode: "attack" as const, targetId: target.id, unitIds: [unit.id] };

    expect(commandMarkerReachedDestination(state, marker)).toBe(true);
    const ctx = mockCtx();
    drawCommandMarker(ctx, state, createCamera(), marker, 80);
    expect(ctx.ellipse).not.toHaveBeenCalled();
  });
});

describe("combat tracers", () => {
  it("strokes tracers for a non-empty attacking draw list and skips an empty list", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const attacker = addUnit(state, 0, "infantry", 2, 2);
    const target = addUnit(state, 1, "infantry", 4, 2);
    attacker.attackTarget = target.id;
    attacker.cooldown = UNIT_STATS.infantry.cooldown;
    const cam = createCamera();
    const byId = new Map(state.entities.map((entity) => [entity.id, entity]));

    const empty = mockCtx();
    drawCombatEffects(empty, state, cam, [], byId, () => 0);
    expect(empty.stroke).not.toHaveBeenCalled();

    const armed = mockCtx();
    drawCombatEffects(armed, state, cam, [attacker], byId, () => 0);
    expect(armed.stroke).toHaveBeenCalled();
  });

  it("skips stale or dead unit targets instead of drawing across the battlefield", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const attacker = addUnit(state, 0, "infantry", 2, 2);
    const target = addUnit(state, 1, "infantry", 10, 2);
    attacker.attackTarget = target.id;
    attacker.cooldown = UNIT_STATS.infantry.cooldown;
    const cam = createCamera();
    const byId = new Map(state.entities.map((entity) => [entity.id, entity]));

    const stale = mockCtx();
    drawCombatEffects(stale, state, cam, [attacker], byId, () => 0);
    expect(stale.stroke).not.toHaveBeenCalled();

    target.hp = 0;
    const dead = mockCtx();
    drawCombatEffects(dead, state, cam, [attacker], byId, () => 0);
    expect(dead.stroke).not.toHaveBeenCalled();
  });
});
