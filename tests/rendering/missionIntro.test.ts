import { describe, expect, it } from "vitest";
import {
  createMissionIntroPresentationState,
  createMissionIntroPlan,
  createMissionIntroSupportBuildings,
  missionIntroPhaseFor,
  sampleMissionIntroCameraPose,
  sampleMissionIntroTimeline,
  type MissionIntroPlan,
} from "@/lib/render/missionIntro";
import { cameraPanBounds, clampCamera } from "@/lib/render/camera";
import { tileToScreen } from "@/lib/iso";
import { heightAt } from "@/lib/sim/world";
import { MISSION_INTRO_BIOMES } from "@/lib/render/missionIntroBiome";
import { BIOMES } from "@/lib/gen/names";
import { MOBILE_HQ_DIRECTION_ART } from "@/lib/gen/visualAssets";
import { footprintOf } from "@/lib/catalog/buildings";
import { createMission, createSkirmish } from "@/lib/sim/api";

function pointAlongIntroRoute(plan: MissionIntroPlan, progress: number) {
  const distance = Math.max(0, Math.min(1, progress)) * plan.routeLength;
  let index = 1;
  while (index < plan.routeDistances.length && plan.routeDistances[index]! < distance) index += 1;
  const startDistance = plan.routeDistances[Math.max(0, index - 1)] ?? 0;
  const endDistance = plan.routeDistances[Math.min(plan.routeDistances.length - 1, index)] ?? startDistance;
  const mix = endDistance <= startDistance ? 0 : (distance - startDistance) / (endDistance - startDistance);
  const from = plan.route[Math.max(0, index - 1)] ?? plan.yard;
  const to = plan.route[Math.min(plan.route.length - 1, index)] ?? plan.yard;
  return {
    x: from.x + (to.x - from.x) * mix,
    y: from.y + (to.y - from.y) * mix,
  };
}

describe("authored mission arrival cutscene", () => {
  it("builds a deterministic continuous camera plan around the battlefield", () => {
    const state = createSkirmish(6482, 0).state;
    const first = createMissionIntroPlan(state)!;
    const second = createMissionIntroPlan(state)!;

    expect(first).not.toBeNull();
    expect(first.route).toEqual(second.route);
    expect(first.beats).toEqual(second.beats);
    expect(first.cameraOffset).toEqual(second.cameraOffset);
    expect(first.durationMs).toBe(7_000);
    expect(first.beats.map(({ id }) => id)).toEqual(["establish", "entry", "arrival", "deployment", "reveal"]);
    expect(first.route.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  });

  it("uses the same intro choreography for campaign missions and skirmishes", () => {
    const states = [
      createMission({ seed: 421, missionIndex: 0 }),
      createSkirmish(6482, 0).state,
    ];

    for (const state of states) {
      const plan = createMissionIntroPlan(state)!;
      expect(plan).not.toBeNull();
      expect(plan.durationMs).toBe(7_000);
      expect(plan.beats.map(({ id }) => id)).toEqual(["establish", "entry", "arrival", "deployment", "reveal"]);
      expect(sampleMissionIntroCameraPose(state, plan, plan.durationMs).pose.focus).toEqual({
        x: plan.yard.x,
        y: plan.yard.y,
      });
    }
  });

  it("tracks the convoy continuously and settles on the gameplay camera", () => {
    const state = createSkirmish(6482, 0).state;
    const plan = createMissionIntroPlan(state)!;
    const alternatePlan = createMissionIntroPlan(createSkirmish(6483, 0).state)!;
    const expectedBeats = [
      [0, 700 / 7_000],
      [700 / 7_000, 3_700 / 7_000],
      [3_700 / 7_000, 4_500 / 7_000],
      [4_500 / 7_000, 5_900 / 7_000],
      [5_900 / 7_000, 1],
    ];

    expect(plan.beats.map(({ start, end }) => [start, end])).toEqual(expectedBeats);
    expect(plan.cameraOffset).not.toEqual(alternatePlan.cameraOffset);

    const handoffCamera = { x: 0, y: 0, zoom: 1 };
    const hqGround = tileToScreen(plan.yard.x, plan.yard.y, handoffCamera, heightAt(state, plan.yard.x, plan.yard.y));
    handoffCamera.x = 1280 / 2 - hqGround.x;
    handoffCamera.y = 720 / 3 - hqGround.y;
    clampCamera(handoffCamera, cameraPanBounds(handoffCamera, state.width, state.height, 1280, 720));
    const finalPose = sampleMissionIntroCameraPose(state, plan, plan.durationMs).pose;
    expect(finalPose.focus).toEqual({ x: plan.yard.x, y: plan.yard.y });
    expect(finalPose.camera).toEqual(handoffCamera);
    expect(finalPose.zoom).toBe(1);
    expect(finalPose.screenY).toBe(1 / 3);

    for (const boundary of expectedBeats.slice(1).map(([start]) => start)) {
      const before = sampleMissionIntroCameraPose(state, plan, plan.durationMs * (boundary - 0.00001)).pose;
      const after = sampleMissionIntroCameraPose(state, plan, plan.durationMs * (boundary + 0.00001)).pose;
      expect(Math.hypot(after.focus.x - before.focus.x, after.focus.y - before.focus.y)).toBeLessThan(0.01);
      expect(Math.abs(after.zoom - before.zoom)).toBeLessThan(0.001);
      expect(Math.abs(after.screenY - before.screenY)).toBeLessThan(0.001);
    }

    let previousZoom = Number.POSITIVE_INFINITY;
    for (const progress of [0, 0.05, 0.1, 0.22, 0.36, 0.52, 0.64, 0.75, 0.9, 1]) {
      const pose = sampleMissionIntroCameraPose(state, plan, plan.durationMs * progress).pose;
      expect(pose.zoom).toBeGreaterThan(0.55);
      expect(pose.zoom).toBeLessThanOrEqual(previousZoom);
      expect(pose.camera.zoom).toBe(pose.zoom);
      expect(Number.isFinite(pose.camera.x) && Number.isFinite(pose.camera.y)).toBe(true);
      previousZoom = pose.zoom;
    }

    const established = sampleMissionIntroCameraPose(state, plan, 0).pose;
    const tracking = sampleMissionIntroCameraPose(state, plan, plan.durationMs * 0.4).pose;
    expect(established.zoom).toBe(plan.staging.establishZoom);
    expect(tracking.focus).not.toEqual(established.focus);

    for (const time of [0.1, 0.18, 0.28, 0.4, plan.beats[1]!.end, 0.7]) {
      const timeline = sampleMissionIntroTimeline(plan, plan.durationMs * time);
      const routePoint = pointAlongIntroRoute(plan, timeline.progress);
      const { camera } = sampleMissionIntroCameraPose(state, plan, plan.durationMs * time).pose;
      const screenPoint = tileToScreen(routePoint.x, routePoint.y, camera, heightAt(state, Math.round(routePoint.x), Math.round(routePoint.y)));
      expect(screenPoint.x).toBeGreaterThan(-90);
      expect(screenPoint.x).toBeLessThan(1280 + 90);
      expect(screenPoint.y).toBeGreaterThan(-100);
      expect(screenPoint.y).toBeLessThan(720 + 100);
    }
  });

  it("paces the convoy, anchoring, deployment, and base reveal", () => {
    const state = createSkirmish(6482, 0).state;
    const plan = createMissionIntroPlan(state)!;
    const reducedPlan = createMissionIntroPlan(state, true)!;
    const depart = sampleMissionIntroTimeline(plan, 0);
    const entry = plan.beats.find((beat) => beat.id === "entry")!;
    const arrival = plan.beats.find((beat) => beat.id === "arrival")!;
    const reveal = plan.beats.find((beat) => beat.id === "reveal")!;
    const halfwayIn = sampleMissionIntroTimeline(plan, plan.durationMs * ((entry.start + entry.end) / 2));
    const arrived = sampleMissionIntroTimeline(plan, plan.durationMs * entry.end);
    const anchoring = sampleMissionIntroTimeline(plan, plan.durationMs * ((arrival.start + arrival.end) / 2));
    const deploying = sampleMissionIntroTimeline(plan, plan.durationMs * 0.75);
    const deployed = sampleMissionIntroTimeline(plan, plan.durationMs * 0.82);
    const hqBuilt = sampleMissionIntroTimeline(plan, plan.durationMs * reveal.start);
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
    expect(missionIntroPhaseFor(plan, plan.durationMs * 0.57)).toBe("ANCHORING MOBILE HQ");
    expect(missionIntroPhaseFor(plan, plan.durationMs * 0.75)).toBe("UNFOLDING COMMAND HQ");
    expect(missionIntroPhaseFor(plan, plan.durationMs * 0.9)).toBe("COMMAND HQ ONLINE");

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

  it("provides valid seeded staging and continuous camera framing for every biome", () => {
    const state = createSkirmish(6482, 0).state;
    expect(Object.keys(MOBILE_HQ_DIRECTION_ART)).toHaveLength(8);
    expect(Object.keys(MISSION_INTRO_BIOMES).sort()).toEqual([...BIOMES].sort());

    const plans = BIOMES.map((biome) => {
      const biomeState = { ...state, biome };
      const plan = createMissionIntroPlan(biomeState)!;
      expect(plan.staging).toEqual(MISSION_INTRO_BIOMES[biome]);
      expect(createMissionIntroPlan(biomeState)!.cameraOffset).toEqual(plan.cameraOffset);
      expect(plan.staging.establishZoom).toBeGreaterThan(plan.staging.travelZoom);
      expect(plan.staging.travelZoom).toBeGreaterThan(1);
      expect(plan.route.at(-1)!.x).toBeCloseTo(plan.yard.x + (footprintOf("constructionYard").w - 1) / 2);
      expect(plan.route.at(-1)!.y).toBeCloseTo(plan.yard.y + (footprintOf("constructionYard").h - 1) / 2);
      expect(plan.route.every(({ x, y }) =>
        Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < state.width && y < state.height,
      )).toBe(true);
      return plan;
    });

    expect(new Set(plans.map((plan) => plan.staging.travelZoom)).size).toBeGreaterThan(5);
    expect(new Set(plans.map((plan) => plan.cameraOffset.x.toFixed(4) + ":" + plan.cameraOffset.y.toFixed(4))).size).toBeGreaterThan(1);
  });
});
