import { STARTING_CREDITS } from "../catalog";
import { createRng, mixSeed } from "../seed/rng";
import type { ReadonlyCampaign, ReadonlyMissionDef, SimEvent, SimState, UnitKind } from "../types";
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

export { issue, inspect };
export { CONVOY_COMPLETION_BUFFER_TICKS, CONVOY_STAGING_TICKS, scenarioAffordances, type ScenarioAffordances } from "./scenarios";

export type TickOptions = SimulationTickOptions;

const EMPTY_EVENTS: SimEvent[] = [];

export function createMission(opts: { seed: number; missionIndex: number }): SimState {
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
    rngState: mixSeed(opts.seed, `sim:${opts.missionIndex}`) || 1,
    // Campaigns are cached and frozen. Simulation state is mutable, so keep a
    // separate faction graph at this boundary.
    factions: campaign.factions.map((faction) => ({
      ...faction,
      palette: { ...faction.palette },
    })) as SimState["factions"],
    missionName: mission.name,
  });
  state.missionKind = mission.win.kind;
  state.aiState = "economy";

  const p = map.playerStart;
  const e = map.enemyStart;
  const offensiveMission = ["sabotage", "destroyMarked", "razeAll", "decapitate", "annihilate"].includes(mission.win.kind);
  spawnBuildingAt(state, 0, "constructionYard", p.x, p.y);
  spawnBuildingAt(state, 0, "power", p.x + 3, p.y);
  spawnBuildingAt(state, 0, "refinery", p.x, p.y + 3);
  spawnUnit(state, 0, "harvester", p.x + 3, p.y + 3);
  spawnUnit(state, 0, "infantry", p.x + 5, p.y + 2);
  if (mission.index >= 1 || offensiveMission) {
    spawnBuildingAt(state, 0, "turret", p.x + 5, p.y);
    spawnBuildingAt(state, 0, "barracks", p.x + 3, p.y - 3);
    spawnUnit(state, 0, "antiArmor", p.x + 5, p.y + 4);
  }
  if (mission.index >= 4 || offensiveMission) {
    spawnUnit(state, 0, "tank", p.x + 6, p.y + 4);
  }
  for (let turretIndex = 0; turretIndex < difficulty.offensiveStartingTurrets && offensiveMission; turretIndex += 1) {
    spawnBuildingAt(state, 0, "turret", p.x - 3 - turretIndex * 2, p.y);
  }
  if (mission.index >= 3 || offensiveMission) {
    spawnBuildingAt(state, 0, "factory", p.x, p.y - 5);
  }
  if (mission.index === 0 && !offensiveMission) {
    spawnBuildingAt(state, 0, "barracks", p.x + 3, p.y - 3);
  }

  for (const building of state.entities.filter((entity) => entity.owner === 0 && entity.class === "building" && entity.hp > 0 && entity.constructing === 0)) {
    state.buildingsCompleted[0] += 1;
    state.buildingsCompletedByKind[building.kind] = (state.buildingsCompletedByKind[building.kind] ?? 0) + 1;
  }

  spawnBuildingAt(state, 1, "constructionYard", e.x, e.y);
  spawnBuildingAt(state, 1, "power", e.x - 3, e.y);
  spawnBuildingAt(state, 1, "refinery", e.x - 2, e.y - 3);
  spawnBuildingAt(state, 1, "barracks", e.x - 5, e.y - 3);
  if (difficulty.startingTurret) {
    spawnBuildingAt(state, 1, "turret", e.x - 5, e.y);
  }
  spawnUnit(state, 1, "harvester", e.x + 1, e.y - 3);
  spawnUnit(state, 1, "infantry", e.x - 1, e.y + 2);
  if (difficulty.startingTank) {
    spawnUnit(state, 1, "tank", e.x - 4, e.y + 1);
  }

  const openingGuardKinds: UnitKind[] = ["infantry", "antiArmor", "tank"];
  for (let i = 0; i < difficulty.startingGuards; i++) {
    spawnUnit(state, 1, openingGuardKinds[i % openingGuardKinds.length]!, e.x - 2 - (i % 3), e.y + 3 + Math.floor(i / 3));
  }

  const extraGuards = Math.floor(mission.index / 2);
  for (let i = 0; i < extraGuards; i++) {
    spawnUnit(state, 1, i % 2 === 0 ? "infantry" : "antiArmor", e.x - 6 - (i % 2), e.y + 1 + i);
  }
  if (mission.index >= 3) {
    spawnBuildingAt(state, 1, "factory", e.x, e.y - 6);
    spawnBuildingAt(state, 1, "turret", e.x + 3, e.y - 3);
  }

  const assault =
    mission.win.kind === "razeAll" ||
    mission.win.kind === "decapitate" ||
    mission.win.kind === "annihilate" ||
    mission.win.kind === "destroyMarked";
  if (assault && difficulty.assaultSupport && (objectiveContractFor(mission.win.kind)?.startingSupport ?? true)) {
    spawnBuildingAt(state, 1, "turret", e.x + 2, e.y);
    spawnUnit(state, 1, "tank", e.x - 2, e.y + 2);
  }

  if (mission.win.kind === "holdTheLine") {
    const holdLineKinds: UnitKind[] = ["infantry", "antiArmor", "tank", "infantry", "antiArmor", "tank", "infantry", "antiArmor"];
    for (let i = 0; i < difficulty.holdLineReinforcements; i++) {
      const kind = holdLineKinds[i]!;
      spawnUnit(state, 1, kind, e.x - 6 - (i % 2), e.y - (i % 3));
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
  resetPathBudget();
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
}

export function createCampaignAndMission(seed: number, missionIndex: number) {
  return { campaign: createCampaign(seed), state: createMission({ seed, missionIndex }) };
}
