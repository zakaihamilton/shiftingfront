import { createMission, issue, tick } from "../lib/sim/api";
import { CompetentCommander } from "../lib/sim/commander";
import { tickCombat } from "../lib/sim/combat";
import { addBuilding, addUnit, makeFixture, setHeight } from "../lib/sim/fixtures";
import { resetPathBudget } from "../lib/sim/pathBudget";
import { bakeTerrainAtlasData } from "../lib/render/terrainAtlas";
import { flowFieldCacheSize, flowFieldFor } from "../lib/sim/flowField";
import { staticNavigationFor } from "../lib/sim/world";
import type { SimState } from "../lib/types";
import { percentile, summarizeTimings, type TimingSummary } from "../lib/perf/metrics";

const MAX_ATLAS_MS = process.env.CI ? 2_500 : 1_200;
const MAX_ATLAS_BYTES = 4 * 1024 * 1024;
const MAX_SIM_P95_MS = 25;
/** Isolated GC spikes on 2-vCPU runners can clear 25 ms while p95 stays ~3 ms. */
const MAX_SIM_P99_MS = process.env.CI ? 40 : 25;
const MAX_BLOCKED_COMBAT_P95_MS = 25;
const MAX_BLOCKED_COMBAT_P99_MS = 25;
const SIM_TICKS = 600;
const SIM_WARMUP_TICKS = 60;
const BLOCKED_COMBAT_UNITS = 24;
const BLOCKED_COMBAT_TICKS = 120;
const FOREGROUND_GROUP_UNITS = 48;
const LARGE_GROUP_UNITS = 96;
const FOREGROUND_PATH_SAMPLES = 6;
const MAX_FOREGROUND_PATH_P95_MS = 25;
const MAX_FOREGROUND_PATH_P99_MS = 25;

type Sample = {
  seed: number;
  mission: number;
  map: string;
  ms: number;
  bytes: number;
};

function addBenchmarkFormation(state: SimState) {
  addBuilding(state, 0, "constructionYard", 0, 0);
  return Array.from({ length: FOREGROUND_GROUP_UNITS }, (_, i) =>
    addUnit(state, 0, "infantry", 3 + (i % 12), 4 + Math.floor(i / 12)),
  );
}

function issueBenchmarkDestinations(
  state: SimState,
  units: ReturnType<typeof addUnit>[],
  destinations: { x: number; y: number }[],
): void {
  const groups = destinations.length;
  destinations.forEach((destination, index) => {
    const group = units.slice(
      Math.floor(index * units.length / groups),
      Math.floor((index + 1) * units.length / groups),
    );
    issue(state, {
      type: "move",
      unitIds: group.map((unit) => unit.id),
      x: destination.x,
      y: destination.y,
      formation: "line",
    });
  });
}

const atlasSamples: Sample[] = [];
for (const seed of [0, 421, 9999]) {
  const state = createMission({ seed, missionIndex: 5 });
  const started = performance.now();
  const atlas = bakeTerrainAtlasData(state);
  atlasSamples.push({
    seed,
    mission: state.missionIndex,
    map: `${state.width}x${state.height}`,
    ms: performance.now() - started,
    bytes: atlas.data.byteLength,
  });
}

type SimulationSample = {
  seed: number;
  mission: number;
  map: string;
  ticks: number;
  result: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  planning: TimingSummary;
  tick: TimingSummary;
};

const simulationSamples: SimulationSample[] = [];
{
  // Warm the late-game 96×96 tick path (commander + navigation buffers)
  // before the timed samples so the first measured seed is not a JIT spike.
  const warmup = createMission({ seed: 0, missionIndex: 5 });
  const warmupCommander = new CompetentCommander();
  for (let i = 0; i < SIM_WARMUP_TICKS && warmup.result === "playing"; i++) {
    tick(warmup, warmupCommander.plan(warmup));
  }
}
for (const seed of [0, 421, 9999]) {
  const state = createMission({ seed, missionIndex: 5 });
  const commander = new CompetentCommander();
  const timings: number[] = [];
  const planningTimings: number[] = [];
  const tickTimings: number[] = [];
  for (let i = 0; i < SIM_TICKS && state.result === "playing"; i++) {
    const started = performance.now();
    const planningStarted = performance.now();
    const commands = commander.plan(state);
    const planningFinished = performance.now();
    tick(state, commands);
    const finished = performance.now();
    if (i >= SIM_WARMUP_TICKS) {
      timings.push(finished - started);
      planningTimings.push(planningFinished - planningStarted);
      tickTimings.push(finished - planningFinished);
    }
  }
  const summary = summarizeTimings(timings);
  simulationSamples.push({
    seed,
    mission: state.missionIndex,
    map: `${state.width}x${state.height}`,
    ticks: state.tick,
    result: state.result,
    ...summary,
    planning: summarizeTimings(planningTimings),
    tick: summarizeTimings(tickTimings),
  });
}

type ForegroundPathSample = {
  seed: number;
  units: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  pendingAfterOrder: number;
  pendingAfterFirstTick: number;
};

type LargeGroupPathSample = Omit<ForegroundPathSample, "units"> & {
  units: number;
  orderP50Ms: number;
  orderP95Ms: number;
  orderP99Ms: number;
  orderMaxMs: number;
  tickP95Ms: number;
  tickP99Ms: number;
};

const foregroundPathTimings: number[] = [];
let pendingAfterOrder = 0;
let pendingAfterFirstTick = 0;
for (let sample = 0; sample < FOREGROUND_PATH_SAMPLES; sample++) {
  const state = makeFixture({ width: 96, height: 96, win: { kind: "harvestQuota", target: 99999 } });
  const units = addBenchmarkFormation(state);
  const started = performance.now();
  issue(state, {
    type: "move",
    unitIds: units.map((unit) => unit.id),
    x: 80,
    y: 80,
    formation: "line",
  });
  foregroundPathTimings.push(performance.now() - started);
  pendingAfterOrder = units.filter((unit) => unit.routePending).length;
  tick(state);
  pendingAfterFirstTick = units.filter((unit) => unit.routePending).length;
}

const foregroundPathSample: ForegroundPathSample = {
  seed: 0,
  units: FOREGROUND_GROUP_UNITS,
  p50Ms: percentile(foregroundPathTimings, 0.5),
  p95Ms: percentile(foregroundPathTimings, 0.95),
  p99Ms: percentile(foregroundPathTimings, 0.99),
  maxMs: Math.max(...foregroundPathTimings, 0),
  pendingAfterOrder,
  pendingAfterFirstTick,
};

const largeGroupTickTimings: number[] = [];
const largeGroupOrderTimings: number[] = [];
let largeGroupPendingAfterOrder = 0;
let largeGroupPendingAfterFirstTick = 0;
for (let sample = 0; sample < FOREGROUND_PATH_SAMPLES; sample++) {
  const state = makeFixture({ width: 96, height: 96, win: { kind: "harvestQuota", target: 99999 } });
  addBuilding(state, 0, "constructionYard", 0, 0);
  const units = Array.from({ length: LARGE_GROUP_UNITS }, (_, i) =>
    addUnit(state, 0, "infantry", 3 + (i % 12), 4 + Math.floor(i / 12)),
  );
  const orderStarted = performance.now();
  issue(state, { type: "move", unitIds: units.map((unit) => unit.id), x: 80, y: 80 });
  largeGroupOrderTimings.push(performance.now() - orderStarted);
  largeGroupPendingAfterOrder = units.filter((unit) => unit.routePending).length;
  const started = performance.now();
  tick(state, undefined, { evaluateObjectives: false });
  largeGroupTickTimings.push(performance.now() - started);
  largeGroupPendingAfterFirstTick = units.filter((unit) => unit.routePending).length;
}

const largeGroupPathSample: LargeGroupPathSample = {
  seed: 0,
  units: LARGE_GROUP_UNITS,
  orderP50Ms: percentile(largeGroupOrderTimings, 0.5),
  orderP95Ms: percentile(largeGroupOrderTimings, 0.95),
  orderP99Ms: percentile(largeGroupOrderTimings, 0.99),
  orderMaxMs: Math.max(...largeGroupOrderTimings, 0),
  p50Ms: percentile(largeGroupTickTimings, 0.5),
  p95Ms: percentile(largeGroupTickTimings, 0.95),
  p99Ms: percentile(largeGroupTickTimings, 0.99),
  maxMs: Math.max(...largeGroupTickTimings, 0),
  pendingAfterOrder: largeGroupPendingAfterOrder,
  pendingAfterFirstTick: largeGroupPendingAfterFirstTick,
  tickP95Ms: percentile(largeGroupTickTimings, 0.95),
  tickP99Ms: percentile(largeGroupTickTimings, 0.99),
};

type RoutingSample = {
  seed: number;
  scenario: string;
  units: number;
  destinations: number;
  fields: number;
  navigationRevision: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

function routingSample(seed: number, scenario: string, destinations: { x: number; y: number }[], invalidate = false): RoutingSample {
  const state = makeFixture({ seed, width: 96, height: 96, win: { kind: "harvestQuota", target: 99999 } });
  const units = addBenchmarkFormation(state);
  issueBenchmarkDestinations(state, units, destinations);
  // Static occupancy is cached independently from flow fields in a live
  // mission. Warm it here so this metric measures flow-field construction,
  // while the invalidation scenario below still measures a rebuild.
  staticNavigationFor(state);
  const timings: number[] = [];
  const measureFields = () => {
    const started = performance.now();
    for (const destination of destinations) flowFieldFor(state, destination);
    timings.push(performance.now() - started);
  };
  measureFields();
  tick(state);
  if (invalidate) {
    const revision = state.navigationRevision;
    addBuilding(state, 1, "power", 50, 50);
    if (state.navigationRevision === revision) throw new Error("Navigation revision did not change during benchmark setup");
    issueBenchmarkDestinations(state, units, destinations);
    measureFields();
  }
  for (let sample = timings.length; sample < FOREGROUND_PATH_SAMPLES; sample++) measureFields();
  return {
    seed,
    scenario,
    units: units.length,
    destinations: destinations.length,
    fields: flowFieldCacheSize(state),
    navigationRevision: state.navigationRevision,
    p50Ms: percentile(timings, 0.5),
    p95Ms: percentile(timings, 0.95),
    p99Ms: percentile(timings, 0.99),
    maxMs: Math.max(...timings, 0),
  };
}

// Warm the JIT before measuring the first cold field build, matching the
// existing simulation benchmark's warm-up treatment.
const routingWarmup = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
flowFieldFor(routingWarmup, { x: 8, y: 8 });
// The small warm-up does not exercise the 96x96 queue and navigation buffers
// used by the routing budget. Warm the same-size workload as well so the
// measured sample reflects routing cost rather than first-use compilation.
const fullRoutingWarmup = makeFixture({ width: 96, height: 96, win: { kind: "harvestQuota", target: 99999 } });
addBuilding(fullRoutingWarmup, 0, "constructionYard", 0, 0);
for (const destination of [{ x: 80, y: 80 }, { x: 72, y: 72 }, { x: 80, y: 24 }, { x: 24, y: 80 }, { x: 48, y: 48 }]) {
  flowFieldFor(fullRoutingWarmup, destination);
}

const routingSamples = [
  routingSample(0, "one flow field serves 48-unit formation", [{ x: 80, y: 80 }]),
  routingSample(421, "four simultaneous destinations", [{ x: 72, y: 72 }, { x: 80, y: 24 }, { x: 24, y: 80 }, { x: 48, y: 48 }]),
  routingSample(9999, "building invalidation", [{ x: 80, y: 80 }], true),
];

const blockedCombatState = makeFixture({ width: 40, height: 28, win: { kind: "annihilate" } });
const blockedTarget = addBuilding(blockedCombatState, 1, "power", 20, 12);
blockedTarget.hp = 1_000_000;
blockedTarget.maxHp = 1_000_000;
setHeight(blockedCombatState, 18, 12, 4);
for (let i = 0; i < BLOCKED_COMBAT_UNITS; i++) {
  const attacker = addUnit(blockedCombatState, 0, "tank", 17, 12);
  attacker.attackTarget = blockedTarget.id;
  attacker.orderMode = "attack";
  attacker.idle = false;
}
const blockedCombatTimings: number[] = [];
for (let i = 0; i < BLOCKED_COMBAT_TICKS; i++) {
  resetPathBudget(blockedCombatState);
  const started = performance.now();
  tickCombat(blockedCombatState);
  if (i >= SIM_WARMUP_TICKS / 2) blockedCombatTimings.push(performance.now() - started);
}

const atlasFailures = atlasSamples.filter((sample) => sample.ms > MAX_ATLAS_MS || sample.bytes > MAX_ATLAS_BYTES);
const simulationFailures = simulationSamples.filter((sample) => sample.p95Ms > MAX_SIM_P95_MS || sample.p99Ms > MAX_SIM_P99_MS);
const foregroundPathFailures = foregroundPathSample.p95Ms > MAX_FOREGROUND_PATH_P95_MS || foregroundPathSample.p99Ms > MAX_FOREGROUND_PATH_P99_MS;
const largeGroupPathFailures = largeGroupPathSample.tickP95Ms > MAX_FOREGROUND_PATH_P95_MS || largeGroupPathSample.tickP99Ms > MAX_FOREGROUND_PATH_P99_MS;
const largeGroupOrderFailures = largeGroupPathSample.orderP95Ms > MAX_FOREGROUND_PATH_P95_MS || largeGroupPathSample.orderP99Ms > MAX_FOREGROUND_PATH_P99_MS;
const blockedCombatSummary = summarizeTimings(blockedCombatTimings);
const routingFailures = routingSamples.filter((sample) => sample.p95Ms > MAX_FOREGROUND_PATH_P95_MS || sample.p99Ms > MAX_FOREGROUND_PATH_P99_MS);
console.log(JSON.stringify({
  maxAtlasMs: MAX_ATLAS_MS,
  maxAtlasBytes: MAX_ATLAS_BYTES,
  maxSimulationP95Ms: MAX_SIM_P95_MS,
  maxSimulationP99Ms: MAX_SIM_P99_MS,
  maxBlockedCombatP95Ms: MAX_BLOCKED_COMBAT_P95_MS,
  maxBlockedCombatP99Ms: MAX_BLOCKED_COMBAT_P99_MS,
  maxForegroundPathP95Ms: MAX_FOREGROUND_PATH_P95_MS,
  maxForegroundPathP99Ms: MAX_FOREGROUND_PATH_P99_MS,
  simulationTicks: SIM_TICKS,
  atlasSamples,
  simulationSamples,
  foregroundPath: foregroundPathSample,
  largeGroupPath: largeGroupPathSample,
  routing: routingSamples,
  blockedCombat: {
    units: BLOCKED_COMBAT_UNITS,
    ticks: BLOCKED_COMBAT_TICKS,
    ...blockedCombatSummary,
  },
}, null, 2));
if (atlasFailures.length || simulationFailures.length || blockedCombatSummary.p95Ms > MAX_BLOCKED_COMBAT_P95_MS || blockedCombatSummary.p99Ms > MAX_BLOCKED_COMBAT_P99_MS || foregroundPathFailures || largeGroupPathFailures || largeGroupOrderFailures || routingFailures.length) {
  const failures = [
    ...atlasFailures.flatMap((sample) => [
      ...(sample.ms > MAX_ATLAS_MS ? [`metric=terrain atlas ms actual=${sample.ms.toFixed(2)} threshold=${MAX_ATLAS_MS} seed=${sample.seed} scenario=mission-${sample.mission}`] : []),
      ...(sample.bytes > MAX_ATLAS_BYTES ? [`metric=terrain atlas bytes actual=${sample.bytes} threshold=${MAX_ATLAS_BYTES} seed=${sample.seed} scenario=mission-${sample.mission}`] : []),
    ]),
    ...simulationFailures.flatMap((sample) => [
      ...(sample.p95Ms > MAX_SIM_P95_MS ? [`metric=simulation p95 ms actual=${sample.p95Ms.toFixed(2)} threshold=${MAX_SIM_P95_MS} seed=${sample.seed} scenario=mission-${sample.mission}`] : []),
      ...(sample.p99Ms > MAX_SIM_P99_MS ? [`metric=simulation p99 ms actual=${sample.p99Ms.toFixed(2)} threshold=${MAX_SIM_P99_MS} seed=${sample.seed} scenario=mission-${sample.mission}`] : []),
    ]),
    ...(blockedCombatSummary.p95Ms > MAX_BLOCKED_COMBAT_P95_MS ? [`metric=blocked combat p95 ms actual=${blockedCombatSummary.p95Ms.toFixed(2)} threshold=${MAX_BLOCKED_COMBAT_P95_MS} seed=0 scenario=blocked-los`] : []),
    ...(blockedCombatSummary.p99Ms > MAX_BLOCKED_COMBAT_P99_MS ? [`metric=blocked combat p99 ms actual=${blockedCombatSummary.p99Ms.toFixed(2)} threshold=${MAX_BLOCKED_COMBAT_P99_MS} seed=0 scenario=blocked-los`] : []),
    ...(foregroundPathSample.p95Ms > MAX_FOREGROUND_PATH_P95_MS ? [`metric=foreground order p95 ms actual=${foregroundPathSample.p95Ms.toFixed(2)} threshold=${MAX_FOREGROUND_PATH_P95_MS} seed=${foregroundPathSample.seed} scenario=48-unit-formation-order`] : []),
    ...(foregroundPathSample.p99Ms > MAX_FOREGROUND_PATH_P99_MS ? [`metric=foreground order p99 ms actual=${foregroundPathSample.p99Ms.toFixed(2)} threshold=${MAX_FOREGROUND_PATH_P99_MS} seed=${foregroundPathSample.seed} scenario=48-unit-formation-order`] : []),
    ...(largeGroupPathSample.tickP95Ms > MAX_FOREGROUND_PATH_P95_MS ? [`metric=large-group tick p95 ms actual=${largeGroupPathSample.tickP95Ms.toFixed(2)} threshold=${MAX_FOREGROUND_PATH_P95_MS} seed=${largeGroupPathSample.seed} scenario=96-unit-flow-order`] : []),
    ...(largeGroupPathSample.tickP99Ms > MAX_FOREGROUND_PATH_P99_MS ? [`metric=large-group tick p99 ms actual=${largeGroupPathSample.tickP99Ms.toFixed(2)} threshold=${MAX_FOREGROUND_PATH_P99_MS} seed=${largeGroupPathSample.seed} scenario=96-unit-flow-order`] : []),
    ...(largeGroupPathSample.orderP95Ms > MAX_FOREGROUND_PATH_P95_MS ? [`metric=large-group order p95 ms actual=${largeGroupPathSample.orderP95Ms.toFixed(2)} threshold=${MAX_FOREGROUND_PATH_P95_MS} seed=${largeGroupPathSample.seed} scenario=96-unit-slot-generation`] : []),
    ...(largeGroupPathSample.orderP99Ms > MAX_FOREGROUND_PATH_P99_MS ? [`metric=large-group order p99 ms actual=${largeGroupPathSample.orderP99Ms.toFixed(2)} threshold=${MAX_FOREGROUND_PATH_P99_MS} seed=${largeGroupPathSample.seed} scenario=96-unit-slot-generation`] : []),
    ...routingFailures.flatMap((sample) => [
      ...(sample.p95Ms > MAX_FOREGROUND_PATH_P95_MS ? [`metric=flow-field routing p95 ms actual=${sample.p95Ms.toFixed(2)} threshold=${MAX_FOREGROUND_PATH_P95_MS} seed=${sample.seed} scenario=${sample.scenario}`] : []),
      ...(sample.p99Ms > MAX_FOREGROUND_PATH_P99_MS ? [`metric=flow-field routing p99 ms actual=${sample.p99Ms.toFixed(2)} threshold=${MAX_FOREGROUND_PATH_P99_MS} seed=${sample.seed} scenario=${sample.scenario}`] : []),
    ]),
  ];
  throw new Error(`Performance budget exceeded:\n${failures.join("\n")}`);
}
