import type { Command, InspectReport, SimEvent, SimState } from "../types";
import { createMission, inspect, tick } from "./api";

export type TimedOrder = {
  tick: number;
  command: Command;
};

export type ReplayOptions = {
  seed: number;
  missionIndex: number;
  orders?: TimedOrder[];
  maxTicks: number;
};

export type ReplayResult = {
  state: SimState;
  inspect: InspectReport;
  terminalResult: SimState["result"];
  events: SimEvent[];
  commandRejections: number;
  fingerprint: string;
};

const staticFingerprintCache = new WeakMap<object, string>();

/**
 * Returns the deterministic simulation state that can affect future ticks.
 * Fog is presentation state and is intentionally excluded from replay identity.
 * Entity order is normalized because destroyed-entity compaction is an
 * implementation detail rather than part of the gameplay contract.
 */
export function simulationFingerprint(state: SimState): string {
  let staticState = staticFingerprintCache.get(state);
  if (!staticState) {
    staticState = JSON.stringify({
      seed: state.seed,
      missionIndex: state.missionIndex,
      width: state.width,
      height: state.height,
      heights: state.heights,
      surfaces: state.surfaces,
      biome: state.biome,
      factions: state.factions,
      missionName: state.missionName,
      missionKind: state.missionKind,
    });
    staticFingerprintCache.set(state, staticState);
  }

  const {
    fog: _fog,
    seed: _seed,
    missionIndex: _missionIndex,
    width: _width,
    height: _height,
    heights: _heights,
    surfaces: _surfaces,
    biome: _biome,
    factions: _factions,
    missionName: _missionName,
    missionKind: _missionKind,
    controlGroups: _controlGroups,
    pathBudget: _pathBudget,
    entities,
    ...dynamicState
  } = state;
  void _pathBudget;
  void _fog;
  void _seed;
  void _missionIndex;
  void _width;
  void _height;
  void _heights;
  void _surfaces;
  void _biome;
  void _factions;
  void _missionName;
  void _missionKind;
  void _controlGroups;
  // Resource depletion mutates tiles in place, so tiles must remain outside the
  // identity cache. Joining the numeric tile values keeps this projection
  // canonical without caching mutable terrain state.
  return `${staticState}|tiles:${state.tiles.join(",")}|${JSON.stringify({
    ...dynamicState,
    entities: [...entities].sort((a, b) => a.id - b.id),
  })}`;
}

export function runReplay(options: ReplayOptions): ReplayResult {
  const state = createMission({ seed: options.seed, missionIndex: options.missionIndex });
  const ordersByTick = new Map<number, Command[]>();
  for (const order of options.orders ?? []) {
    if (!Number.isInteger(order.tick) || order.tick < 0) continue;
    const commands = ordersByTick.get(order.tick) ?? [];
    commands.push(order.command);
    ordersByTick.set(order.tick, commands);
  }

  const events: SimEvent[] = [];
  let commandRejections = 0;
  const maxTicks = Math.max(0, Math.floor(options.maxTicks));
  for (let i = 0; i < maxTicks && state.result === "playing"; i += 1) {
    const commands = ordersByTick.get(state.tick);
    const result = tick(state, commands?.length ? commands : undefined);
    events.push(...result.events);
    commandRejections += result.commandRejections;
  }

  return {
    state,
    inspect: inspect(state),
    terminalResult: state.result,
    events,
    commandRejections,
    fingerprint: simulationFingerprint(state),
  };
}
