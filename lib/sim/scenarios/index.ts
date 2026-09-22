import { isSupportUnit, UNIT_STATS } from "../../catalog";
import type { Rng } from "../../seed/rng";
import type { GeneratedMap } from "../../gen/map";
import type {
  Entity,
  ReadonlyMissionDef,
  MissionKind,
  MissionRuntime,
  SimEvent,
  SimState,
  Vec2,
} from "../../types";
import { secondaryObjectivesForMission } from "../../gen/objectives";
import { inObjectiveZone, isUnitEntity } from "../../types";
import { CONVOY_COMPLETION_BUFFER_TICKS, CONVOY_STAGING_TICKS } from "../../gen/pacing";
import { resolveMissionProfile } from "../../gen/profile";
import { spawnBuildingAt, spawnUnit } from "../world";
import { enemyApproachPoint, objectiveBuildingFilter, reachableScenarioCells, reachableScenarioPoint } from "./reachability";
import { convoyStartPoint, convoyZonePoint, tickEscort } from "./escort";
import { extractionPoints, rescuePoint, rescuePoints, tickRescueExtraction } from "./rescueExtraction";
import { inRescueFlank } from "../../gen/map/generator/rescuePlacement";
import type { ScenarioDefinition, ScenarioSetupContext, ScenarioSetupResult } from "./contract";
import { evaluateElimination, evaluateExtractionEscort, evaluateSabotage } from "./evaluators";
import { entitiesFor } from "../ecs/world";

export { CONVOY_COMPLETION_BUFFER_TICKS, CONVOY_STAGING_TICKS };
export { scenarioAffordances, type ScenarioAffordances } from "./affordances";
export { evaluateElimination, evaluateExtractionEscort, evaluateZoneHold, evaluateSabotage, isEntityAlive } from "./evaluators";
export type { ScenarioDefinition, ScenarioProgress, ScenarioSetupContext, ScenarioSetupResult } from "./contract";

export const DEADLINE_SCENARIO_KINDS: readonly MissionKind[] = ["escort", "sabotage", "rescue", "extraction"];

function setupClassicScenario({ state, mission }: ScenarioSetupContext): ScenarioSetupResult {
  return { targetIds: state.win.targetIds ?? [...(mission.win.targetIds ?? [])] };
}

function setupDestroyMarkedScenario({ state, map, mission, rng, reachable }: ScenarioSetupContext): ScenarioSetupResult {
  const ids: number[] = [];
  const spots = map.markedSpots.length
    ? map.markedSpots
    : [enemyApproachPoint(map, 10, -2), enemyApproachPoint(map, 10, 2)];
  const count = mission.win.targetCount ?? 1;
  const alliedBase = entitiesFor(state).filter((entity): entity is Extract<Entity, { class: "building" }> =>
    entity.owner === 0 && entity.class === "building" && entity.hp > 0,
  );
  for (let i = 0; i < count; i++) {
    const spot = spots[i] ?? enemyApproachPoint(map, 10 + i * 3, i % 2 === 0 ? -2 : 2);
    // Duplicate "objective" keeps the old 2/3 objective, 1/3 factory mix
    // (the previous pick listed "refinery", which was remapped to objective).
    const kind = rng.pick(["objective", "factory", "objective"] as const);
    const placed = spawnBuildingAt(
      state,
      1,
      kind,
      spot.x,
      spot.y,
      0,
      true,
      objectiveBuildingFilter(state, kind, reachable, alliedBase),
      24,
    );
    if (placed) ids.push(placed.id);
  }
  return { targetIds: ids };
}

function setupTimedScenario({ state, map, mission, profile, reachable, rng }: ScenarioSetupContext): ScenarioSetupResult {
  const kind = mission.win.kind;
  const targetIds: number[] = [];
  const contestedRoute = profile.variant === "contestedRoute";
  const count = mission.win.targetCount ?? 2;
  const rescueLocations = kind === "rescue"
    ? rescuePoints(state, map, count, reachable)
    : undefined;
  const extractionLocations = kind === "extraction"
    ? extractionPoints(state, map, count, reachable, rng)
    : undefined;
  const spawnScenarioPatrols = (index: number, target: Entity, center: Vec2): void => {
    const patrolCount = kind === "rescue"
      ? contestedRoute ? 2 : 1
      : contestedRoute ? mission.index >= 4 ? index === 0 ? 2 : 1 : 2 : index === 0 ? 1 : 0;
    for (let patrolIndex = 0; patrolIndex < patrolCount; patrolIndex++) {
      const side = (index + patrolIndex) % 2 === 0 ? 1 : -1;
      const patrolPoint = reachableScenarioPoint(
        state,
        { x: center.x + side * 4, y: center.y - side * 3 },
        reachable,
      );
      const patrol = spawnUnit(
        state,
        1,
        patrolIndex === 0
          ? (index % 2 === 0 ? "infantry" : "antiArmor")
          : kind === "extraction" ? "infantry" : "antiArmor",
        patrolPoint.x,
        patrolPoint.y,
      );
      patrol.stance = "defensive";
      patrol.idle = true;
      patrol.scenarioGuardTargetId = target.id;
    }
  };

  if (kind === "sabotage") {
    for (let i = 0; i < count; i++) {
      // Keep sabotage targets well beyond the allied base perimeter. The first
      // legacy placement sat on top of the allied approach, which made a
      // technically reachable contract behave like an attrition wall for the
      // competent baseline. The contested variant keeps its wider spacing
      // while both routes still lead into the enemy approach.
      const depth = 12;
      const spacing = 4;
      const spot = map.markedSpots[i] ?? enemyApproachPoint(map, depth + i * spacing, i % 2 === 0 ? -2 : 2);
      const alliedBase = entitiesFor(state).filter((entity): entity is Extract<Entity, { class: "building" }> =>
        entity.owner === 0 && entity.class === "building" && entity.hp > 0,
      );
      const objective = spawnBuildingAt(
        state,
        1,
        "objective",
        spot.x,
        spot.y,
        0,
        true,
        objectiveBuildingFilter(state, "objective", reachable, alliedBase),
        24,
      );
      if (objective) targetIds.push(objective.id);
    }
  } else {
    for (let i = 0; i < count; i++) {
      const desired = kind === "escort"
        ? convoyStartPoint(map, i)
        : kind === "rescue"
          ? rescueLocations?.[i] ?? rescuePoint(map, i, count)
          : extractionLocations?.[i] ?? map.playerStart;
      // Rescue locations have already been validated against terrain and
      // reachability as a group. Re-running the nearest-point scan here would
      // allow a later target to snap onto an earlier one and needlessly repeat
      // the full map scan.
      const point = kind === "rescue" && rescueLocations?.[i]
        ? rescueLocations[i]!
        : reachableScenarioPoint(
          state,
          desired,
          reachable,
          undefined,
          kind === "rescue" ? (x, y) => inRescueFlank(map, x, y) : undefined,
        );
      const target = spawnUnit(state, 0, kind === "escort" ? "convoyTruck" : "infantry", point.x, point.y);
      target.neutral = kind === "escort" || kind === "rescue" || kind === "extraction";
      target.scenarioRole = kind === "escort" ? "convoy" : kind === "rescue" ? "stranded" : "cargo";
      if (kind === "extraction") target.marked = true;
      if (kind === "escort" || kind === "extraction") {
        target.maxHp *= 12;
        target.hp = target.maxHp;
      }
      targetIds.push(target.id);

      // Rescue and extraction should create a tactical problem, not a safe
      // waypoint check. Contestable routes get a second guard at each stop;
      // late extraction missions add that second guard at the extraction
      // approach while keeping one perimeter guard at later return stops.
      // The extra guards share the target assignment but use opposite
      // perimeter offsets, forcing the player to choose an approach and keep
      // an escort nearby instead of sending a single click-to-contact force.
      // Extraction guards are deferred until every cargo unit is spawned so
      // their perimeter positions cannot displace a later cargo unit.
      if (kind === "rescue") spawnScenarioPatrols(i, target, point);
    }
  }

  if (kind === "extraction") {
    for (const [index, id] of targetIds.entries()) {
      const target = entitiesFor(state).find((entity) => entity.id === id);
      if (target) spawnScenarioPatrols(index, target, { x: target.x, y: target.y });
    }
  }

  return {
    targetIds,
    required: count,
    convoyStartTick: kind === "escort" ? CONVOY_STAGING_TICKS : undefined,
    zone: kind === "escort" ? convoyZonePoint(state, map, contestedRoute, reachable) : map.playerStart,
    deadline: state.tick + (mission.win.ticks ?? 3600) + (kind === "escort" ? CONVOY_STAGING_TICKS + CONVOY_COMPLETION_BUFFER_TICKS : 0),
  };
}

function deadlineForScenario(state: SimState): number | undefined {
  if (!state.runtime || !DEADLINE_SCENARIO_KINDS.includes(state.runtime.kind)) return undefined;
  return state.runtime.deadline ?? state.win.ticks;
}

function classicDefinition(kind: MissionKind, label: string, targetLabel: string): ScenarioDefinition {
  return {
    kind,
    presentation: { label, targetLabel },
    setup: setupClassicScenario,
    tick: () => undefined,
    progress: () => undefined,
    isComplete: () => undefined,
    targetLost: () => false,
    deadline: () => undefined,
  };
}

const scenarioDefinitions: Record<MissionKind, ScenarioDefinition> = {
  harvestQuota: classicDefinition("harvestQuota", "Harvest quota", "Credits"),
  forceQuota: classicDefinition("forceQuota", "Force quota", "Units"),
  structureQuota: classicDefinition("structureQuota", "Structure quota", "Buildings"),
  destroyMarked: {
    ...classicDefinition("destroyMarked", "Destroy marked", "Targets"),
    setup: setupDestroyMarkedScenario,
    progress: (state) => evaluateElimination(state, {
      targetIds: state.win.targetIds ?? state.runtime?.targetIds ?? [],
      label: "Targets",
      fallbackToCount: false,
    }).progress,
    isComplete: (state) => evaluateElimination(state, {
      targetIds: state.win.targetIds ?? [],
    }).isComplete,
  },
  razeAll: classicDefinition("razeAll", "Raze all", "Buildings"),
  decapitate: classicDefinition("decapitate", "Decapitate", "Command HQ"),
  annihilate: classicDefinition("annihilate", "Annihilate", "Hostiles"),
  holdTheLine: classicDefinition("holdTheLine", "Hold the line", "Time"),
  escort: {
    ...classicDefinition("escort", "Escort", "Convoy"),
    setup: setupTimedScenario,
    tick: tickEscort,
    progress: (state) => evaluateExtractionEscort(state).progress,
    isComplete: (state) => evaluateExtractionEscort(state).isComplete,
    targetLost: (state) => evaluateExtractionEscort(state).isTargetLost,
    deadline: deadlineForScenario,
  },
  sabotage: {
    ...classicDefinition("sabotage", "Sabotage", "Systems"),
    setup: setupTimedScenario,
    progress: (state) => evaluateSabotage(state).progress,
    isComplete: (state) => evaluateSabotage(state).isComplete,
    targetLost: (state) => evaluateSabotage(state).isTargetLost,
    deadline: deadlineForScenario,
  },
  rescue: {
    ...classicDefinition("rescue", "Rescue", "Units"),
    setup: setupTimedScenario,
    tick: tickRescueExtraction,
    progress: (state) => evaluateExtractionEscort(state).progress,
    isComplete: (state) => evaluateExtractionEscort(state).isComplete,
    targetLost: (state) => evaluateExtractionEscort(state).isTargetLost,
    deadline: deadlineForScenario,
  },
  extraction: {
    ...classicDefinition("extraction", "Extraction", "Assets"),
    setup: setupTimedScenario,
    tick: tickRescueExtraction,
    progress: (state) => evaluateExtractionEscort(state).progress,
    isComplete: (state) => evaluateExtractionEscort(state).isComplete,
    targetLost: (state) => evaluateExtractionEscort(state).isTargetLost,
    deadline: deadlineForScenario,
  },
};

export const SCENARIO_DEFINITIONS: Readonly<Record<MissionKind, ScenarioDefinition>> = scenarioDefinitions;

export function scenarioDefinitionFor(kind: MissionKind): ScenarioDefinition {
  return SCENARIO_DEFINITIONS[kind];
}

/** Adds scenario targets and common runtime metadata to a freshly spawned mission. */
export function configureMissionScenario(
  state: SimState,
  map: GeneratedMap,
  mission: ReadonlyMissionDef,
  rng: Rng,
): void {
  const profile = resolveMissionProfile(state.seed, mission.index, mission.win.kind, mission.profile);
  const reachable = reachableScenarioCells(state);
  const definition = scenarioDefinitionFor(mission.win.kind);
  const setup = definition.setup({ state, map, mission, rng, profile, reachable });
  const targetIds = setup.targetIds;

  if (targetIds.length > 0 || mission.win.kind === "destroyMarked" || DEADLINE_SCENARIO_KINDS.includes(mission.win.kind)) {
    state.win.targetIds = targetIds;
  }

  const runtime: MissionRuntime = {
    kind: mission.win.kind,
    phase: "active",
    targetIds: state.win.targetIds ?? [...(mission.win.targetIds ?? [])],
    convoyStartTick: setup.convoyStartTick,
    zone: setup.zone,
    deadline: setup.deadline,
    rescued: 0,
    required: setup.required ?? mission.win.targetCount ?? 1,
    contactedIds: mission.win.kind === "rescue" ? [] : undefined,
    rescuedIds: mission.win.kind === "rescue" ? [] : undefined,
    secondary: secondaryObjectivesForMission(mission, rng),
  };
  state.runtime = runtime;
}

const EMPTY_EVENTS: SimEvent[] = [];

function emitScenarioEvent(events: SimEvent[] | undefined, event: SimEvent): void {
  events?.push(event);
}

export function tickScenario(state: SimState, eventSink?: SimEvent[], collectEvents = true): SimEvent[] {
  const runtime = state.runtime;
  if (!runtime || runtime.phase === "complete") return EMPTY_EVENTS;

  const events = collectEvents ? eventSink ?? [] : undefined;
  const rescueContactCount = runtime.kind === "rescue" ? runtime.contactedIds?.length ?? 0 : 0;
  const rescueReturnedCount = runtime.kind === "rescue" ? runtime.rescuedIds?.length ?? 0 : 0;

  scenarioDefinitionFor(runtime.kind).tick(state);

  if (runtime.kind === "escort") {
    const zone = runtime.zone;
    if (zone) {
      let rescued = 0;
      for (const id of runtime.targetIds) {
        const e = entitiesFor(state).find((item) => item.id === id && item.hp > 0);
        if (e && inObjectiveZone(e.x, e.y, zone)) {
          rescued += 1;
          // Convoys are neutral units, so they do not receive a normal move
          // order. Once a truck reaches the extraction zone, hold its exact
          // position instead of letting routing/avoidance pull it back out of
          // the radius on the next tick.
          if (e.scenarioRole === "convoy") {
            e.orderDestination = { x: e.x, y: e.y };
            e.path = [];
            e.flowGoal = undefined;
            e.routePending = false;
            e.idle = true;
          }
        }
      }
      runtime.rescued = rescued;
    }
  }

  if (runtime.kind === "rescue" && runtime.contactedIds !== undefined && runtime.rescuedIds !== undefined) {
    const contacted = runtime.contactedIds.length;
    const returned = runtime.rescuedIds.length;
    const required = runtime.required;
    if (rescueContactCount === 0 && contacted > 0) {
      emitScenarioEvent(events, {
        type: "objectiveMilestone",
        kind: "rescue",
        milestone: "firstContact",
        text: "First stranded unit contacted. Bring it back to Command HQ.",
      });
    }
    if (rescueContactCount < required && contacted >= required) {
      emitScenarioEvent(events, {
        type: "objectiveMilestone",
        kind: "rescue",
        milestone: "allContacted",
        text: "All stranded units contacted. Escort them home.",
      });
    }
    if (rescueReturnedCount === 0 && returned > 0) {
      emitScenarioEvent(events, {
        type: "objectiveMilestone",
        kind: "rescue",
        milestone: "firstReturned",
        text: "First stranded unit returned. Keep the remaining route covered.",
      });
    }
    if (rescueReturnedCount < required && returned >= required) {
      emitScenarioEvent(events, {
        type: "objectiveMilestone",
        kind: "rescue",
        milestone: "complete",
        text: "All stranded units are home. Command HQ is secure.",
      });
    }
  }

  const yard = entitiesFor(state).find((e) => e.owner === 0 && e.kind === "constructionYard" && e.hp > 0);
  const preserve = runtime.secondary.find((objective) => objective.kind === "preserveYard");
  if (preserve) preserve.completed = !!yard;
  const timed = runtime.secondary.find((objective) => objective.kind === "completeBefore");
  if (timed && timed.target !== undefined) timed.completed = state.tick < timed.target;
  const keepUnits = runtime.secondary.find((objective) => objective.kind === "keepUnits");
  if (keepUnits) keepUnits.completed = entitiesFor(state).some((entity) =>
    entity.owner === 0 && isUnitEntity(entity) && entity.hp > 0 && !entity.neutral
      && UNIT_STATS[entity.kind].damage > 0 && !isSupportUnit(entity.kind),
  );
  return eventSink ? EMPTY_EVENTS : events ?? EMPTY_EVENTS;
}
