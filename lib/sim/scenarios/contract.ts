import type { Rng } from "../../seed/rng";
import type { GeneratedMap } from "../../gen/map";
import type { MissionKind, MissionProfile, ReadonlyMissionDef, SimState, Vec2 } from "../../types";

export type ScenarioProgress = {
  current: number;
  target: number;
  label: string;
};

export type ScenarioSetupContext = {
  state: SimState;
  map: GeneratedMap;
  mission: ReadonlyMissionDef;
  rng: Rng;
  profile: MissionProfile;
  reachable: Uint8Array | undefined;
};

export type ScenarioSetupResult = {
  targetIds: number[];
  required?: number;
  zone?: Vec2;
  convoyStartTick?: number;
  deadline?: number;
};

/**
 * Contract for mission-specific behavior. Classic objectives use no-op hooks,
 * while operation objectives provide setup, ticking, progress, completion,
 * loss, and deadline behavior through the same interface.
 */
export type ScenarioDefinition = {
  kind: MissionKind;
  presentation: {
    label: string;
    targetLabel: string;
  };
  setup: (context: ScenarioSetupContext) => ScenarioSetupResult;
  tick: (state: SimState) => void;
  progress: (state: SimState) => ScenarioProgress | undefined;
  isComplete: (state: SimState) => boolean | undefined;
  targetLost: (state: SimState) => boolean;
  deadline: (state: SimState) => number | undefined;
};
