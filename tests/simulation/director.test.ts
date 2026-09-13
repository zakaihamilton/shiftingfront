import { describe, expect, it } from "vitest";
import { createMission } from "../../lib/sim/api";
import { directorTimeline, tickMissionDirector } from "../../lib/sim/director";
import { createTutorialMission } from "../../lib/sim/tutorial";
import { createCampaign } from "../../lib/gen/campaign";
import { profileContractFor, resolveMissionProfile } from "../../lib/gen/profile";

describe("mission director", () => {
  it("uses the full escort operation deadline for its finale", () => {
    const campaign = createCampaign(421);
    const mission = campaign.missions.find((item) => item.win.kind === "escort");
    expect(mission).toBeDefined();
    const state = createMission({ seed: 421, missionIndex: mission!.index });
    const runtime = state.runtime!;
    const timeline = directorTimeline(state);
    const expectedDuration = Math.max(state.tick + 360, runtime.deadline!);
    const contract = profileContractFor(resolveMissionProfile(state.seed, state.missionIndex, state.win.kind));

    expect(timeline.finaleStart).toBe(Math.max(timeline.pressureStart + 360, Math.round(expectedDuration * Math.max(0.75, contract.finaleRatio))));
  });

  it("escalates a mission with deterministic reserve waves", () => {
    const state = createMission({ seed: 2, missionIndex: 0 });
    const director = state.runtime?.director;
    expect(director).toBeDefined();
    expect(director?.phase).toBe("opening");

    const beforePressure = state.entities.filter((entity) => entity.owner === 1 && entity.class === "unit").length;
    state.tick = director!.pressureStart;
    const pressureEvents = tickMissionDirector(state);

    expect(state.runtime?.director?.phase).toBe("pressure");
    expect(state.runtime?.director?.eventCount).toBe(1);
    expect(state.entities.filter((entity) => entity.owner === 1 && entity.class === "unit").length).toBeGreaterThan(beforePressure);
    expect(pressureEvents).toHaveLength(1);
    expect(pressureEvents[0]).toMatchObject({
      type: "alert",
      kind: "objective",
      text: expect.stringContaining("Enemy activity is rising — secure the resource lanes."),
    });

    const beforeFinale = state.entities.filter((entity) => entity.owner === 1 && entity.class === "unit").length;
    state.tick = director!.finaleStart;
    const finaleEvents = tickMissionDirector(state);

    expect(state.runtime?.director?.phase).toBe("finale");
    expect(state.runtime?.director?.eventCount).toBe(2);
    expect(state.entities.filter((entity) => entity.owner === 1 && entity.class === "unit").length).toBeGreaterThan(beforeFinale);
    expect(finaleEvents).toHaveLength(1);
    expect(finaleEvents[0]).toMatchObject({ type: "alert", kind: "objective" });
    expect(finaleEvents[0]).toMatchObject({ text: expect.stringMatching(/Final enemy push|regrouping around/) });
  });

  it("does not repeat a phase event after a save is ticked again", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const director = state.runtime!.director!;
    state.tick = director.pressureStart;

    expect(tickMissionDirector(state)).toHaveLength(1);
    expect(tickMissionDirector(state)).toEqual([]);
    expect(state.runtime!.director!.eventCount).toBe(1);
  });

  it("warns once when an enemy enters the HQ threat radius", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const yard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard")!;
    const enemy = state.entities.find((entity) => entity.owner === 1 && entity.class === "unit" && entity.kind !== "harvester")!;
    enemy.x = yard.x + 8;
    enemy.y = yard.y;
    state.tick = 6;

    const first = tickMissionDirector(state);
    expect(first).toMatchObject([{ type: "alert", kind: "warning", text: expect.stringContaining("HQ threat") }]);
    expect(state.runtime?.hqThreatActive).toBe(true);
    expect(tickMissionDirector(state)).toEqual([]);

    enemy.x += 10;
    state.tick = 12;
    tickMissionDirector(state);
    enemy.x = yard.x + 8;
    state.tick = 18;
    expect(tickMissionDirector(state)).toMatchObject([{ type: "alert", kind: "warning" }]);
  });

  it("telegraphs pressure before the profile wave arrives", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const director = state.runtime!.director!;
    const contract = profileContractFor(resolveMissionProfile(state.seed, state.missionIndex, state.win.kind));
    state.tick = Math.max(0, director.pressureStart - 120);

    const events = tickMissionDirector(state);

    expect(state.runtime!.director!.phase).toBe("opening");
    expect(events).toMatchObject([{
      type: "alert",
      kind: "objective",
      text: expect.stringContaining(contract.alert),
    }]);
    expect(events[0]).toMatchObject({ text: expect.stringContaining("two minutes") });
  });

  it("keeps profile finales behind the legacy late-mission floor", () => {
    for (const seed of [0, 421, 9999]) {
      for (const missionIndex of [0, 2, 5]) {
        const state = createMission({ seed, missionIndex });
        const timeline = directorTimeline(state);
        const horizon = state.runtime?.deadline ?? state.win.ticks ?? 3600;
        expect(timeline.finaleStart).toBeGreaterThanOrEqual(Math.round(horizon * 0.75));
      }
    }
  });

  it("keeps the initial pressure reinforcement at one unit", () => {
    const state = createMission({ seed: 421, missionIndex: 4 });
    const director = state.runtime!.director!;
    const before = state.entities.filter((entity) => entity.owner === 1 && entity.class === "unit").length;
    state.tick = director.pressureStart;
    tickMissionDirector(state);
    const after = state.entities.filter((entity) => entity.owner === 1 && entity.class === "unit").length;
    expect(after - before).toBeLessThanOrEqual(1);
  });

  it("delays one pressure wave when the player needs recovery and caps the delay", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const director = state.runtime!.director!;
    const yard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard")!;
    const originalPressureStart = director.pressureStart;
    yard.hp = yard.maxHp * 0.5;
    state.tick = originalPressureStart;

    const recoveryEvents = tickMissionDirector(state);

    expect(state.runtime!.director!.phase).toBe("opening");
    expect(state.runtime!.director!.pressureStart).toBe(originalPressureStart + 180);
    expect(recoveryEvents[0]).toMatchObject({ text: expect.stringContaining("recover") });

    state.tick = director.pressureStart;
    const delayedEvents = tickMissionDirector(state);
    expect(state.runtime!.director!.phase).toBe("pressure");
    expect(state.runtime!.director!.pressureStart).toBe(originalPressureStart + 180);
    expect(delayedEvents).toMatchObject([{ type: "alert", kind: "objective" }]);
  });

  it("delays a vulnerable finale only within the mission horizon", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const director = state.runtime!.director!;
    const yard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard")!;
    yard.hp = yard.maxHp * 0.5;
    director.phase = "pressure";
    state.tick = director.finaleStart;
    const originalFinaleStart = director.finaleStart;

    const events = tickMissionDirector(state);

    expect(state.runtime!.director!.phase).toBe("pressure");
    expect(state.runtime!.director!.finaleStart).toBe(originalFinaleStart + 180);
    expect(state.runtime!.director!.finaleStart).toBeLessThanOrEqual(Math.floor((state.runtime!.deadline ?? 3600) * 0.9));
    expect(events[0]).toMatchObject({ text: expect.stringContaining("recover") });
  });

  it("does not run director events during tutorial training, including legacy state", () => {
    const state = createTutorialMission();
    expect(state.runtime?.director).toBeUndefined();

    const runtime = state.runtime!;
    runtime.director = {
      phase: "opening",
      pressureStart: 720,
      finaleStart: 2700,
      eventCount: 0,
    };
    const beforeUnits = state.entities.filter((entity) => entity.owner === 1 && entity.class === "unit").length;
    state.tick = runtime.director.finaleStart;

    expect(tickMissionDirector(state)).toEqual([]);
    expect(runtime.director.phase).toBe("opening");
    expect(runtime.director.eventCount).toBe(0);
    expect(state.entities.filter((entity) => entity.owner === 1 && entity.class === "unit").length).toBe(beforeUnits);
  });
});
