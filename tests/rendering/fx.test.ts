import { describe, expect, it, vi } from "vitest";
import { createCamera } from "../../lib/iso";
import {
  burstsFromDestroyed,
  burstsFromEvents,
  cullFx,
  fxAlive,
  fxProgress,
  fxTargetDomain,
  FX_DURATION,
  MAX_PERSISTENT_FX,
  MAX_TRANSIENT_FX,
  type FxBurst,
} from "../../lib/render/fx";
import { drawFxLayer } from "../../lib/render/renderCombat";
import { drawSprite } from "../../lib/render/sprites";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";

vi.mock("../../lib/render/sprites", async () => {
  const actual = await vi.importActual<typeof import("../../lib/render/sprites")>("../../lib/render/sprites");
  return {
    ...actual,
    drawSprite: vi.fn(),
    rasterize: vi.fn(() => ({ width: 1, height: 1 } as HTMLCanvasElement)),
  };
});

function burst(partial: Partial<FxBurst> & Pick<FxBurst, "kind">): FxBurst {
  return {
    id: 1,
    x: 2,
    y: 3,
    elev: 1,
    bornMs: 1000,
    durationMs: FX_DURATION[partial.kind],
    entityKind: "tank",
    entityClass: "unit",
    owner: 0,
    ...partial,
  };
}

function mockCtx() {
  return {
    canvas: { width: 800, height: 500 },
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe("combat fx bursts", () => {
  it("reports progress and expiry from birth time", () => {
    const explosion = burst({ kind: "explosion", bornMs: 0, durationMs: 100 });
    expect(fxProgress(explosion, 0)).toBe(0);
    expect(fxProgress(explosion, 50)).toBe(0.5);
    expect(fxProgress(explosion, 100)).toBe(1);
    expect(fxAlive(explosion, 99)).toBe(true);
    expect(fxAlive(explosion, 100)).toBe(false);

    const destruction = burst({ kind: "destruction", bornMs: 0 });
    expect(fxProgress(destruction, FX_DURATION.destruction / 2)).toBe(0.5);
    expect(cullFx([destruction], FX_DURATION.destruction - 1)).toHaveLength(1);
    expect(cullFx([destruction], FX_DURATION.destruction)).toHaveLength(0);
  });

  it("culls expired bursts and caps the live list", () => {
    const live = burst({ id: 2, kind: "rubble", bornMs: 900 });
    const dead = burst({ id: 1, kind: "explosion", bornMs: 0, durationMs: 10 });
    expect(cullFx([dead, live], 1000).map((item) => item.id)).toEqual([2]);
    const many = Array.from({ length: 70 }, (_, i) => burst({ id: i, kind: "impact", bornMs: 990, durationMs: 200 }));
    expect(cullFx(many, 1000)).toHaveLength(MAX_TRANSIENT_FX);
    const aftermath = Array.from({ length: 30 }, (_, i) => burst({ id: 100 + i, kind: "scorch", bornMs: 990 }));
    const culled = cullFx([...many, ...aftermath], 1000);
    expect(culled.filter((item) => item.kind === "scorch")).toHaveLength(MAX_PERSISTENT_FX);
    expect(culled.filter((item) => item.kind === "impact")).toHaveLength(MAX_TRANSIENT_FX);
  });

  it("spawns one transient destruction burst for units and buildings", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const tank = addUnit(state, 1, "tank", 4, 5);
    const yard = addBuilding(state, 1, "constructionYard", 6, 6);
    tank.hp = 0;
    yard.hp = 0;
    const { bursts, nextId } = burstsFromDestroyed(
      [
        { type: "destroyed", id: tank.id, owner: tank.owner, kind: "tank", x: tank.x, y: tank.y },
        { type: "destroyed", id: yard.id, owner: yard.owner, kind: "constructionYard", x: yard.x, y: yard.y },
      ],
      state,
      500,
      10,
    );
    expect(nextId).toBe(12);
    expect(bursts.map((item) => item.kind)).toEqual(["destruction", "destruction"]);
    expect(bursts.every((item) => item.durationMs === FX_DURATION.destruction)).toBe(true);
    expect(bursts.some((item) => item.entityKind === "tank" && item.entityClass === "unit")).toBe(true);
    expect(bursts.some((item) => item.entityKind === "constructionYard" && item.entityClass === "building")).toBe(true);
    expect(bursts.some((item) => item.kind === "wreck" || item.kind === "rubble" || item.kind === "scorch")).toBe(false);
    expect(bursts.find((item) => item.entityKind === "tank")?.x).toBe(4);
    expect(bursts.find((item) => item.entityKind === "constructionYard")?.y).toBe(6);
  });

  it("classifies organic and vehicle destruction bursts from unit domains", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const organic = addUnit(state, 1, "infantry", 4, 5);
    const vehicle = addUnit(state, 1, "tank", 6, 5);

    const { bursts } = burstsFromDestroyed(
      [
        { type: "destroyed", id: organic.id, owner: organic.owner, kind: organic.kind, x: organic.x, y: organic.y },
        { type: "destroyed", id: vehicle.id, owner: vehicle.owner, kind: vehicle.kind, x: vehicle.x, y: vehicle.y },
      ],
      state,
      500,
      10,
    );

    expect(fxTargetDomain("infantry")).toBe("human");
    expect(fxTargetDomain("tank")).toBe("vehicle");
    expect(bursts.map((item) => item.targetDomain)).toEqual(["human", "vehicle"]);
    expect(bursts.map((item) => item.magnitude)).toEqual([0.62, 0.9]);
  });

  it("renders collapses for units and buildings and suppresses moving debris", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const unit = burst({
      kind: "destruction",
      entityKind: "tank",
      entityClass: "unit",
      bornMs: 1000,
      durationMs: FX_DURATION.destruction,
      variant: 12,
    });
    const building = burst({
      kind: "destruction",
      entityKind: "constructionYard",
      entityClass: "building",
      bornMs: 1000,
      durationMs: FX_DURATION.destruction,
      variant: 13,
    });
    const animated = mockCtx();
    vi.mocked(drawSprite).mockClear();
    drawFxLayer(animated, state, createCamera(), [unit, building], 1200, "burst", false);
    expect(drawSprite).toHaveBeenCalledTimes(4);
    const animatedDebrisCalls = (animated.stroke as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

    const reduced = mockCtx();
    vi.mocked(drawSprite).mockClear();
    drawFxLayer(reduced, state, createCamera(), [unit, building], 1200, "burst", true);
    expect(drawSprite).toHaveBeenCalledTimes(4);
    expect(animatedDebrisCalls).toBeGreaterThan(
      (reduced.stroke as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    );
  });

  it("renders organic deaths as quiet collapses instead of explosions", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const organic = burst({
      kind: "destruction",
      entityKind: "infantry",
      entityClass: "unit",
      targetDomain: "human",
      bornMs: 1000,
      durationMs: FX_DURATION.destruction,
      variant: 12,
    });
    const animated = mockCtx();

    vi.mocked(drawSprite).mockClear();
    drawFxLayer(animated, state, createCamera(), [organic], 1300, "burst", false);

    expect(drawSprite).toHaveBeenCalledTimes(2);
    expect((animated.scale as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[1]).toBeLessThan(1);
    expect((animated.rotate as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]).not.toBe(0);
    expect((animated.ellipse as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(1);
    expect((animated.stroke as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(1);

    const reduced = mockCtx();
    drawFxLayer(reduced, state, createCamera(), [organic], 1300, "burst", true);
    expect((reduced.rotate as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]).toBe(0);
    expect((reduced.ellipse as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(1);
  });

  it("keeps the destroyed owner's palette metadata after compaction", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const enemy = addUnit(state, 1, "tank", 4, 5);
    enemy.hp = 0;
    state.entities = state.entities.filter((entity) => entity.id !== enemy.id);

    const { bursts } = burstsFromDestroyed(
      [{ type: "destroyed", id: enemy.id, owner: 1, kind: "tank", x: enemy.x, y: enemy.y }],
      state,
      500,
      10,
    );

    expect(bursts[0]?.owner).toBe(1);
  });

  it("maps weapons, support, construction, and deployment onto typed visual bursts", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const { bursts } = burstsFromEvents(
      [
        {
          type: "combat",
          owner: 0,
          attackerKind: "tank",
          weapon: "cannon",
          x: 2,
          y: 3,
          targetX: 4,
          targetY: 5,
          targetOwner: 1,
          targetKind: "tank",
          destroyed: false,
        },
        {
          type: "support",
          owner: 0,
          providerId: 2,
          providerKind: "medic",
          targetId: 3,
          targetKind: "infantry",
          amount: 12,
          x: 3,
          y: 3,
          targetX: 4,
          targetY: 4,
        },
        { type: "built", owner: 0, kind: "power", id: 4, x: 5, y: 5 },
        { type: "produced", owner: 0, kind: "tank", id: 5, x: 6, y: 5, sourceId: 4 },
      ],
      state,
      400,
      20,
    );

    expect(bursts.map((item) => item.kind)).toEqual(["muzzle", "impact", "heal", "build", "deploy"]);
    expect(bursts.find((item) => item.kind === "impact")).toMatchObject({
      weapon: "cannon",
      targetDomain: "vehicle",
      sourceX: 2,
      sourceY: 3,
    });
    expect(bursts.every((item) => item.variant !== undefined && item.magnitude !== undefined)).toBe(true);
  });

  it("keeps deterministic metadata and non-gory target domains", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const event = { type: "built", owner: 0, kind: "power", id: 7, x: 5, y: 6 } as const;
    const first = burstsFromEvents([event], state, 100, 9).bursts[0];
    const second = burstsFromEvents([event], state, 100, 9).bursts[0];
    expect(first?.variant).toBe(second?.variant);
    expect(fxTargetDomain("infantry")).toBe("human");
    expect(fxTargetDomain("tank")).toBe("vehicle");
    expect(fxTargetDomain("power")).toBe("building");
  });

  it("reduces particle motion and culls bursts outside the visible battlefield", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const cam = createCamera();
    const impact = burst({
      kind: "impact",
      x: 2,
      y: 2,
      bornMs: 0,
      weapon: "cannon",
      targetDomain: "vehicle",
      magnitude: 1,
      variant: 12,
    });
    const animated = mockCtx();
    drawFxLayer(animated, state, cam, [impact], 80, "burst", false);
    expect(animated.ellipse).toHaveBeenCalled();
    expect(animated.fillRect).toHaveBeenCalled();

    const reduced = mockCtx();
    drawFxLayer(reduced, state, cam, [impact], 80, "burst", true);
    expect(reduced.ellipse).toHaveBeenCalled();
    expect(reduced.fillRect).not.toHaveBeenCalled();

    const offscreen = mockCtx();
    drawFxLayer(offscreen, state, cam, [{ ...impact, x: 1000, y: 1000 }], 80, "burst");
    expect(offscreen.ellipse).not.toHaveBeenCalled();
  });
});
