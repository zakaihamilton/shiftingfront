export type MissionDifficulty = {
  enemyProductionStart: number;
  enemyProductionEvery: number;
  enemyAssaultEvery: number;
  startingTank: boolean;
  startingTurret: boolean;
  offensiveStartingTurrets: number;
  assaultSupport: boolean;
  holdLineReinforcements: number;
  startingGuards: number;
};

const DIFFICULTY_CURVE: MissionDifficulty[] = [
  {
    enemyProductionStart: 240,
    enemyProductionEvery: 180,
    enemyAssaultEvery: 900,
    startingTank: false,
    startingTurret: false,
    offensiveStartingTurrets: 0,
    assaultSupport: false,
    holdLineReinforcements: 1,
    startingGuards: 0,
  },
  {
    enemyProductionStart: 180,
    enemyProductionEvery: 144,
    enemyAssaultEvery: 600,
    startingTank: true,
    startingTurret: true,
    offensiveStartingTurrets: 0,
    assaultSupport: false,
    holdLineReinforcements: 2,
    startingGuards: 1,
  },
  {
    enemyProductionStart: 180,
    enemyProductionEvery: 144,
    enemyAssaultEvery: 600,
    startingTank: true,
    startingTurret: true,
    offensiveStartingTurrets: 0,
    assaultSupport: true,
    holdLineReinforcements: 2,
    startingGuards: 2,
  },
  {
    enemyProductionStart: 144,
    enemyProductionEvery: 120,
    enemyAssaultEvery: 540,
    startingTank: true,
    startingTurret: true,
    offensiveStartingTurrets: 0,
    assaultSupport: true,
    holdLineReinforcements: 3,
    startingGuards: 2,
  },
  {
    enemyProductionStart: 144,
    enemyProductionEvery: 120,
    enemyAssaultEvery: 720,
    startingTank: true,
    startingTurret: true,
    offensiveStartingTurrets: 1,
    assaultSupport: true,
    holdLineReinforcements: 3,
    startingGuards: 2,
  },
  {
    enemyProductionStart: 120,
    enemyProductionEvery: 108,
    enemyAssaultEvery: 660,
    startingTank: true,
    startingTurret: true,
    offensiveStartingTurrets: 0,
    assaultSupport: true,
    holdLineReinforcements: 3,
    startingGuards: 2,
  },
  {
    enemyProductionStart: 108,
    enemyProductionEvery: 96,
    enemyAssaultEvery: 540,
    startingTank: true,
    startingTurret: true,
    offensiveStartingTurrets: 0,
    assaultSupport: true,
    holdLineReinforcements: 4,
    startingGuards: 4,
  },
  {
    enemyProductionStart: 120,
    enemyProductionEvery: 108,
    enemyAssaultEvery: 600,
    startingTank: true,
    startingTurret: true,
    offensiveStartingTurrets: 0,
    assaultSupport: true,
    holdLineReinforcements: 3,
    startingGuards: 2,
  },
];

export function missionDifficulty(missionIndex: number): MissionDifficulty {
  const index = Math.max(0, Math.min(DIFFICULTY_CURVE.length - 1, Math.floor(missionIndex)));
  return DIFFICULTY_CURVE[index]!;
}

/** Skirmish armies start with a full roster, so bots use the last campaign curve instead of mission 0. */
export const SKIRMISH_AI_MISSION_INDEX = 5;

export function aiDifficultyMission(state: { missionIndex: number; multiplayer?: boolean }): number {
  return state.multiplayer ? SKIRMISH_AI_MISSION_INDEX : state.missionIndex;
}
