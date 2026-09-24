import { footprintOf, labelFor } from "../catalog";
import { isUnitEntity, type MissionDirectorPhase, type MissionRuntime, type SimEvent, type SimState, type UnitKind } from "../types";
import { missionDifficulty } from "./difficulty";
import { powerBreakdown, trySpawnUnit } from "./world";
import { objectiveContractFor, profileContractFor, resolveMissionProfile } from "../gen/profile";
import { entitiesFor } from "./entities";

const CLASSIC_DIRECTOR_DURATION = 3600;
const CLASSIC_DURATION_STEP = 480;
const PRESSURE_WARNING_TICKS = 120;
const RECOVERY_DELAY_TICKS = 180;
const MIN_FINALE_RATIO = 0.75;
const HQ_THREAT_RADIUS = 14;
const HQ_THREAT_SAMPLE_STRIDE = 6;

function missionHorizon(state: SimState): number {
  const convoyStaging = state.runtime?.kind === "escort" ? state.runtime.convoyStartTick ?? 0 : 0;
  return state.runtime?.deadline
    ?? (state.win.ticks ?? CLASSIC_DIRECTOR_DURATION + state.missionIndex * CLASSIC_DURATION_STEP) + convoyStaging;
}

export function directorTimeline(state: SimState): { pressureStart: number; finaleStart: number } {
  const profile = resolveMissionProfile(state.seed, state.missionIndex, state.win.kind);
  const contract = profileContractFor(profile);
  const duration = Math.max(360, missionHorizon(state));
  const difficulty = missionDifficulty(state.missionIndex);
  const pressureLimit = difficulty.enemyAssaultEvery + contract.pressureLimitOffset;
  const basePressureStart = state.runtime?.kind === "escort"
    ? Math.max(
        (state.runtime.convoyStartTick ?? 0) + 240,
        Math.round(duration * Math.max(0.28, contract.pressureRatio)),
      )
    : Math.min(
        Math.max(contract.pressureFloor, Math.round(duration * contract.pressureRatio)),
        pressureLimit,
      );
  const rescueGate = state.runtime?.kind === "rescue" && state.runtime.deadline !== undefined
    ? Math.floor(state.runtime.deadline * 0.25)
    : 0;
  const pressureStart = Math.max(basePressureStart, rescueGate);
  // Profiles may move the finale later, but never pull it ahead of the
  // legacy late-mission floor.
  const finaleStart = Math.max(pressureStart + 360, Math.round(duration * Math.max(MIN_FINALE_RATIO, contract.finaleRatio)));
  return { pressureStart, finaleStart };
}

export function ensureMissionDirector(state: SimState): MissionRuntime | undefined {
  const runtime = state.runtime;
  if (!runtime) return undefined;
  if (state.tutorialStage !== undefined) return runtime;
  if (!runtime.director) {
    const timeline = directorTimeline(state);
    runtime.director = {
      phase: "opening",
      ...timeline,
      eventCount: 0,
    };
  }
  return runtime;
}

function phaseAt(state: SimState, director: NonNullable<MissionRuntime["director"]>): MissionDirectorPhase {
  if (state.runtime?.kind === "escort" && state.runtime.convoyStartTick !== undefined) return "opening";
  const rescue = state.runtime?.kind === "rescue" ? state.runtime : undefined;
  const rescueDeadline = rescue?.deadline ?? state.win.ticks;
  const rescueGate = rescueDeadline === undefined ? 0 : Math.floor(rescueDeadline * 0.25);
  if (rescue && (rescue.contactedIds?.length ?? 0) === 0 && state.tick < rescueGate) return "opening";
  if (state.tick >= director.finaleStart) return "finale";
  if (state.tick >= director.pressureStart) return "pressure";
  return "opening";
}

export function hqThreatened(state: SimState): boolean {
  const yard = entitiesFor(state).find(
    (entity) => entity.owner === 0 && entity.class === "building" && entity.kind === "constructionYard" && entity.hp > 0,
  );
  if (!yard) return false;
  return entitiesFor(state).some((entity) =>
    entity.owner === 1 && isUnitEntity(entity) && entity.hp > 0 && (
      entity.attackTarget === yard.id || Math.hypot(entity.x - yard.x, entity.y - yard.y) <= HQ_THREAT_RADIUS
    ),
  );
}

function reinforcementKinds(state: SimState, phase: MissionDirectorPhase): UnitKind[] {
  const profile = resolveMissionProfile(state.seed, state.missionIndex, state.win.kind);
  const contract = profileContractFor(profile);
  if (phase === "pressure") return [...contract.reinforcements];
  return state.missionIndex >= 4
    ? [...contract.reinforcements, "tank"]
    : [...contract.reinforcements];
}

function spawnReinforcements(state: SimState, phase: MissionDirectorPhase, recovering: boolean): number {
  const yard = entitiesFor(state).find(
    (entity) => entity.owner === 1 && entity.class === "building" && entity.kind === "constructionYard" && entity.hp > 0,
  );
  if (!yard) return 0;
  const footprint = footprintOf("constructionYard");
  const profile = resolveMissionProfile(state.seed, state.missionIndex, state.win.kind);
  const contract = profileContractFor(profile);
  // Keep the first pressure beat at the legacy one-unit scale. Profiles can
  // change which unit arrives and how much support follows in the finale,
  // but the opening warning should not turn into an abrupt difficulty jump.
  const plannedLimit = phase === "pressure" ? 1 : contract.reinforcementLimit;
  const limit = Math.max(1, plannedLimit - (recovering ? 1 : 0));
  let spawned = 0;
  for (const [index, kind] of reinforcementKinds(state, phase).slice(0, limit).entries()) {
    if (trySpawnUnit(state, 1, kind, yard.x - 1, yard.y + footprint.h + index)) spawned += 1;
  }
  return spawned;
}

function playerNeedsRecovery(state: SimState): boolean {
  const yard = entitiesFor(state).find(
    (entity) => entity.owner === 0 && entity.class === "building" && entity.kind === "constructionYard" && entity.hp > 0,
  );
  const combatForce = entitiesFor(state).some(
    (entity) => entity.owner === 0 && entity.class === "unit" && entity.hp > 0 && !entity.neutral &&
      entity.kind !== "harvester" && entity.kind !== "medic" && entity.kind !== "repairTruck",
  );
  return (yard !== undefined && yard.hp / Math.max(1, yard.maxHp) < 0.6)
    || powerBreakdown(state, 0).surplus < 0
    || !combatForce;
}

function delayForRecovery(
  state: SimState,
  field: "pressureStart" | "finaleStart",
): boolean {
  const runtime = state.runtime;
  const director = runtime?.director;
  if (!director || !playerNeedsRecovery(state)) return false;
  const baseline = directorTimeline(state)[field];
  const alreadyDelayed = Math.max(0, director[field] - baseline);
  const horizon = missionHorizon(state);
  const latestAllowed = Math.floor(horizon * 0.9);
  const delay = Math.min(
    RECOVERY_DELAY_TICKS,
    Math.max(0, profileContractFor(resolveMissionProfile(state.seed, state.missionIndex, state.win.kind)).maxRecoveryDelay - alreadyDelayed),
    Math.max(0, latestAllowed - director[field]),
  );
  if (delay <= 0) return false;
  director[field] += delay;
  if (field === "pressureStart") {
    director.finaleStart = Math.min(latestAllowed, Math.max(director.finaleStart, director.pressureStart + 360));
  }
  return true;
}

function phaseAlert(state: SimState, runtime: MissionRuntime, phase: MissionDirectorPhase): string {
  const profile = resolveMissionProfile(state.seed, state.missionIndex, runtime.kind);
  const profileAlert = profileContractFor(profile).alert;
  const objective = objectiveContractFor(runtime.kind);
  if (phase === "pressure") {
    if (objective) return `${objective.pressureAlert} Pressure is rising around ${objective.targetLabel}.`;
    if (runtime.kind === "escort") return `${profileAlert} Enemy reserves are moving on the convoy route.`;
    if (runtime.kind === "rescue") return `${profileAlert} Enemy patrols are closing on the rescue zone.`;
    if (runtime.kind === "extraction") return `${profileAlert} Enemy patrols are converging on the extraction route.`;
    return `${profileAlert} Enemy activity is rising — secure the resource lanes.`;
  }
  if (objective) return `${objective.pressureAlert} Final push — secure ${objective.targetLabel}.`;
  if (runtime.kind === "holdTheLine") return `${profileAlert} Final enemy push detected — hold the ${labelFor("constructionYard")}.`;
  if (runtime.kind === "sabotage" || runtime.kind === "destroyMarked") return `${profileAlert} Enemy reserves are regrouping around the marked targets.`;
  return `${profileAlert} Final enemy push detected — finish the operation now.`;
}

const EMPTY_EVENTS: SimEvent[] = [];

function missionAlert(
  eventSink: SimEvent[] | undefined,
  text: string,
  collectEvents: boolean,
  kind: "warning" | "objective" = "objective",
): SimEvent[] {
  const event = { type: "alert", kind, text } as const;
  if (!collectEvents) return EMPTY_EVENTS;
  if (eventSink) {
    eventSink.push(event);
    return EMPTY_EVENTS;
  }
  return [event];
}

export function tickMissionDirector(state: SimState, eventSink?: SimEvent[], collectEvents = true): SimEvent[] {
  if (state.result !== "playing" || state.tutorialStage !== undefined) return EMPTY_EVENTS;
  const runtime = ensureMissionDirector(state);
  if (!runtime?.director || runtime.phase === "complete") return EMPTY_EVENTS;
  const director = runtime.director;
  if (runtime.kind === "rescue" && state.tick % HQ_THREAT_SAMPLE_STRIDE === 0) {
    const threatened = hqThreatened(state);
    if (threatened && !runtime.hqThreatActive) {
      runtime.hqThreatActive = true;
      return missionAlert(eventSink, "HQ threat detected — pull a reserve back to Command HQ.", collectEvents, "warning");
    }
    if (!threatened && runtime.hqThreatActive) runtime.hqThreatActive = false;
  }
  const nextPhase = phaseAt(state, director);
  if (nextPhase === "opening" && state.tick === director.pressureStart - PRESSURE_WARNING_TICKS) {
    const profile = resolveMissionProfile(state.seed, state.missionIndex, runtime.kind);
    return missionAlert(eventSink, `${profileContractFor(profile).alert} Pressure expected in two minutes.`, collectEvents);
  }
  if (nextPhase === "pressure" && director.phase === "opening" && delayForRecovery(state, "pressureStart")) {
    return missionAlert(eventSink, "Pressure is building — use the delay to recover, repair, and reinforce.", collectEvents);
  }
  if (nextPhase === "finale" && delayForRecovery(state, "finaleStart")) {
    return missionAlert(eventSink, "Finale delayed — recover your line before the last push.", collectEvents);
  }
  if (nextPhase === director.phase) return EMPTY_EVENTS;

  const recovering = playerNeedsRecovery(state);
  director.phase = nextPhase;
  director.eventCount += 1;
  spawnReinforcements(state, nextPhase, recovering);
  return missionAlert(eventSink, phaseAlert(state, runtime, nextPhase), collectEvents);
}
