import { STARTING_CREDITS } from "../catalog";
import { assertValidSeed, createRng, mixSeed } from "../seed/rng";
import type { ReadonlyCampaign, ReadonlyMissionDef, SimEvent, SimState, UnitKind, Vec2 } from "../types";
import { createCampaign } from "../gen/campaign";
import { generateMap, type GeneratedMap } from "../gen/map";
import { makeFog, tickFog } from "./fog";
import { issue } from "./orders";
import { inspect } from "./objectives";
import { resetPathBudget } from "./pathBudget";
import { configureMissionScenario } from "./scenarios";
import { spawnBuildingAt, spawnUnit } from "./world";
import { createBaseState } from "./state";
import type { Command } from "../types";
import { missionDifficulty } from "./difficulty";
import { objectiveContractFor } from "../gen/profile";
import {
  applyQueuedCommands,
  createSimulationTickContext,
  ensureSimulationDirector,
  runSimulationSystems,
  type SimulationTickOptions,
} from "./pipeline";
import { withEntityWorldBatch, worldFor } from "./ecs/world";

export { issue, inspect };
export { CONVOY_COMPLETION_BUFFER_TICKS, CONVOY_STAGING_TICKS, scenarioAffordances, type ScenarioAffordances } from "./scenarios";

export type TickOptions = SimulationTickOptions;

const EMPTY_EVENTS: SimEvent[] = [];

export function createMission(opts: { seed: number; missionIndex: number }): SimState {
  assertValidSeed(opts.seed);
  const campaign = createCampaign(opts.seed);
  const mission = campaign.missions[opts.missionIndex];
  if (!mission) throw new Error(`No mission ${opts.missionIndex}`);
  const map = generateMap(opts.seed, mission);
  return createMissionFromData({ seed: opts.seed, missionIndex: opts.missionIndex, campaign, mission, map });
}

/** Create a mission from already-generated campaign and map data. */
export function createMissionFromData(opts: {
  seed: number;
  missionIndex: number;
  campaign: ReadonlyCampaign;
  mission: ReadonlyMissionDef;
  map: GeneratedMap;
}): SimState {
  assertValidSeed(opts.seed);
  const { campaign, mission, map } = opts;
  const rng = createRng(opts.seed, `mission-spawn:${opts.missionIndex}`);
  const difficulty = missionDifficulty(mission.index);

  const state = createBaseState({
    seed: opts.seed,
    missionIndex: opts.missionIndex,
    width: map.width,
    height: map.height,
    tiles: map.tiles,
    heights: map.heights,
    surfaces: map.surfaces,
    biome: map.biome,
    resourceAmount: map.resourceAmount,
    fog: makeFog(map.width, map.height, 0),
    credits: [STARTING_CREDITS.player, STARTING_CREDITS.enemy],
    win: {
      ...mission.win,
      targetIds: mission.win.targetIds ? [...mission.win.targetIds] : undefined,
    },
    rngState: mixSeed(opts.seed, `sim:${opts.missionIndex}`),
    // Campaigns are cached and frozen. Simulation state is mutable, so keep a
    // separate faction graph at this boundary.
    factions: campaign.factions.map((faction) => ({
      ...faction,
      palette: { ...faction.palette },
    })) as SimState["factions"],
    missionName: mission.name,
  });
  return withEntityWorldBatch(state, () => initializeMissionState(state, map, mission, rng, difficulty));
}

function initializeMissionState(
  state: SimState,
  map: GeneratedMap,
  mission: ReadonlyMissionDef,
  rng: ReturnType<typeof createRng>,
  difficulty: ReturnType<typeof missionDifficulty>,
): SimState {
  state.missionKind = mission.win.kind;
  state.aiState = "economy";

function baseOrientationVectors(from: Vec2, to: Vec2): { forward: Vec2; lateral: Vec2 } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const fx = Math.round(dx / len);
  const fy = Math.round(dy / len);
  const forwardX = fx !== 0 || fy !== 0 ? fx : 1;
  const forwardY = fx !== 0 || fy !== 0 ? fy : 1;
  return {
    forward: { x: forwardX, y: forwardY },
    lateral: { x: -forwardY, y: forwardX },
  };
}

function dirPoint(
  anchor: Vec2,
  forward: Vec2,
  lateral: Vec2,
  fDist: number,
  lDist: number,
  width: number,
  height: number,
): Vec2 {
  return {
    x: Math.max(3, Math.min(width - 4, Math.round(anchor.x + forward.x * fDist + lateral.x * lDist))),
    y: Math.max(3, Math.min(height - 4, Math.round(anchor.y + forward.y * fDist + lateral.y * lDist))),
  };
}

  const p = map.playerStart;
  const e = map.enemyStart;
  const pVecs = baseOrientationVectors(p, e);
  const eVecs = baseOrientationVectors(e, p);
  const offensiveMission = ["sabotage", "destroyMarked", "razeAll", "decapitate", "annihilate"].includes(mission.win.kind);

  // Player base layout
  spawnBuildingAt(state, 0, "constructionYard", p.x, p.y);
  const pPower = dirPoint(p, pVecs.forward, pVecs.lateral, -2, 2, state.width, state.height);
  spawnBuildingAt(state, 0, "power", pPower.x, pPower.y);
  const pRefinery = dirPoint(p, pVecs.forward, pVecs.lateral, 0, 3, state.width, state.height);
  spawnBuildingAt(state, 0, "refinery", pRefinery.x, pRefinery.y);
  const pHarvester = dirPoint(p, pVecs.forward, pVecs.lateral, 0, 4, state.width, state.height);
  spawnUnit(state, 0, "harvester", pHarvester.x, pHarvester.y);
  const pInfantry = dirPoint(p, pVecs.forward, pVecs.lateral, 3, 1, state.width, state.height);
  spawnUnit(state, 0, "infantry", pInfantry.x, pInfantry.y);

  if (mission.index >= 1 || offensiveMission) {
    const pTurret = dirPoint(p, pVecs.forward, pVecs.lateral, 4, 0, state.width, state.height);
    spawnBuildingAt(state, 0, "turret", pTurret.x, pTurret.y);
    const pBarracks = dirPoint(p, pVecs.forward, pVecs.lateral, 2, -2, state.width, state.height);
    spawnBuildingAt(state, 0, "barracks", pBarracks.x, pBarracks.y);
    const pAntiArmor = dirPoint(p, pVecs.forward, pVecs.lateral, 4, -1, state.width, state.height);
    spawnUnit(state, 0, "antiArmor", pAntiArmor.x, pAntiArmor.y);
  }
  if (mission.index >= 4 || offensiveMission || mission.win.kind === "holdTheLine") {
    const pTank = dirPoint(p, pVecs.forward, pVecs.lateral, 5, 0, state.width, state.height);
    spawnUnit(state, 0, "tank", pTank.x, pTank.y);
  }
  for (let turretIndex = 0; turretIndex < difficulty.offensiveStartingTurrets && offensiveMission; turretIndex += 1) {
    const pExtraTurret = dirPoint(p, pVecs.forward, pVecs.lateral, 3, 2 + turretIndex * 2, state.width, state.height);
    spawnBuildingAt(state, 0, "turret", pExtraTurret.x, pExtraTurret.y);
  }
  if (mission.index >= 3 || offensiveMission) {
    const pFactory = dirPoint(p, pVecs.forward, pVecs.lateral, -3, -2, state.width, state.height);
    spawnBuildingAt(state, 0, "factory", pFactory.x, pFactory.y);
  }
  if (mission.index === 0 && !offensiveMission) {
    const pBarracks = dirPoint(p, pVecs.forward, pVecs.lateral, 2, -2, state.width, state.height);
    spawnBuildingAt(state, 0, "barracks", pBarracks.x, pBarracks.y);
  }

  for (const building of worldFor(state).all().filter((entity) => entity.owner === 0 && entity.class === "building" && entity.hp > 0 && entity.constructing === 0)) {
    state.buildingsCompleted[0] += 1;
    state.buildingsCompletedByKind[building.kind] = (state.buildingsCompletedByKind[building.kind] ?? 0) + 1;
  }

  // Enemy base layout
  spawnBuildingAt(state, 1, "constructionYard", e.x, e.y);
  const ePower = dirPoint(e, eVecs.forward, eVecs.lateral, -2, 2, state.width, state.height);
  spawnBuildingAt(state, 1, "power", ePower.x, ePower.y);
  const eRefinery = dirPoint(e, eVecs.forward, eVecs.lateral, 0, 3, state.width, state.height);
  spawnBuildingAt(state, 1, "refinery", eRefinery.x, eRefinery.y);
  const eBarracks = dirPoint(e, eVecs.forward, eVecs.lateral, 2, -2, state.width, state.height);
  spawnBuildingAt(state, 1, "barracks", eBarracks.x, eBarracks.y);
  if (difficulty.startingTurret) {
    const eTurret = dirPoint(e, eVecs.forward, eVecs.lateral, 4, 0, state.width, state.height);
    spawnBuildingAt(state, 1, "turret", eTurret.x, eTurret.y);
  }
  const eHarvester = dirPoint(e, eVecs.forward, eVecs.lateral, 0, 4, state.width, state.height);
  spawnUnit(state, 1, "harvester", eHarvester.x, eHarvester.y);
  const eInfantry = dirPoint(e, eVecs.forward, eVecs.lateral, 3, 1, state.width, state.height);
  spawnUnit(state, 1, "infantry", eInfantry.x, eInfantry.y);
  if (difficulty.startingTank) {
    const eTank = dirPoint(e, eVecs.forward, eVecs.lateral, 4, -1, state.width, state.height);
    spawnUnit(state, 1, "tank", eTank.x, eTank.y);
  }

  const openingGuardKinds: UnitKind[] = ["infantry", "antiArmor", "tank"];
  for (let i = 0; i < difficulty.startingGuards; i++) {
    const guardPos = dirPoint(e, eVecs.forward, eVecs.lateral, 3 + Math.floor(i / 3), -2 + (i % 3) * 2, state.width, state.height);
    spawnUnit(state, 1, openingGuardKinds[i % openingGuardKinds.length]!, guardPos.x, guardPos.y);
  }

  const extraGuards = Math.floor(mission.index / 2);
  for (let i = 0; i < extraGuards; i++) {
    const extraGuardPos = dirPoint(e, eVecs.forward, eVecs.lateral, 4 + Math.floor(i / 2), i % 2 === 0 ? 2 : -2, state.width, state.height);
    spawnUnit(state, 1, i % 2 === 0 ? "infantry" : "antiArmor", extraGuardPos.x, extraGuardPos.y);
  }
  if (mission.index >= 3) {
    const eFactory = dirPoint(e, eVecs.forward, eVecs.lateral, -3, -2, state.width, state.height);
    spawnBuildingAt(state, 1, "factory", eFactory.x, eFactory.y);
    const eSecondTurret = dirPoint(e, eVecs.forward, eVecs.lateral, 4, -3, state.width, state.height);
    spawnBuildingAt(state, 1, "turret", eSecondTurret.x, eSecondTurret.y);
  }

  const assault =
    mission.win.kind === "razeAll" ||
    mission.win.kind === "decapitate" ||
    mission.win.kind === "annihilate" ||
    mission.win.kind === "destroyMarked";
  if (assault && difficulty.assaultSupport && (objectiveContractFor(mission.win.kind)?.startingSupport ?? true)) {
    const assaultTurret = dirPoint(e, eVecs.forward, eVecs.lateral, 3, 2, state.width, state.height);
    spawnBuildingAt(state, 1, "turret", assaultTurret.x, assaultTurret.y);
    const assaultTank = dirPoint(e, eVecs.forward, eVecs.lateral, 4, 1, state.width, state.height);
    spawnUnit(state, 1, "tank", assaultTank.x, assaultTank.y);
  }

  if (mission.win.kind === "holdTheLine") {
    const holdLineKinds: UnitKind[] = ["infantry", "antiArmor", "tank", "infantry", "antiArmor", "tank", "infantry", "antiArmor"];
    // The hold objective already receives periodic pressure waves. Keep one
    // opening reinforcement slot available for the player's defensive setup.
    const openingHoldReinforcements = Math.max(0, difficulty.holdLineReinforcements - 1);
    for (let i = 0; i < openingHoldReinforcements; i++) {
      const kind = holdLineKinds[i]!;
      const pos = dirPoint(e, eVecs.forward, eVecs.lateral, 3 + (i % 2), -3 + (i % 3) * 2, state.width, state.height);
      spawnUnit(state, 1, kind, pos.x, pos.y);
    }
  }

  // Center-Hold perimeter outposts
  if (map.enemyOutposts && map.enemyOutposts.length > 0) {
    for (const outpost of map.enemyOutposts) {
      spawnBuildingAt(state, 1, "turret", outpost.x, outpost.y);
      spawnUnit(state, 1, "infantry", outpost.x + 1, outpost.y);
      spawnUnit(state, 1, "antiArmor", outpost.x - 1, outpost.y);
    }
  }

  configureMissionScenario(state, map, mission, rng);

  ensureSimulationDirector(state);
  tickFog(state);
  return state;
}

export function tick(
  state: SimState,
  commands?: Command[],
  options: TickOptions = {},
): { state: SimState; events: SimEvent[]; commandRejections: number } {
  return withEntityWorldBatch(state, () => {
    resetPathBudget(state);
    const collectEvents = options.collectEvents !== false;
    const events = collectEvents ? [] : EMPTY_EVENTS;
    const commandEvents = applyQueuedCommands(state, commands);
    const commandRejections = commandEvents.reduce(
      (count, event) => count + (event.type === "commandRejected" ? 1 : 0),
      0,
    );
    if (collectEvents) events.push(...commandEvents);
    if (state.result !== "playing") return { state, events, commandRejections };
    runSimulationSystems(createSimulationTickContext(state, collectEvents ? events : undefined, options));
    return { state, events, commandRejections };
  });
}

export function createCampaignAndMission(seed: number, missionIndex: number) {
  return { campaign: createCampaign(seed), state: createMission({ seed, missionIndex }) };
}
