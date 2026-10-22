import { isAirUnit, isSupportUnit, UNIT_STATS } from "../../catalog";
import { isUnitEntity, type Entity, type Owner, type SimState } from "../../types";
import { rngFromState } from "../../seed/rng";
import { aiDifficultyMission, missionDifficulty } from "../difficulty";
import {
  MIN_SCALED_ASSAULT_EVERY,
  MIN_SCALED_PRODUCTION_EVERY,
  adaptiveDifficultyShift,
  isPressureBase,
  isPressureCombatant,
  livePressureFromForces,
  scaleDecisionInterval,
} from "../proficiency";
import { objectiveContractFor, profileContractFor, resolveMissionProfile } from "../../gen/profile";
import { distToEntity, livingView, powerFor } from "../world";
import { enemyKnownPlayerEntities } from "./visibility";
import { setAiBehavior } from "./ownerState";
import { isTimedRecovery } from "../policy";
import { enemyDoctrine } from "../fieldIdentity";
import { directorPhase } from "./phase";
import { YARD_DEFENSE_RANGE, directOwnerForces, runProductionWindow, spawnHoldLineReinforcements } from "./policies";

export { directorPhase } from "./phase";
export { guardResourceLane, guardScenarioObjectives } from "./guards";

type DirectorBuffers = {
  enemyBuildings: Entity[];
  enemyUnits: Entity[];
  enemyAircraft: Entity[];
};

const directorBuffers = new WeakMap<SimState, DirectorBuffers>();

function buffersFor(state: SimState): DirectorBuffers {
  const cached = directorBuffers.get(state);
  if (cached) {
    cached.enemyBuildings.length = 0;
    cached.enemyUnits.length = 0;
    cached.enemyAircraft.length = 0;
    return cached;
  }
  const buffers = { enemyBuildings: [], enemyUnits: [], enemyAircraft: [] };
  directorBuffers.set(state, buffers);
  return buffers;
}
function tickAiForOwner(state: SimState, aiOwner: Owner, opponents: readonly Owner[]): void {
  if (state.result !== "playing" || state.tutorialStage !== undefined) return;
  const rng = rngFromState(state.rngState);
  // This is on the hot path for every simulation tick. Build the frequently
  // used views in one pass instead of repeatedly filtering the same entity
  // list during production, repair, and assault decisions.
  const active = livingView(state);
  const knownPlayers = enemyKnownPlayerEntities(state, active, aiOwner, opponents);
  const { enemyBuildings, enemyUnits, enemyAircraft } = buffersFor(state);
  let hasHarvester = false;
  let playerTanks = 0;
  let playerInfantry = 0;
  let playerAntiArmor = 0;
  let woundedHumans = false;
  let woundedVehicles = false;
  let medicCount = 0;
  let repairTruckCount = 0;
  for (const entity of knownPlayers) {
    if (entity.kind === "tank") playerTanks += 1;
    if (entity.kind === "infantry") playerInfantry += 1;
    if (entity.kind === "antiArmor") playerAntiArmor += 1;
  }
  for (const entity of active) {
    if (entity.owner === aiOwner && entity.class === "building") enemyBuildings.push(entity);
    if (entity.owner === aiOwner && isUnitEntity(entity) && !entity.optionalChallenge) {
      if (isAirUnit(entity.kind)) enemyAircraft.push(entity);
      else if (UNIT_STATS[entity.kind].damage > 0 && !isSupportUnit(entity.kind)) enemyUnits.push(entity);
      if (entity.kind === "harvester") hasHarvester = true;
      if (entity.kind === "medic") medicCount += 1;
      if (entity.kind === "repairTruck") repairTruckCount += 1;
      if (!isSupportUnit(entity.kind) && UNIT_STATS[entity.kind].domain === "human" && entity.hp < entity.maxHp) woundedHumans = true;
      if (!isSupportUnit(entity.kind) && UNIT_STATS[entity.kind].domain === "vehicle" && entity.hp < entity.maxHp) woundedVehicles = true;
    }
  }
  const yard = enemyBuildings.find((e) => e.kind === "constructionYard");
  if (!yard) {
    setAiBehavior(state, aiOwner, "retreat");
    state.rngState = rng.state;
    return;
  }

  const difficultyMission = aiDifficultyMission(state);
  const difficulty = missionDifficulty(difficultyMission);
  const phase = directorPhase(state);
  const doctrine = enemyDoctrine(state, aiOwner);
  let playerCombat = 0;
  let playerBases = 0;
  let playerHqHealthRatio: number | undefined;
  for (const entity of knownPlayers) {
    if (isPressureCombatant(entity)) playerCombat += 1;
    if (isPressureBase(entity)) playerBases += 1;
    if (entity.kind === "constructionYard") {
      const ratio = entity.hp / Math.max(1, entity.maxHp);
      playerHqHealthRatio = playerHqHealthRatio === undefined ? ratio : Math.min(playerHqHealthRatio, ratio);
    }
  }
  let enemyBases = 0;
  for (const entity of enemyBuildings) {
    if (isPressureBase(entity)) enemyBases += 1;
  }
  const openingYardThreat = phase === "opening" && knownPlayers.some((entity) =>
    isPressureCombatant(entity) && distToEntity(yard, entity) <= YARD_DEFENSE_RANGE,
  );
  const shift = adaptiveDifficultyShift(state, state.multiplayer || state.tutorialStage !== undefined ? 0 : livePressureFromForces({
    phase,
    playerCombat,
    enemyCombat: enemyUnits.length + enemyAircraft.length,
    playerBases,
    enemyBases,
    openingYardThreat,
    playerHqHealthRatio,
    enemyUnitLosses: state.losses.units[aiOwner] ?? 0,
  }));
  const generatedHoldLine = state.win.kind === "holdTheLine" && state.runtime?.director !== undefined;
  // A rush that abandons the yard still has to survive the timer. Scale 8
  // made those runs unwinnable for the defender and let every rush hold.
  // With repairs paused between incoming shots, refresh survival pressure
  // slightly faster so rushing away from the yard still carries a risk.
  const holdLinePressureScale = generatedHoldLine ? 2.75 : 1;
  const assaultEvery = scaleDecisionInterval(difficulty.enemyAssaultEvery, shift, MIN_SCALED_ASSAULT_EVERY);
  const holdLineAssaultEvery = Math.round(assaultEvery * holdLinePressureScale);
  const profile = state.runtime?.director
    ? resolveMissionProfile(state.seed, state.missionIndex, state.win.kind)
    : undefined;
  const profileContract = profile ? profileContractFor(profile) : undefined;
  const objectiveContract = objectiveContractFor(state.win.kind);
  const recoveryRoutes = state.runtime?.kind === "escort" || isTimedRecovery(state.runtime?.kind ?? state.win.kind);
  const timedScenario = state.runtime?.director !== undefined && (state.missionIndex >= 4 || recoveryRoutes) && (
    state.runtime.kind === "escort" || isTimedRecovery(state.runtime.kind)
  );
  const openingOffensive = !state.multiplayer && state.win.kind === "decapitate" && state.missionIndex < 2;
  const timedProductionScale = recoveryRoutes ? 4 : state.runtime?.kind === "extraction" ? 2.5 : 2;
  const holdLineProductionScale = holdLinePressureScale;
  const productionEvery = scaleDecisionInterval(timedScenario
    ? Math.round(difficulty.enemyProductionEvery * timedProductionScale)
    : openingOffensive ? Math.round(difficulty.enemyProductionEvery * 4)
      : objectiveContract
        ? Math.max(1, Math.round(difficulty.enemyProductionEvery * objectiveContract.productionScale))
        : Math.round(difficulty.enemyProductionEvery * holdLineProductionScale), shift, MIN_SCALED_PRODUCTION_EVERY);
  // Objective closeout windows need finite pressure: once the finale begins,
  // stop adding fresh enemy units or structures while keeping existing
  // defenses active. Otherwise the player can chase a moving target to timeout.
  const finiteCloseout = ["sabotage", "razeAll", "decapitate", "annihilate"].includes(state.win.kind) && phase === "finale";
  const productionWindow =
    state.tick >= difficulty.enemyProductionStart &&
    (state.tick - difficulty.enemyProductionStart) % productionEvery === 0 &&
    !finiteCloseout;
  const powerDeficit = powerFor(state, aiOwner) < 0;
  const turn = {
    state,
    aiOwner,
    opponents,
    rng,
    knownPlayers,
    enemyBuildings,
    enemyUnits,
    enemyAircraft,
    yard,
    hasHarvester,
    playerTanks,
    playerInfantry,
    playerAntiArmor,
    woundedHumans,
    woundedVehicles,
    medicCount,
    repairTruckCount,
    phase,
    doctrine,
    shift,
    difficultyMission,
    holdLineAssaultEvery,
    profileContract,
    objectiveContract,
    recoveryRoutes,
    timedScenario,
    productionWindow,
    powerDeficit,
  };
  runProductionWindow(turn);
  spawnHoldLineReinforcements(turn);
  directOwnerForces(turn);
  state.rngState = rng.state;
}

/** Campaign keeps its historical owner-1 opponent behavior. */
export function tickAi(state: SimState): void {
  tickAiForOwner(state, 1, [0]);
}

/** Run each assigned bot in stable owner order on every lockstep peer. */
export function tickMultiplayerAi(state: SimState): void {
  if (!state.multiplayer || state.result !== "playing") return;
  const active = state.multiplayerOwners ?? [];
  const bots = [...new Set(state.multiplayerAiOwners ?? [])].filter((owner) => active.includes(owner)).sort((a, b) => a - b);
  for (const owner of bots) {
    const opponents = active.filter((candidate) => candidate !== owner);
    if (opponents.length > 0) tickAiForOwner(state, owner, opponents);
  }
}

