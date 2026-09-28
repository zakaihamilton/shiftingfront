import { describe, expect, it } from "vitest";
import {
  createMissionIntroPresentationState,
  createMissionIntroPlan,
  createMissionIntroSupportBuildings,
  missionIntroPhaseFor,
  sampleMissionIntroCameraPose,
  sampleMissionIntroTimeline,
} from "@/lib/render/missionIntro";
import { cameraPanBounds, clampCamera } from "@/lib/render/camera";
import { tileToScreen } from "@/lib/iso";
import { heightAt } from "@/lib/sim/world";
import { MISSION_INTRO_BIOMES } from "@/lib/render/missionIntroBiome";
import { BIOMES } from "@/lib/gen/names";
import { MOBILE_HQ_DIRECTION_ART } from "@/lib/gen/visualAssets";
import { footprintOf } from "@/lib/catalog/buildings";
import { createSkirmish } from "@/lib/sim/api";

describe("authored mission arrival cutscene", () => {
  it("builds a deterministic five-shot plan around the battlefield", () => {
    const state = createSkirmish(6482, 0).state;
    const first = createMissionIntroPlan(state)!;
    const second = createMissionIntroPlan(state)!;

    expect(first).not.toBeNull();
    expect(first.route).toEqual(second.route);
    expect(first.beats).toEqual(second.beats);
    expect(first.shots).toEqual(second.shots);
    expect(first.durationMs).toBe(7_000);
    expect(first.beats.map(({ id }) => id)).toEqual(["establish", "entry", "arrival", "deployment", "reveal"]);
    expect(first.shots).toHaveLength(5);
    expect(first.route.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  });

  it("uses authored shot cuts with bounded seed variation and a wide gameplay handoff", () => {
    const state = createSkirmish(6482, 0).state;
    const plan = createMissionIntroPlan(state)!;
    const alternatePlan = createMissionIntroPlan(createSkirmish(6483, 0).state)!;
    const expectedCuts = [
      [0, 0.06],
      [0.06, 0.66],
      [0.66, 0.72],
      [0.72, 0.88],
      [0.88, 1],
    ];

    expect(plan.shots.map(({ start, end }) => [start, end])).toEqual(expectedCuts);
    expect(plan.shots.map((shot) => shot.id)).toEqual(plan.beats.map((beat) => beat.id));
    expect(plan.shots[0]!.zoomStart).toBeGreaterThan(plan.shots[1]!.zoomStart);
    expect(plan.shots[1]!.zoomStart).toBeGreaterThan(plan.shots[3]!.zoomStart);
    expect(plan.shots[2]!.zoomStart).toBeGreaterThan(plan.shots[4]!.zoomStart);
    expect(plan.shots[0]!.zoomStart).toBeGreaterThan(plan.shots.at(-1)!.zoomEnd);
    expect(plan.shots).not.toEqual(alternatePlan.shots);
    expect(plan.shots.flatMap((shot) => shot.focus).every((point) =>
      point.x >= 3 && point.x <= state.width - 3 && point.y >= 3 && point.y <= state.height - 3,
    )).toBe(true);
    expect(plan.shots[0]!.cutOnEntry).toBe(false);
    expect(plan.shots.slice(1).every((shot) => shot.cutOnEntry)).toBe(true);

    const finalShot = plan.shots.at(-1)!;
    expect(finalShot.focus[3].x).toBe(plan.yard.x);
    expect(finalShot.focus[3].y).toBe(plan.yard.y);
    expect(finalShot.zoomEnd).toBe(1);

    const handoffCamera = { x: 0, y: 0, zoom: 1 };
    const hqGround = tileToScreen(plan.yard.x, plan.yard.y, handoffCamera, heightAt(state, plan.yard.x, plan.yard.y));
    handoffCamera.x = 1280 / 2 - hqGround.x;
    handoffCamera.y = 720 / 3 - hqGround.y;
    clampCamera(handoffCamera, cameraPanBounds(handoffCamera, state.width, state.height, 1280, 720));
    const finalPose = sampleMissionIntroCameraPose(state, plan, plan.durationMs).pose;
    expect(finalPose.focus).toEqual({ x: plan.yard.x, y: plan.yard.y });
    expect(finalPose.camera).toEqual(handoffCamera);

    for (const boundary of expectedCuts.slice(1).map(([start]) => start)) {
      const before = sampleMissionIntroCameraPose(state, plan, plan.durationMs * (boundary - 0.001)).pose;
      const after = sampleMissionIntroCameraPose(state, plan, plan.durationMs * (boundary + 0.001)).pose;
      expect(Math.hypot(after.focus.x - before.focus.x, after.focus.y - before.focus.y)).toBeGreaterThan(0.1);
    }

    for (const progress of [0, 0.06, 0.34, 0.61, 0.75, 0.94, 1]) {
      const pose = sampleMissionIntroCameraPose(state, plan, plan.durationMs * progress).pose;
      expect(pose.zoom).toBeGreaterThan(0.55);
      expect(pose.camera.zoom).toBe(pose.zoom);
      expect(Number.isFinite(pose.camera.x) && Number.isFinite(pose.camera.y)).toBe(true);
    }

    const entryStart = sampleMissionIntroCameraPose(state, plan, plan.durationMs * 0.06).pose;
    expect(entryStart.focus.x).toBeCloseTo(plan.shots[1]!.focus[0].x);
    expect(entryStart.focus.y).toBeCloseTo(plan.shots[1]!.focus[0].y);
  });

  it("keeps the convoy entry short and slow, then dissolves it into the HQ at the same site", () => {
    const state = createSkirmish(6482, 0).state;
    const plan = createMissionIntroPlan(state)!;
    const reducedPlan = createMissionIntroPlan(state, true)!;
    const depart = sampleMissionIntroTimeline(plan, 0);
    const halfwayIn = sampleMissionIntroTimeline(plan, plan.durationMs * 0.36);
    const arrived = sampleMissionIntroTimeline(plan, plan.durationMs * 0.66);
    const anchoring = sampleMissionIntroTimeline(plan, plan.durationMs * 0.69);
    const deploying = sampleMissionIntroTimeline(plan, plan.durationMs * 0.8);
    const deployed = sampleMissionIntroTimeline(plan, plan.durationMs * 0.87);
    const hqBuilt = sampleMissionIntroTimeline(plan, plan.durationMs * 0.87);
    const supportBuilding = sampleMissionIntroTimeline(plan, plan.durationMs * 0.9);
    const held = sampleMissionIntroTimeline(plan, plan.durationMs * 0.92);
    const reducedStart = sampleMissionIntroTimeline(reducedPlan, 0, true);
    const reducedReveal = sampleMissionIntroTimeline(reducedPlan, reducedPlan.durationMs * 0.8, true);

    expect(plan.route.at(-1)!.x).toBeCloseTo(plan.yard.x + (footprintOf("constructionYard").w - 1) / 2);
    expect(plan.route.at(-1)!.y).toBeCloseTo(plan.yard.y + (footprintOf("constructionYard").h - 1) / 2);
    expect(plan.routeLength).toBeGreaterThanOrEqual(plan.staging.entryDistance - 0.2);
    expect(plan.routeLength).toBeLessThanOrEqual(plan.staging.entryDistance + 0.3);
    expect(plan.routeLength).toBeLessThan(4);
    expect(depart.progress).toBe(0);
    expect(halfwayIn.progress).toBeCloseTo(0.5);
    expect(arrived.progress).toBeCloseTo(1);
    expect(arrived.deployment).toBe(0);
    expect(anchoring.vehicleAlpha).toBeGreaterThan(0.9);
    expect(deploying.vehicleAlpha).toBeLessThan(0.5);
    expect(deploying.transitionAlpha).toBeGreaterThan(0.5);
    expect(deployed.structure).toBeCloseTo(1);
    expect(hqBuilt.supportConstruction).toBe(0);
    expect(supportBuilding.supportConstruction).toBeGreaterThan(0);
    expect(held.fade).toBe(0);
    expect(sampleMissionIntroTimeline(plan, plan.durationMs).fade).toBe(1);

    expect(reducedPlan.durationMs).toBe(3_200);
    expect(reducedStart.progress).toBe(1);
    expect(reducedStart.transitionAlpha).toBe(0);
    expect(reducedReveal.structure).toBeCloseTo(1);
    expect(sampleMissionIntroCameraPose(state, reducedPlan, 0, true).pose).toEqual(
      sampleMissionIntroCameraPose(state, reducedPlan, reducedPlan.durationMs, true).pose,
    );

    expect(missionIntroPhaseFor(plan, 0)).toBe("APPROACHING BASE SITE");
    expect(missionIntroPhaseFor(plan, plan.durationMs * 0.69)).toBe("ANCHORING MOBILE HQ");
    expect(missionIntroPhaseFor(plan, plan.durationMs * 0.8)).toBe("UNFOLDING COMMAND HQ");
    expect(missionIntroPhaseFor(plan, plan.durationMs * 0.92)).toBe("COMMAND HQ ONLINE");

    const scene = createMissionIntroPresentationState(state, plan.owner);
    expect(scene.fog).toEqual(state.fog);
    expect(scene.fog).toContain(0);
    expect(scene.entities.some((entity) => entity.owner === plan.owner && entity.class === "building")).toBe(false);
    expect(createMissionIntroSupportBuildings(state, plan.owner, 0)).toHaveLength(0);
    const buildingStarts = createMissionIntroSupportBuildings(state, plan.owner, 0.01);
    expect(buildingStarts.length).toBeGreaterThan(0);
    expect(buildingStarts.every((entity) => entity.kind !== "constructionYard" && entity.constructing > 0)).toBe(true);
    const completedBuildings = createMissionIntroSupportBuildings(state, plan.owner, 1);
    expect(completedBuildings.every((entity) => entity.constructing === 0)).toBe(true);
  });

  it("provides valid seeded staging and camera shots for every biome", () => {
    const state = createSkirmish(6482, 0).state;
    expect(Object.keys(MOBILE_HQ_DIRECTION_ART)).toHaveLength(8);
    expect(Object.keys(MISSION_INTRO_BIOMES).sort()).toEqual([...BIOMES].sort());

    const plans = BIOMES.map((biome) => {
      const biomeState = { ...state, biome };
      const plan = createMissionIntroPlan(biomeState)!;
      expect(plan.staging).toEqual(MISSION_INTRO_BIOMES[biome]);
      expect(createMissionIntroPlan(biomeState)!.shots).toEqual(plan.shots);
      expect(plan.shots).toHaveLength(5);
      expect(plan.shots.every((shot) => shot.zoomStart > 0.55 && shot.zoomEnd > 0.55)).toBe(true);
      expect(plan.route.at(-1)!.x).toBeCloseTo(plan.yard.x + (footprintOf("constructionYard").w - 1) / 2);
      expect(plan.route.at(-1)!.y).toBeCloseTo(plan.yard.y + (footprintOf("constructionYard").h - 1) / 2);
      expect(plan.route.every(({ x, y }) =>
        Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < state.width && y < state.height,
      )).toBe(true);
      return plan;
    });

    expect(new Set(plans.map((plan) => plan.staging.cameraZooms[2])).size).toBeGreaterThan(5);
    expect(new Set(plans.map((plan) =>
      plan.shots[0]!.focus[0].x.toFixed(2) + ":" + plan.shots[0]!.focus[0].y.toFixed(2),
    )).size).toBeGreaterThan(4);
  });
});
