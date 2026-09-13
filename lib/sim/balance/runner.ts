import { performance } from "node:perf_hooks";
import { createCampaign } from "../../gen/campaign";
import { generateMap, type GeneratedMap } from "../../gen/map";
import { MAX_MISSION_TICKS, MAX_OPERATION_TICKS } from "../../gen/pacing";
import { formatSeed } from "../../seed/rng";
import { createMissionFromData, tick } from "../api";
import { CompetentCommander } from "../commander";
import { ArchetypeCommander, isArchetypeStrategy } from "../commander/archetypes";
import { powerBreakdown } from "../world";
import { hqThreatened } from "../director";
import { TILE_BLOCKED, TILE_WATER, type BalanceStrategy, type Campaign, type Command, type MissionDef, type MissionDirectorPhase, type SimState, type UnitKind } from "../../types";
import { missionFamilyFor } from "../../gen/profile";
import { scenarioAffordances, type ScenarioAffordances } from "../scenarios";
import { COMMANDER_CADENCE } from "../commander/queries";
import { balanceFailureReason } from "./evaluation";
import { BalanceTimeBudgetExceeded, type BalanceRecordWithScenario, type BalanceRunJob, type BalanceSweepJob } from "./types";

export function assertWithinDeadline(deadlineAt: number | undefined): void {
  if (deadlineAt !== undefined && performance.now() >= deadlineAt) {
    throw new BalanceTimeBudgetExceeded();
  }
}

export function validMap(map: GeneratedMap): boolean {
  const start = (point: { x: number; y: number }) => {
    const tile = map.tiles[point.y * map.width + point.x];
    return tile !== TILE_BLOCKED && tile !== TILE_WATER;
  };
  const profileValid = map.profileVariant === "crossfire"
    ? map.affordances.laneCount >= 3 && map.affordances.routeSeparation >= 4
    : map.profileVariant === "resourceRace" || map.profileVariant === "forwardIndustry"
      ? map.affordances.forwardResourceValue > 0
      : map.profileVariant === "contestedRoute"
        ? map.affordances.routeSeparation >= 4
        : map.affordances.routeSeparation > 0;
  return start(map.playerStart) && start(map.enemyStart) && profileValid &&
    map.markedSpots.every((point) => start(point)) &&
    map.resourceAmount.reduce((sum, amount) => sum + amount, 0) >= 4000 &&
    map.affordances.laneCount >= 2 &&
    map.affordances.baselineRouteLength > 0 &&
    map.affordances.alternateRouteLength <= map.affordances.baselineRouteLength * 1.8 &&
    map.affordances.reachableResourceValue >= 4000 &&
    Number.isFinite(map.affordances.nearestResourceDistance) &&
    Number.isFinite(map.affordances.forwardResourceValue) &&
    Number.isFinite(map.affordances.routeSeparation);
}

function baselineCommands(state: SimState, map: GeneratedMap): Command[] | undefined {
  if (state.tick % 60 !== 0) return undefined;
  const units = state.entities.filter((entity) => entity.owner === 0 && entity.class === "unit" && entity.hp > 0 && !entity.neutral);
  const combat = units.filter((entity) => entity.kind !== "harvester").map((entity) => entity.id);
  const harvesters = units.filter((entity) => entity.kind === "harvester").map((entity) => entity.id);
  const commands: Command[] = [];
  if (combat.length) commands.push({ type: "attackMove", unitIds: combat, x: map.enemyStart.x, y: map.enemyStart.y });
  if (harvesters.length) commands.push({ type: "harvest", unitIds: harvesters, x: map.playerStart.x + 4, y: map.playerStart.y + 4 });
  return commands;
}

function runScenario(
  state: SimState,
  map: GeneratedMap,
  strategy: BalanceStrategy,
  maxTicks: number,
  deadlineAt?: number,
) {
  let powerDeficit = false;
  let commandsIssued = 0;
  let commandRejections = 0;
  let firstCombatTick: number | undefined;
  let firstPressureTick: number | undefined;
  let firstHqThreatTick: number | undefined;
  let hqHealthAtPressure: number | undefined;
  let firstFinaleTick: number | undefined;
  let hqHealthAtFinale: number | undefined;
  let previousAiState: SimState["aiState"];
  let assaultTransitions = 0;
  let primaryCompletedTick: number | undefined;
  let completionPhase: MissionDirectorPhase | undefined;
  const durationByPhase: Record<MissionDirectorPhase, number> = { opening: 0, pressure: 0, finale: 0 };
  let repairCommands = 0;
  let supportActions = 0;
  let healedHp = 0;
  let repairedHp = 0;
  let repairCredits = 0;
  let hqThreatTicks = 0;
  let rescueFirstContactTick: number | undefined;
  let rescueAllContactedTick: number | undefined;
  let rescueFirstReturnedTick: number | undefined;
  let rescuePhaseAtEnd: "active" | "extraction" | "complete" | undefined;
  let openingCredits: number | undefined;
  let openingUnitsProducedByRole: Partial<Record<UnitKind, number>> | undefined;
  const commander = strategy === "competent"
    ? new CompetentCommander()
    : isArchetypeStrategy(strategy)
      ? new ArchetypeCommander(strategy)
      : undefined;
  const missionHorizon = state.runtime?.deadline ?? state.win.ticks ?? MAX_MISSION_TICKS;
  const tickLimit = Math.min(maxTicks, missionHorizon);
  // Balance telemetry is diagnostic rather than authoritative. Sampling the
  // expensive world scans at a small fixed stride keeps long replay fixtures
  // representative while avoiding a full entity scan on every tick.
  const diagnosticStride = 6;
  const openingCutoff = Math.max(1, Math.floor(missionHorizon * 0.25));
  const collectTelemetry = strategy === "competent";
  for (let i = 0; i < tickLimit && state.result === "playing"; i++) {
    assertWithinDeadline(deadlineAt);
    const commands = commander
      ? state.tick % COMMANDER_CADENCE === 0 ? commander.plan(state) : undefined
      : baselineCommands(state, map);
    for (const command of commands ?? []) {
      if ((command.type === "attack" || command.type === "attackMove") && firstCombatTick === undefined) firstCombatTick = state.tick;
      if (command.type === "repair") repairCommands += 1;
    }
    commandsIssued += commands?.length ?? 0;
    const result = tick(state, commands, { collectEvents: collectTelemetry, updateFog: false });
    for (const event of collectTelemetry ? result.events : []) {
      if (event.type === "support" && event.owner === 0) {
        supportActions += 1;
        healedHp += event.amount;
      }
      if (event.type === "repair" && event.owner === 0) {
        repairedHp += event.amount;
        repairCredits += event.cost;
      }
      if (event.type === "objectiveMilestone" && event.kind === "rescue") {
        if (event.milestone === "firstContact" && rescueFirstContactTick === undefined) rescueFirstContactTick = state.tick;
        if (event.milestone === "allContacted" && rescueAllContactedTick === undefined) rescueAllContactedTick = state.tick;
        if (event.milestone === "firstReturned" && rescueFirstReturnedTick === undefined) rescueFirstReturnedTick = state.tick;
      }
    }
    rescuePhaseAtEnd = state.runtime?.kind === "rescue" ? state.runtime.phase : rescuePhaseAtEnd;
    commandRejections += result.commandRejections;
    const shouldSampleDiagnostics = state.tick % diagnosticStride === 0 || state.result !== "playing";
    if (shouldSampleDiagnostics) {
      const playerYard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard" && entity.hp > 0);
      const hqThreatenedNow = hqThreatened(state);
      if (firstHqThreatTick === undefined && hqThreatenedNow) firstHqThreatTick = state.tick;
      if (hqThreatenedNow) hqThreatTicks += diagnosticStride;
      if (state.aiState === "assault" && previousAiState !== "assault") assaultTransitions += 1;
      previousAiState = state.aiState;
      if (firstPressureTick === undefined && state.runtime?.director?.phase !== undefined && state.runtime.director.phase !== "opening") {
        firstPressureTick = state.tick;
        if (playerYard) hqHealthAtPressure = playerYard.hp / Math.max(1, playerYard.maxHp);
      }
    }
    const phase = state.runtime?.director?.phase;
    if (phase) {
      durationByPhase[phase] += 1;
      if (phase === "finale" && firstFinaleTick === undefined) {
        firstFinaleTick = state.tick;
        const playerYard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard" && entity.hp > 0);
        if (playerYard) hqHealthAtFinale = playerYard.hp / Math.max(1, playerYard.maxHp);
      }
    }
    if (primaryCompletedTick === undefined && result.state.result === "won") {
      primaryCompletedTick = state.tick;
      completionPhase = phase;
    }
    if (openingCredits === undefined && state.tick >= openingCutoff) {
      openingCredits = state.credits[0];
      openingUnitsProducedByRole = { ...state.unitsProducedByRole };
    }
    // Unlike the presentation diagnostics above, power health is an
    // acceptance invariant. Sample it every tick so a short deficit cannot
    // disappear between diagnostic samples or on the terminal tick.
    if (state.losses.buildings[0] === 0) {
      powerDeficit ||= powerBreakdown(state, 0).surplus < 0;
    }
  }
  return {
    powerDeficit,
    commandsIssued,
    commandRejections,
    truncated: state.result === "playing" && tickLimit < missionHorizon,
    firstCombatTick,
    firstPressureTick,
    firstHqThreatTick,
    hqHealthAtPressure,
    firstFinaleTick,
    hqHealthAtFinale,
    hqHealthAtEnd: (() => {
      const playerYard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard");
      return playerYard ? playerYard.hp / Math.max(1, playerYard.maxHp) : 0;
    })(),
    assaultTransitions,
    primaryCompletedTick,
    completionPhase,
    durationByPhase,
    repairCommands,
    supportActions: collectTelemetry ? supportActions : undefined,
    healedHp: collectTelemetry ? healedHp : undefined,
    repairedHp: collectTelemetry ? repairedHp : undefined,
    repairCredits: collectTelemetry ? repairCredits : undefined,
    hqThreatTicks,
    rescueFirstContactTick,
    rescueAllContactedTick,
    rescueFirstReturnedTick,
    rescuePhaseAtEnd,
    openingCredits,
    openingUnitsProducedByRole,
  };
}

function hasNonFiniteValue(value: unknown, seen: Set<object>): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((child) => hasNonFiniteValue(child, seen));
}

export function hasNonFiniteState(state: SimState): boolean {
  return hasNonFiniteValue(state, new Set());
}

export type SharedScenarioData = {
  mapValid: boolean;
  affordances?: ScenarioAffordances;
};

export function cloneMapForSimulation(map: GeneratedMap): GeneratedMap {
  return {
    ...map,
    tiles: [...map.tiles],
    resourceAmount: [...map.resourceAmount],
  };
}

export function runOne(
  seed: number,
  missionIndex: number,
  strategy: BalanceStrategy,
  maxTicks: number,
  campaign: Campaign,
  map: GeneratedMap,
  sharedScenario?: SharedScenarioData,
  deadlineAt?: number,
): BalanceRecordWithScenario {
  const scenarioStartedAt = performance.now();
  const definition: MissionDef | undefined = campaign.missions[missionIndex];
  if (!definition) throw new Error(`No mission ${missionIndex}`);
  const state = createMissionFromData({
    seed,
    missionIndex,
    campaign,
    mission: definition,
    map,
  });
  const scenario = sharedScenario?.affordances ?? scenarioAffordances(state);
  if (sharedScenario && !sharedScenario.affordances) sharedScenario.affordances = scenario;
  const mapIsValid = (sharedScenario?.mapValid ?? validMap(map)) && scenario.allTargetsReachable && scenario.materiallyFair;
  const run = runScenario(state, map, strategy, maxTicks, deadlineAt);
  const scenarioMs = performance.now() - scenarioStartedAt;
  return {
    seed: formatSeed(seed),
    mission: missionIndex,
    strategy,
    family: missionFamilyFor(definition.win.kind),
    kind: definition.win.kind,
    result: state.result,
    truncated: run.truncated,
    duration: state.tick,
    credits: state.credits[0],
    unitsProduced: state.unitsProduced[0],
    aiUnitsProduced: state.unitsProduced[1],
    powerDeficit: run.powerDeficit,
    casualties: state.losses.units[0],
    secondaryCompleted: state.result === "won" ? state.runtime?.secondary.filter((objective) => objective.completed).length ?? 0 : 0,
    mapValid: mapIsValid,
    commandsIssued: run.commandsIssued,
    commandRejections: run.commandRejections,
    nonFiniteState: hasNonFiniteState(state),
    lossReason: state.lossReason,
    failureReason: balanceFailureReason({
      result: state.result,
      truncated: run.truncated,
      lossReason: state.lossReason,
    }),
    firstCombatTick: run.firstCombatTick,
    firstPressureTick: run.firstPressureTick,
    firstHqThreatTick: run.firstHqThreatTick,
    hqHealthAtPressure: run.hqHealthAtPressure,
    firstFinaleTick: run.firstFinaleTick,
    hqHealthAtFinale: run.hqHealthAtFinale,
    hqHealthAtEnd: run.hqHealthAtEnd,
    assaultTransitions: run.assaultTransitions,
    primaryCompletedTick: run.primaryCompletedTick,
    completionPhase: run.completionPhase,
    durationByPhase: run.durationByPhase,
    repairCommands: run.repairCommands,
    supportActions: run.supportActions,
    healedHp: run.healedHp,
    repairedHp: run.repairedHp,
    repairCredits: run.repairCredits,
    hqThreatTicks: run.hqThreatTicks,
    rescueFirstContactTick: run.rescueFirstContactTick,
    rescueAllContactedTick: run.rescueAllContactedTick,
    rescueFirstReturnedTick: run.rescueFirstReturnedTick,
    rescuePhaseAtEnd: run.rescuePhaseAtEnd,
    openingCredits: run.openingCredits,
    openingUnitsProducedByRole: run.openingUnitsProducedByRole,
    baselineRouteLength: map.affordances.baselineRouteLength,
    alternateRouteLength: map.affordances.alternateRouteLength,
    reachableResourceValue: map.affordances.reachableResourceValue,
    nearestResourceDistance: map.affordances.nearestResourceDistance,
    laneCount: map.affordances.laneCount,
    forwardResourceValue: map.affordances.forwardResourceValue,
    routeSeparation: map.affordances.routeSeparation,
    targetDepth: scenario.targetDepth,
    targetRouteLength: scenario.routeLength,
    targetReachable: scenario.targetReachable,
    targetDepths: scenario.targetDepths,
    targetRouteLengths: scenario.targetRouteLengths,
    maxTargetDepth: scenario.maxTargetDepth,
    allTargetsReachable: scenario.allTargetsReachable,
    materiallyFair: scenario.materiallyFair,
    effectiveRouteLengths: scenario.effectiveRouteLengths,
    effectiveRouteLength: scenario.effectiveRouteLength,
    rescueReturnRouteLength: scenario.rescueReturnRouteLength,
    scenarioMs,
  };
}

export function runBalanceJob(job: BalanceRunJob, onRecord?: (record: BalanceRecordWithScenario) => void): BalanceRecordWithScenario[] {
  const strategy = job.strategy ?? "competent";
  const maxTicks = job.maxTicks ?? MAX_OPERATION_TICKS;
  const campaigns = new Map<number, Campaign>();
  const maps = new Map<string, GeneratedMap>();
  const records: BalanceRecordWithScenario[] = [];
  for (const { seed, mission } of job.scenarios) {
    assertWithinDeadline(job.deadlineAt);
    const campaign = campaigns.get(seed) ?? createCampaign(seed);
    campaigns.set(seed, campaign);
    const definition = campaign.missions[mission];
    if (!definition) throw new Error(`No mission ${mission}`);
    const mapKey = `${seed}:${mission}`;
    const map = maps.get(mapKey) ?? generateMap(seed, definition);
    maps.set(mapKey, map);
    const record = runOne(seed, mission, strategy, maxTicks, campaign, map, undefined, job.deadlineAt);
    records.push(record);
    onRecord?.(record);
  }
  return records;
}

export function runBalanceSweepJob(
  job: BalanceSweepJob,
  onRecord?: (record: BalanceRecordWithScenario) => void,
): BalanceRecordWithScenario[] {
  const maxTicks = job.maxTicks ?? MAX_OPERATION_TICKS;
  const campaigns = new Map<number, Campaign>();
  const maps = new Map<string, GeneratedMap>();
  const records: BalanceRecordWithScenario[] = [];
  for (const { seed, mission } of job.scenarios) {
    assertWithinDeadline(job.deadlineAt);
    const campaign = campaigns.get(seed) ?? createCampaign(seed);
    campaigns.set(seed, campaign);
    const definition = campaign.missions[mission];
    if (!definition) throw new Error(`No mission ${mission}`);
    const mapKey = `${seed}:${mission}`;
    const map = maps.get(mapKey) ?? generateMap(seed, definition);
    maps.set(mapKey, map);
    const sharedScenario: SharedScenarioData = { mapValid: validMap(map) };
    for (const strategy of job.strategies) {
      const record = runOne(
        seed,
        mission,
        strategy,
        maxTicks,
        campaign,
        cloneMapForSimulation(map),
        sharedScenario,
        job.deadlineAt,
      );
      records.push(record);
      onRecord?.(record);
    }
  }
  return records;
}
