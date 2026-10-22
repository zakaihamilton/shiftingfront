import { STARTING_CREDITS } from "../catalog";
import { assertValidSeed, createRng, mixSeed } from "../seed/rng";
import { SURFACE_NONE, TILE_CLEAR, TILE_RESOURCE } from "../types";
import type { Faction, Owner, Palette, ReadonlyCampaign, ReadonlyMissionDef, SimEvent, SimState, SurfaceKind, TutorialStage, UnitKind, Vec2 } from "../types";
import { createCampaign } from "../gen/campaign";
import { generateMap, type GeneratedMap } from "../gen/map";
import { makeFog, tickFog } from "./fog";
import { issue } from "./orders";
import { inspect } from "./objectives";
import { resetPathBudget } from "./pathBudget";
import { configureMissionScenario } from "./scenarios";
import { spawnBuilding, spawnUnit } from "./world";
import { createBaseState } from "./state";
import type { Command } from "../types";
import { missionDifficulty } from "./difficulty";
import {
  applyQueuedCommands,
  createSimulationTickContext,
  ensureSimulationDirector,
  runSimulationSystems,
  type SimulationTickOptions,
} from "./pipeline";
import { configureChallenge } from "./challenges";
import { placeEnemyBase, placeHoldOutposts, placePlayerBase } from "./missionBase";
import { applyDeploymentEdge } from "./deployment";

export { issue, inspect };
export { CONVOY_COMPLETION_BUFFER_TICKS, CONVOY_STAGING_TICKS, scenarioAffordances, type ScenarioAffordances } from "./scenarios";

export type TickOptions = SimulationTickOptions;

const EMPTY_EVENTS: SimEvent[] = [];

export function createMission(opts: {
  seed: number;
  missionIndex: number;
  gameplayRulesVersion?: import("../types").GameplayRulesVersion;
  /** Snapshotted campaign proficiency. Omitted and 0 stay off the state so neutral replays match. */
  proficiencyBand?: -1 | 0 | 1;
  deploymentEdge?: import("../types").DeploymentEdge;
}): SimState {
  assertValidSeed(opts.seed);
  const campaign = createCampaign(opts.seed, opts.gameplayRulesVersion);
  const mission = campaign.missions[opts.missionIndex];
  if (!mission) throw new Error(`No mission ${opts.missionIndex}`);
  const map = generateMap(opts.seed, mission);
  return createMissionFromData({
    seed: opts.seed,
    missionIndex: opts.missionIndex,
    campaign,
    mission,
    map,
    proficiencyBand: opts.proficiencyBand,
    deploymentEdge: opts.deploymentEdge,
  });
}

/** Create a mission from already-generated campaign and map data. */
export function createMissionFromData(opts: {
  seed: number;
  missionIndex: number;
  campaign: ReadonlyCampaign;
  mission: ReadonlyMissionDef;
  map: GeneratedMap;
  configureScenario?: boolean;
  proficiencyBand?: -1 | 0 | 1;
  deploymentEdge?: import("../types").DeploymentEdge;
  /** Set before scenario setup so tutorial maps skip campaign challenges and the director. */
  tutorialStage?: TutorialStage;
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
  state.gameplayRulesVersion = campaign.gameplayRulesVersion ?? 2;
  if (opts.proficiencyBand === -1 || opts.proficiencyBand === 1) state.proficiencyBand = opts.proficiencyBand;
  if (opts.tutorialStage) state.tutorialStage = opts.tutorialStage;
  return initializeMissionState(state, map, mission, rng, difficulty, opts.configureScenario !== false, opts.deploymentEdge);
}

function initializeMissionState(
  state: SimState,
  map: GeneratedMap,
  mission: ReadonlyMissionDef,
  rng: ReturnType<typeof createRng>,
  difficulty: ReturnType<typeof missionDifficulty>,
  configureScenario: boolean,
  deploymentEdge?: import("../types").DeploymentEdge,
): SimState {
  state.missionKind = mission.win.kind;
  state.aiState = "economy";

  placePlayerBase(state, map, mission, difficulty);
  placeEnemyBase(state, map, mission, difficulty);
  placeHoldOutposts(state, map);

  if (configureScenario) {
    configureMissionScenario(state, map, mission, rng);
    configureChallenge(state, map);
  }
  applyDeploymentEdge(state, deploymentEdge);

  ensureSimulationDirector(state);
  tickFog(state);
  return state;
}

const SKIRMISH_MAP_SIZE = 80;
const SKIRMISH_STARTING_BUILDINGS = [
  ["constructionYard", 5, 5],
  ["power", 9, 5],
  ["refinery", 5, 9],
  ["barracks", 9, 9],
  ["factory", 9, 13],
  ["turret", 5, 14],
] as const;
const SKIRMISH_STARTING_UNITS = [
  ["harvester", 13, 6],
  ["infantry", 13, 9],
  ["antiArmor", 13, 11],
  ["tank", 8, 16],
] as const satisfies readonly (readonly [UnitKind, number, number])[];

function rotateSkirmishPoint(x: number, y: number, owner: Owner): Vec2 {
  const edge = SKIRMISH_MAP_SIZE - 1;
  if (owner === 1) return { x: edge - y, y: x };
  if (owner === 2) return { x: edge - x, y: edge - y };
  if (owner === 3) return { x: y, y: edge - x };
  return { x, y };
}

function shiftPalette(palette: Palette, amount: number): Palette {
  const shift = (color: string) => color.replace(/^hsl\(([-\d.]+)\s+/, (_match, hue: string) => `hsl(${(Number(hue) + amount) % 360} `);
  return Object.fromEntries(Object.entries(palette).map(([key, color]) => [key, shift(color)])) as Palette;
}

function skirmishFactions(campaign: ReadonlyCampaign): Faction[] {
  const [northwest, northeast] = campaign.factions;
  return [
    { ...northwest, id: 0, name: "Northwest Command", palette: { ...northwest.palette } },
    { ...northeast, id: 1, name: "Northeast Command", palette: { ...northeast.palette } },
    { ...northwest, id: 2, name: "Southeast Command", palette: shiftPalette(northwest.palette, 180) },
    { ...northeast, id: 3, name: "Southwest Command", palette: shiftPalette(northeast.palette, 180) },
  ];
}

function createSkirmishArena(seed: number, campaign: ReadonlyCampaign, owners: Owner[], aiOwners: Owner[]): SimState {
  const size = SKIRMISH_MAP_SIZE;
  const tiles = new Array<number>(size * size).fill(TILE_CLEAR);
  const heights = new Array<number>(size * size).fill(1);
  const surfaces = new Array<SurfaceKind>(size * size).fill(SURFACE_NONE);
  const resourceAmount = new Array<number>(size * size).fill(0);
  const rng = createRng(seed, "multiplayer-arena-resources");
  const patch = new Set<string>();
  while (patch.size < 36) patch.add(`${20 + rng.int(8)},${6 + rng.int(8)}`);
  for (const cell of patch) {
    const [x, y] = cell.split(",").map(Number) as [number, number];
    for (const owner of [0, 1, 2, 3] as const) {
      const point = rotateSkirmishPoint(x, y, owner);
      const index = point.y * size + point.x;
      tiles[index] = TILE_RESOURCE;
      resourceAmount[index] = 900;
    }
  }

  const factions = skirmishFactions(campaign);
  const state = createBaseState({
    seed,
    missionIndex: 0,
    width: size,
    height: size,
    tiles,
    heights,
    surfaces,
    biome: campaign.world.biome,
    resourceAmount,
    fog: makeFog(size, size, 0),
    credits: factions.map(() => STARTING_CREDITS.player),
    win: { kind: "decapitate" },
    rngState: mixSeed(seed, "sim:multiplayer-skirmish"),
    factions,
    missionName: "Versus Skirmish",
  });
  state.multiplayer = true;
  state.multiplayerOwners = owners;
  state.multiplayerEliminated = [];
  state.multiplayerAiOwners = aiOwners;
  state.multiplayerAiMemory = Object.fromEntries(aiOwners.map((owner) => [owner, {}]));
  state.viewOwner = owners[0] ?? 0;
  state.missionKind = "decapitate";
  state.aiState = undefined;
  state.aiContacts = {};

  const facing = [1, 3, 5, 7] as const;
  for (const owner of owners) {
    for (const [kind, x, y] of SKIRMISH_STARTING_BUILDINGS) {
      const point = rotateSkirmishPoint(x, y, owner);
      const building = spawnBuilding(state, owner, kind, point.x, point.y);
      building.facing = facing[owner];
      state.buildingsCompleted[owner] = (state.buildingsCompleted[owner] ?? 0) + 1;
      state.buildingsCompletedByKind[kind] = (state.buildingsCompletedByKind[kind] ?? 0) + 1;
    }
    for (const [kind, x, y] of SKIRMISH_STARTING_UNITS) {
      const point = rotateSkirmishPoint(x, y, owner);
      const unit = spawnUnit(state, owner, kind, point.x, point.y);
      unit.facing = facing[owner];
    }
  }
  tickFog(state);
  return state;
}

/** Create a deterministic, symmetric corner arena for a two-to-four player skirmish. */
export function createSkirmish(
  seed: number,
  viewOwner: Owner,
  activeOwners: readonly Owner[] = [0, 1],
  aiOwners: readonly Owner[] = [],
): { campaign: ReadonlyCampaign; state: SimState } {
  assertValidSeed(seed);
  const campaign = createCampaign(seed);
  const owners = [...new Set(activeOwners)].filter((owner) => owner >= 0 && owner <= 3).sort((a, b) => a - b);
  const bots = [...new Set(aiOwners)].sort((a, b) => a - b);
  if (owners.length < 2 || owners.length > 4 || !owners.includes(0) || !owners.includes(viewOwner) ||
      bots.length !== aiOwners.length || bots.some((owner) => owner === 0 || !owners.includes(owner))) {
    throw new Error("A skirmish requires valid human and AI seats");
  }
  const state = createSkirmishArena(seed, campaign, owners, bots);
  state.viewOwner = viewOwner;
  state.fog = makeFog(state.width, state.height, 0);
  tickFog(state);
  return { campaign, state };
}

export function tick(
  state: SimState,
  commands?: Command[],
  options: TickOptions = {},
): { state: SimState; events: SimEvent[]; commandRejections: number } {
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
}

export function createCampaignAndMission(seed: number, missionIndex: number) {
  return { campaign: createCampaign(seed), state: createMission({ seed, missionIndex }) };
}
