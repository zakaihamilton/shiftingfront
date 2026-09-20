import { describe, expect, it } from "vitest";
import { TILE_H, createCamera, tileToScreen } from "../../lib/iso";
import { finalizeMultiSelect, pickEntity } from "../../lib/render/pick";
import { entityAtPointer } from "../../lib/render/renderPicking";
import { tooltipLines } from "../../lib/render/renderer";
import { pickTile } from "../../lib/render/renderer";
import { issue, tick } from "../../lib/sim/api";
import { addBuilding, addUnit, makeFixture, setTile, TILE_RESOURCE } from "../../lib/sim/fixtures";
import { heightAt } from "../../lib/sim/world";
import { setHeight } from "../../lib/sim/fixtures";
import { computeUnitDynamicTransform, resetUnitTransformTracker, updateUnitHistory } from "../../lib/render/gl/unitTransformTracker";
import { selectionProjectionPoint } from "../../components/game/hooks/selectionBox";
import { pointerTile, selectVisibleUnitsOfKind, selectionIdsInBox } from "../../components/game/hooks/gameInputOrders";

describe("harvester selection", () => {
  it("selects a harvester from a click on its sprite body", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const h = addUnit(s, 0, "harvester", 5, 5);
    const cam = createCamera();
    const pos = tileToScreen(h.x, h.y, cam, heightAt(s, 5, 5));
    const onBody = pickEntity(s, pos.x, pos.y - 12, cam);
    expect(onBody?.id).toBe(h.id);
    expect(onBody?.kind).toBe("harvester");
  });

  it("selects a repair truck with the vehicle hit radius", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const truck = addUnit(s, 0, "repairTruck", 5, 5);
    const cam = createCamera();
    const pos = tileToScreen(truck.x, truck.y, cam, heightAt(s, 5, 5));
    const nearEdge = pickEntity(s, pos.x + 36, pos.y - 12, cam);
    expect(nearEdge?.id).toBe(truck.id);
  });

  it("selects a plane at its interpolated landing position", () => {
    resetUnitTransformTracker();
    const s = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    const plane = addUnit(s, 0, "strikePlane", 10, 8);
    plane.flightState = "airborne";
    updateUnitHistory(s, 1000);
    computeUnitDynamicTransform(plane, s, 0, 1000);

    s.tick += 1;
    plane.x = 3.5;
    plane.y = 2.5;
    plane.flightState = "servicing";
    updateUnitHistory(s, 1083);
    const rendered = computeUnitDynamicTransform(plane, s, 0, 1443);
    const cam = createCamera();
    const elev = heightAt(s, rendered.x, rendered.y) + 5 * rendered.airborneMix;
    const pos = tileToScreen(rendered.x, rendered.y, cam, elev);

    expect(pickEntity(s, pos.x, pos.y - 12, cam, false, 1443)?.id).toBe(plane.id);
  });

  it("marquee-selects a plane at its interpolated landing position", () => {
    resetUnitTransformTracker();
    const s = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    const plane = addUnit(s, 0, "strikePlane", 10, 8);
    plane.flightState = "airborne";
    updateUnitHistory(s, 1000);
    computeUnitDynamicTransform(plane, s, 0, 1000);

    s.tick += 1;
    plane.x = 3.5;
    plane.y = 2.5;
    plane.flightState = "servicing";
    updateUnitHistory(s, 1083);
    const rendered = computeUnitDynamicTransform(plane, s, 0, 1443);
    const cam = createCamera();
    const elev = heightAt(s, rendered.x, rendered.y) + 5 * rendered.airborneMix;
    const pos = tileToScreen(rendered.x, rendered.y, cam, elev);
    const box = {
      x0: pos.x - 12,
      y0: pos.y - 12,
      x1: pos.x + 12,
      y1: pos.y + 12,
      anchor: selectionProjectionPoint({ x: pos.x - 12, y: pos.y - 12 }, cam),
    };

    expect(selectionIdsInBox(s, cam, box, false, 1443)).toContain(plane.id);
  });

  it("selects a convoy truck with the vehicle hit radius", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const truck = addUnit(s, 0, "convoyTruck", 5, 5);
    const cam = createCamera();
    const pos = tileToScreen(truck.x, truck.y, cam, heightAt(s, 5, 5));
    const nearEdge = pickEntity(s, pos.x + 36, pos.y - 12, cam);
    expect(nearEdge?.id).toBe(truck.id);
  });

  it("prefers a harvester overlapping a neighboring refinery over the building", () => {
    const s = makeFixture({ width: 14, height: 12, win: { kind: "annihilate" } });
    const refinery = addBuilding(s, 0, "refinery", 4, 4);
    const h = addUnit(s, 0, "harvester", 4, 6);
    const cam = createCamera();
    const pos = tileToScreen(h.x, h.y, cam, heightAt(s, Math.round(h.x), Math.round(h.y)));
    const hit = pickEntity(s, pos.x, pos.y - 16, cam);
    expect(hit?.id).toBe(h.id);
    expect(hit?.id).not.toBe(refinery.id);
  });

  it("still auto-harvests after the harvester is treated as selected", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "refinery", 2, 2);
    setTile(s, 7, 5, TILE_RESOURCE, 400);
    const h = addUnit(s, 0, "harvester", 7, 5);
    const selected = new Set([h.id]);
    expect(selected.has(h.id)).toBe(true);
    for (let i = 0; i < 8; i++) tick(s);
    expect(h.carry).toBeGreaterThan(0);
    expect(s.result).toBe("playing");
  });

  it("accepts move orders for a selected harvester", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    const h = addUnit(s, 0, "harvester", 2, 2);
    issue(s, { type: "move", unitIds: [h.id], x: 6, y: 2 });
    for (let i = 0; i < 400; i++) tick(s);
    expect(Math.round(h.x)).toBe(6);
    expect(Math.round(h.y)).toBe(2);
  });

  it("keeps tile-diamond clicks working for infantry", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const u = addUnit(s, 0, "infantry", 5, 5);
    const cam = createCamera();
    const pos = tileToScreen(u.x, u.y, cam, heightAt(s, 5, 5));
    const hit = pickEntity(s, pos.x, pos.y + TILE_H / 4, cam);
    expect(hit?.id).toBe(u.id);
  });

  it("drops harvesters from a mixed box select", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const harvester = addUnit(s, 0, "harvester", 3, 3);
    const infantry = addUnit(s, 0, "infantry", 4, 4);
    const tank = addUnit(s, 0, "tank", 5, 5);
    expect(finalizeMultiSelect(s.entities, [harvester.id, infantry.id, tank.id])).toEqual([
      infantry.id,
      tank.id,
    ]);
  });

  it("keeps a harvester-only box select", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const a = addUnit(s, 0, "harvester", 3, 3);
    const b = addUnit(s, 0, "harvester", 4, 4);
    expect(finalizeMultiSelect(s.entities, [a.id, b.id])).toEqual([a.id, b.id]);
  });

  it("keeps a single-click harvester selection", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const h = addUnit(s, 0, "harvester", 5, 5);
    expect(finalizeMultiSelect(s.entities, [h.id])).toEqual([h.id]);
    const cam = createCamera();
    const pos = tileToScreen(h.x, h.y, cam, heightAt(s, 5, 5));
    expect(pickEntity(s, pos.x, pos.y - 12, cam)?.id).toBe(h.id);
  });

  it("picks an elevated top surface instead of the cliff face below it", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    setHeight(s, 6, 6, 3);
    const cam = createCamera();
    const top = tileToScreen(6, 6, cam, heightAt(s, 6, 6));
    expect(pickTile(s, top.x, top.y + TILE_H / 2, cam)).toEqual({ x: 6, y: 6 });
  });

  it("picks the tile under the cursor when an elevated neighbor overlaps its surface", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    setHeight(s, 3, 0, 0);
    setHeight(s, 4, 1, 1);
    const cam = { x: 300, y: 200, zoom: 1 };
    const target = tileToScreen(3, 0, cam, heightAt(s, 3, 0));

    const cursor = { x: target.x, y: target.y + TILE_H / 2 };
    expect(pickTile(s, cursor.x, cursor.y, cam)).toEqual({ x: 3, y: 0 });
    expect(pointerTile(s, cursor, cam)).toEqual({ x: 3, y: 0 });
  });

  it("keeps the marquee anchor attached while horizontal edge-pan reveals another unit", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    setHeight(s, 5, 5, 0);
    setHeight(s, 9, 1, 0);
    const first = addUnit(s, 0, "infantry", 5, 5);
    const revealed = addUnit(s, 0, "infantry", 9, 1);
    const cam = { x: 300, y: 200, zoom: 1 };
    const firstPoint = tileToScreen(first.x, first.y, cam, 0);
    const box = {
      x0: firstPoint.x - 10,
      y0: firstPoint.y - 20,
      x1: firstPoint.x + 50,
      y1: firstPoint.y + 20,
      anchor: selectionProjectionPoint({ x: firstPoint.x - 10, y: firstPoint.y - 20 }, cam),
    };

    cam.x -= 250;

    expect(selectionIdsInBox(s, cam, box, false)).toEqual([first.id, revealed.id]);
  });

  it("keeps the marquee anchor attached while vertical edge-pan reveals another unit", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    setHeight(s, 5, 5, 0);
    setHeight(s, 5, 9, 0);
    const first = addUnit(s, 0, "infantry", 5, 5);
    const revealed = addUnit(s, 0, "infantry", 5, 9);
    const cam = { x: 300, y: 200, zoom: 1 };
    const firstPoint = tileToScreen(first.x, first.y, cam, 0);
    const box = {
      x0: firstPoint.x - 150,
      y0: firstPoint.y - 20,
      x1: firstPoint.x + 20,
      y1: firstPoint.y + 40,
      anchor: selectionProjectionPoint({ x: firstPoint.x - 150, y: firstPoint.y - 20 }, cam),
    };

    cam.y -= 100;

    expect(selectionIdsInBox(s, cam, box, false)).toEqual([first.id, revealed.id]);
  });
});

describe("same-type on-screen selection", () => {
  it("selects visible units of the same kind and skips off-screen, enemy, and other kinds", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const cam = createCamera();
    const viewport = { width: 500, height: 400 };
    const tank = addUnit(s, 0, "tank", 5, 5);
    const nearby = addUnit(s, 0, "tank", 6, 5);
    const infantry = addUnit(s, 0, "infantry", 5, 6);
    const harvester = addUnit(s, 0, "harvester", 4, 5);
    const enemy = addUnit(s, 1, "tank", 6, 6);
    const offScreen = addUnit(s, 0, "tank", 11, 11);
    const dead = addUnit(s, 0, "tank", 4, 6);
    dead.hp = 0;

    expect(selectVisibleUnitsOfKind(s, cam, viewport, tank)).toEqual([tank.id, nearby.id]);
    expect(selectVisibleUnitsOfKind(s, cam, viewport, tank)).not.toContain(infantry.id);
    expect(selectVisibleUnitsOfKind(s, cam, viewport, tank)).not.toContain(harvester.id);
    expect(selectVisibleUnitsOfKind(s, cam, viewport, tank)).not.toContain(enemy.id);
    expect(selectVisibleUnitsOfKind(s, cam, viewport, tank)).not.toContain(offScreen.id);
    expect(selectVisibleUnitsOfKind(s, cam, viewport, tank)).not.toContain(dead.id);
  });

  it("keeps the clicked unit even if it sits on the viewport edge", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const cam = createCamera();
    const tank = addUnit(s, 0, "tank", 11, 11);
    expect(selectVisibleUnitsOfKind(s, cam, { width: 80, height: 80 }, tank)).toEqual([tank.id]);
  });

  it("does not expand a building click", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const cam = createCamera();
    const yard = addBuilding(s, 0, "constructionYard", 2, 2);
    addBuilding(s, 0, "power", 6, 2);
    expect(selectVisibleUnitsOfKind(s, cam, { width: 800, height: 600 }, yard)).toEqual([]);
  });

  it("keeps stranded units hoverable but never selectable", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const cam = createCamera();
    const stranded = addUnit(s, 0, "infantry", 5, 5);
    stranded.neutral = false;
    stranded.scenarioRole = "stranded";
    const otherStranded = addUnit(s, 0, "infantry", 6, 5);
    otherStranded.neutral = false;
    otherStranded.scenarioRole = "stranded";
    const regular = addUnit(s, 0, "infantry", 5, 6);
    const strandedScreen = tileToScreen(stranded.x, stranded.y, cam, heightAt(s, stranded.x, stranded.y));

    expect(selectVisibleUnitsOfKind(s, cam, { width: 800, height: 600 }, stranded)).toEqual([]);
    expect(pickEntity(s, strandedScreen.x, strandedScreen.y - 12, cam)).toBeUndefined();
    const hovered = entityAtPointer(s, strandedScreen.x, strandedScreen.y + TILE_H / 2 - 12, cam);
    expect(hovered?.id).toBe(stranded.id);
    expect(tooltipLines(s, hovered!, {})).toContain("Stranded");
    expect(selectVisibleUnitsOfKind(s, cam, { width: 800, height: 600 }, regular)).toEqual([regular.id]);
    expect(otherStranded.id).not.toBe(regular.id);
  });
});
