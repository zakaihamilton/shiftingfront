import { createCampaign } from "@/lib/gen/campaign";
import { generateMap } from "@/lib/gen/map";
import { createMission, tick } from "@/lib/sim/api";
import { expandFog } from "@/lib/sim/fog";
import { isStaticWalkable } from "@/lib/sim/world";
import { TICKS_PER_SECOND, UNIT_STATS } from "@/lib/catalog";
import type { AtlasWorld } from "@/lib/render/terrainAtlas";
import type { BuildingKind, UnitKind } from "@/lib/types";
import { burstsFromEvents, type FxBurst } from "@/lib/render/fx";
import {
  CINEMA_SCENARIO_KINDS,
  CINEMA_SEED,
  populateScenarioForces,
  type CinemaScenarioKind,
} from "./scenarios";
import { assignClashTargets } from "./combat";

export {
  CINEMA_SEED,
  CINEMA_SCENARIO_KINDS,
  type CinemaScenarioKind,
} from "./scenarios";

const CINEMA_REFERENCE_FPS = 60;

export type Actor = {
  x: number;
  y: number;
  kind: UnitKind;
  owner: 0 | 1;
  waypoints: { x: number; y: number }[];
  wi: number;
  speed: number;
};

export type Shot = { ax: number; ay: number; bx: number; by: number; life: number };

export function createCinemaScene(
  seed = CINEMA_SEED,
  missionIndex = 0,
  scenarioOverride?: CinemaScenarioKind,
) {
  const theater = ((seed | 0) % 10000 + 10000) % 10000;
  const campaign = createCampaign(theater);
  const mIndex = Math.max(0, Math.min(campaign.missions.length - 1, missionIndex | 0));
  const mission = campaign.missions[mIndex]!;
  const map = generateMap(theater, mission);
  const [us, them] = campaign.factions;
  const state = createMission({ seed: theater, missionIndex: mIndex });

  // Pick deterministic tactical scenario for variety across previews
  const scenarioIndex =
    theater >= 0 && theater < CINEMA_SCENARIO_KINDS.length
      ? theater
      : ((theater - CINEMA_SEED + mIndex) % CINEMA_SCENARIO_KINDS.length + CINEMA_SCENARIO_KINDS.length) % CINEMA_SCENARIO_KINDS.length;
  const scenarioKind = scenarioOverride ?? CINEMA_SCENARIO_KINDS[scenarioIndex]!;

  // Reveal the full battlefield for the preview reconnaissance feed
  state.fog = expandFog(state.fog, state.width, state.height);
  state.fog.fill(2);

  const ground: AtlasWorld = {
    seed: theater,
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
  const defendingOwner = (scenarioKind === "turretDefense" || scenarioKind === "infantryStorm" || scenarioKind === "convoyRaid") ? 0 : 1;
  const baseCenter = defendingOwner === 0 ? p0 : e0;

  // Search for an open walkable clash zone centered directly at the defending base
  let clashX = baseCenter.x;
  let clashY = baseCenter.y;
  for (let r = 0; r <= 8; r++) {
    let found = false;
    for (let dx = -r; dx <= r && !found; dx++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        if (isStaticWalkable(state, baseCenter.x + dx, baseCenter.y + dy)) {
          clashX = baseCenter.x + dx;
          clashY = baseCenter.y + dy;
          found = true;
        }
      }
    }
    if (found) break;
  }

  // Pre-calculated integer tile positions within widescreen PIP feed:
  // Defenders hold the base while attackers advance inward.
  const pSlots = [
    { x: clashX - 1, y: clashY + 1 }, // (32, 80)
    { x: clashX - 1, y: clashY },     // (80, 56)
    { x: clashX,     y: clashY + 1 }, // (80, 104)
    { x: clashX - 2, y: clashY },     // (32, 32)
  ];

  const eSlots = [
    { x: clashX + 1, y: clashY - 1 }, // (224, 80)
    { x: clashX,     y: clashY - 1 }, // (176, 56)
    { x: clashX + 1, y: clashY },     // (176, 104)
    { x: clashX,     y: clashY - 2 }, // (224, 32)
  ];

  // Clear distant base entities from createMission:
  // In the cinema highlight, only the localized clash units and buildings should exist.
  // This completely eliminates AI director interference (such as sendHome orders) that causes units
  // to flap and shift back and forth between advancing and retreating to a distant base.
  state.entities = [];

  const { pUnits, eUnits } = populateScenarioForces(
    state,
    scenarioKind,
    pSlots,
    eSlots,
    clashX,
    clashY,
  );

  const fx: FxBurst[] = [];
  let nextFxId = 1;

  const reassignTargets = () => assignClashTargets(state, clashX, clashY);

  // Fast-forward ticks to bring combat into full swing
  for (let t = 0; t < 18; t++) {
    const { events } = tick(state, undefined, { evaluateObjectives: false });
    state.fog.fill(2);
    for (const u of [...pUnits, ...eUnits]) {
      if (u.orderDestination && Math.hypot(u.orderDestination.x - clashX, u.orderDestination.y - clashY) > 4) {
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
        nextFxId,
      );
      nextFxId = spawned.nextId;
      fx.push(...spawned.bursts);
    }
  }
  for (const u of [...pUnits, ...eUnits]) {
    u.path = [];
    u.routePending = false;
    u.orderDestination = undefined;
    u.orderMode = undefined;
  }
  reassignTargets();
  state.fog.fill(2);

  const buildings: { x: number; y: number; kind: BuildingKind; owner: 0 | 1 }[] = state.entities
    .filter((e) => e.class === "building" && e.hp > 0)
    .map((b) => ({ x: b.x, y: b.y, kind: b.kind as BuildingKind, owner: b.owner as 0 | 1 }));

  // Active combat actors for backward-compatibility and tests
  const combatActors = [...pUnits, ...eUnits];
  const actors: Actor[] = combatActors.map((u, i) => {
    const opp = u.owner === 0 ? eUnits[i % eUnits.length]! : pUnits[i % pUnits.length]!;
    return {
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

  return {
    seed: theater,
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
    combatEpicenter,
    simulationAccumulatorMs: 0,
    lastStepMs: undefined as number | undefined,
  };
}

export type CinemaScene = ReturnType<typeof createCinemaScene>;
