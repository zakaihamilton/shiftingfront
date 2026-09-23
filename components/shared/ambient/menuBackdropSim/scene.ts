import { createCampaign } from "@/lib/gen/campaign";
import { generateMap } from "@/lib/gen/map";
import { createMission } from "@/lib/sim/api";
import { createScenarioRunner } from "@/lib/sim/scenarioRunner";
import { assignMove } from "@/lib/sim/ai/combat";
import { expandFog } from "@/lib/sim/fog";
import { isStaticWalkable } from "@/lib/sim/world";
import { TICKS_PER_SECOND, UNIT_STATS } from "@/lib/catalog";
import type { AtlasWorld } from "@/lib/render/terrainAtlas";
import type { BuildingKind, UnitKind, Vec2 } from "@/lib/types";
import { burstsFromEvents, type FxBurst } from "@/lib/render/fx";
import {
  CINEMA_SCENARIO_KINDS,
  CINEMA_SEED,
  CINEMA_SCENARIOS,
  populateScenarioForces,
  type CinemaScenarioKind,
  type CinemaScenarioAnchor,
} from "./scenarios";
import { assignClashTargets } from "./combat";

export {
  CINEMA_SEED,
  CINEMA_SCENARIO_KINDS,
  type CinemaScenarioKind,
} from "./scenarios";

const CINEMA_REFERENCE_FPS = 60;

export type Actor = {
  entityId: number;
  x: number;
  y: number;
  kind: UnitKind;
  owner: 0 | 1;
  waypoints: { x: number; y: number }[];
  wi: number;
  speed: number;
};

export type Shot = { ax: number; ay: number; bx: number; by: number; life: number };

function walkableNear(state: ReturnType<typeof createMission>, preferred: { x: number; y: number }): { x: number; y: number } {
  for (let r = 0; r <= 12; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.round(preferred.x + dx);
        const y = Math.round(preferred.y + dy);
        if (isStaticWalkable(state, x, y)) return { x, y };
      }
    }
  }
  return { x: Math.round(preferred.x), y: Math.round(preferred.y) };
}

function nearestResourceAnchor(
  state: ReturnType<typeof createMission>,
  preferred: { x: number; y: number },
): { x: number; y: number } {
  let best = preferred;
  let bestDistance = Infinity;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if ((state.resourceAmount[y * state.width + x] ?? 0) <= 0) continue;
      if (!isStaticWalkable(state, x, y)) continue;
      const distance = Math.hypot(x - preferred.x, y - preferred.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x, y };
      }
    }
  }
  return walkableNear(state, best);
}

function scenarioAnchor(
  state: ReturnType<typeof createMission>,
  anchor: CinemaScenarioAnchor,
  playerStart: { x: number; y: number },
  enemyStart: { x: number; y: number },
): { x: number; y: number } {
  if (anchor === "playerBase") return walkableNear(state, playerStart);
  if (anchor === "enemyBase") return walkableNear(state, enemyStart);
  if (anchor === "resourceField") {
    const preferred = state.entities.find((entity) => entity.owner === 1 && entity.class === "building" && entity.kind === "refinery");
    return nearestResourceAnchor(state, preferred ?? enemyStart);
  }
  return walkableNear(state, {
    x: (playerStart.x + enemyStart.x) / 2,
    y: (playerStart.y + enemyStart.y) / 2,
  });
}

function clampRoutePoint(state: ReturnType<typeof createMission>, point: Vec2): Vec2 {
  return {
    x: Math.max(1, Math.min(state.width - 2, Math.round(point.x))),
    y: Math.max(1, Math.min(state.height - 2, Math.round(point.y))),
  };
}

export function createCinemaScene(
  seed = CINEMA_SEED,
  missionIndex = 0,
  scenarioOverride?: CinemaScenarioKind,
) {
  const campaignSeed = ((seed | 0) % 10000 + 10000) % 10000;
  const campaign = createCampaign(campaignSeed);
  const mIndex = Math.max(0, Math.min(campaign.missions.length - 1, missionIndex | 0));
  const mission = campaign.missions[mIndex]!;
  const map = generateMap(campaignSeed, mission);
  const [us, them] = campaign.factions;
  const state = createMission({ seed: campaignSeed, missionIndex: mIndex });

  // Pick deterministic tactical scenario for variety across previews
  const scenarioIndex =
    campaignSeed >= 0 && campaignSeed < CINEMA_SCENARIO_KINDS.length
      ? campaignSeed
      : ((campaignSeed - CINEMA_SEED + mIndex) % CINEMA_SCENARIO_KINDS.length + CINEMA_SCENARIO_KINDS.length) % CINEMA_SCENARIO_KINDS.length;
  const scenarioKind = scenarioOverride ?? CINEMA_SCENARIO_KINDS[scenarioIndex]!;
  const scenarioDef = CINEMA_SCENARIOS[scenarioKind];

  // Reveal the full battlefield for the preview reconnaissance feed
  state.fog = expandFog(state.fog, state.width, state.height);
  state.fog.fill(2);

  const ground: AtlasWorld = {
    seed: campaignSeed,
    missionIndex: mIndex,
    biome: map.biome,
    width: map.width,
    height: map.height,
    tiles: map.tiles,
    heights: map.heights,
    surfaces: map.surfaces,
    resourceAmount: map.resourceAmount,
  };

  const p0 = map.playerStart;
  const e0 = map.enemyStart;
  const anchor = scenarioAnchor(state, scenarioDef.anchor, p0, e0);

  const clash = walkableNear(state, anchor);
  const clashX = clash.x;
  const clashY = clash.y;

  // Clear distant base entities from createMission:
  // In the cinema highlight, only the localized clash units and buildings should exist.
  // This completely eliminates AI director interference (such as sendHome orders) that causes units
  // to flap and shift back and forth between advancing and retreating to a distant base.
  state.entities = [];

  const { pUnits, eUnits, objectiveTarget } = populateScenarioForces(
    state,
    scenarioKind,
    clashX,
    clashY,
  );
  const convoyRoute = scenarioKind === "convoyRaid" && objectiveTarget?.class === "unit"
    ? [
        clampRoutePoint(state, { x: objectiveTarget.x + 3, y: objectiveTarget.y + 3 }),
        clampRoutePoint(state, { x: objectiveTarget.x - 3, y: objectiveTarget.y - 3 }),
      ]
    : undefined;

  const fx: FxBurst[] = [];
  let fxSequence = 1;

  const reassignTargets = () => assignClashTargets(
    state,
    scenarioKind,
    objectiveTarget?.id,
    clashX,
    clashY,
    10,
  );

  // Fast-forward ticks to bring combat into full swing
  const scenarioRunner = createScenarioRunner(state, { evaluateObjectives: false });
  for (let t = 0; t < 18; t++) {
    const { events } = scenarioRunner.step();
    state.fog.fill(2);
    for (const u of [...pUnits, ...eUnits]) {
      if (u.orderDestination && Math.hypot(u.orderDestination.x - clashX, u.orderDestination.y - clashY) > 10) {
        u.path = [];
        u.routePending = false;
        u.orderDestination = undefined;
        u.attackTarget = undefined;
        u.orderMode = undefined;
      }
    }
    reassignTargets();
    const destroyedEvents = events.filter((event) => event.type === "destroyed");
    if (destroyedEvents.length) {
      const spawned = burstsFromEvents(
        destroyedEvents,
        state,
        performance.now() - (18 - t) * 50,
        fxSequence,
      );
      fxSequence = spawned.nextId;
      fx.push(...spawned.bursts);
    }
  }
  for (const u of [...pUnits, ...eUnits]) {
    u.path = [];
    u.routePending = false;
    u.orderDestination = undefined;
    u.orderMode = undefined;
  }
  if (convoyRoute && objectiveTarget?.class === "unit") {
    assignMove(state, objectiveTarget, convoyRoute[0]!);
  }
  reassignTargets();
  state.fog.fill(2);

  const buildings: { x: number; y: number; kind: BuildingKind; owner: 0 | 1 }[] = state.entities
    .filter((e) => e.class === "building" && e.hp > 0)
    .map((b) => ({ id: b.id, x: b.x, y: b.y, kind: b.kind as BuildingKind, owner: b.owner as 0 | 1 }));

  // Active combat actors for backward-compatibility and tests
  const combatActors = [...pUnits, ...eUnits];
  const actors: Actor[] = combatActors.map((u, i) => {
    const opp = u.owner === 0 ? eUnits[i % eUnits.length]! : pUnits[i % pUnits.length]!;
    return {
      entityId: u.id,
      x: u.x,
      y: u.y,
      kind: u.kind as UnitKind,
      owner: u.owner as 0 | 1,
      waypoints: [
        { x: u.x + (opp.x - u.x) * 0.4, y: u.y + (opp.y - u.y) * 0.4 },
        { x: u.x, y: u.y },
      ],
      wi: 0,
      speed: (UNIT_STATS[u.kind as UnitKind].speed * TICKS_PER_SECOND) / CINEMA_REFERENCE_FPS,
    };
  });

  const combatEpicenter = { x: clashX, y: clashY };
  const cameraFocus = objectiveTarget
    ? { x: objectiveTarget.x, y: objectiveTarget.y }
    : combatEpicenter;
  const cameraFocusPoints = [
    actors[1],
    actors[0],
    buildings[0],
    actors[2],
    actors[3],
    buildings[1],
  ].map((focus) => ({ x: focus?.x ?? clashX, y: focus?.y ?? clashY }));

  return {
    seed: campaignSeed,
    missionIndex: mIndex,
    scenarioKind,
    map,
    us,
    them,
    ground,
    buildings,
    actors,
    state,
    fx,
    fxSequence,
    combatEpicenter,
    cameraFocus,
    cameraFocusPoints,
    scenarioTargetId: objectiveTarget?.id,
    convoyRoute,
    convoyRouteIndex: 0,
    cameraFramingEntities: state.entities.map((e) => ({
      class: e.class,
      kind: e.kind,
      x: e.x,
      y: e.y,
      hp: e.hp,
    })),
    simulationAccumulatorMs: 0,
    lastStepMs: undefined as number | undefined,
  };
}

export type CinemaScene = ReturnType<typeof createCinemaScene>;
