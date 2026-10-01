import { BUILDING_STATS, UNIT_STATS, footprintOf, isAirUnit, isSupportUnit, isUnitAvailable } from "../../catalog";
import { isUnitEntity, type Entity, type MissionDirectorPhase, type Owner, type SimState, type UnitKind } from "../../types";
import { rngFromState } from "../../seed/rng";
import { missionDifficulty } from "../difficulty";
import { objectiveContractFor, profileContractFor, resolveMissionProfile } from "../../gen/profile";
import { byId, closestApproach, distToEntity, findBuildSite, livingView, powerFor, spawnBuilding, trySpawnUnit } from "../world";
import { tryBuildAntiAir, tryBuildForwardInfrastructure, tryBuildPower, tryBuildRefinery, tryBuildRunway, tryBuildTurret } from "./building";
import { assignAttack, assignAssault, assignMove, sendHome } from "./combat";
import { contestedResourcePoint, distance, queueUnit, shouldAutoRepair, shouldRetreat } from "./helpers";
import { enemyKnownPlayerEntities, nearestKnownPlayer } from "./visibility";
import { buildInfluenceMap } from "./influence";
import { isActiveScout, updateScouts } from "./scouting";
import { aiBehavior, setAiBehavior } from "./ownerState";
import { isCombatTarget } from "../combat/grid";
import { homeGuardCount, isTimedRecovery } from "../policy";
import { activeProducerFor } from "../producerState";

const YARD_DEFENSE_RANGE = 14;

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

export function directorPhase(state: SimState): MissionDirectorPhase {
  if (state.tutorialStage !== undefined) return "opening";
  return state.runtime?.director?.phase
    ?? (state.tick >= missionDifficulty(state.missionIndex).enemyAssaultEvery ? "pressure" : "opening");
}

export function guardScenarioObjectives(state: SimState, units: Entity[]): void {
  const runtime = state.runtime;
  if (!runtime || !["sabotage", "destroyMarked", "rescue", "extraction"].includes(runtime.kind)) return;
  const targets = runtime.targetIds
    .map((id) => byId(state, id))
    .filter((entity): entity is Entity => {
      if (!entity || entity.hp <= 0) return false;
      return isTimedRecovery(runtime.kind)
        ? entity.owner === 0 && entity.neutral === true
        : entity.owner === 1;
    });

  const activeTargetIds = new Set(targets.map((target) => target.id));
  for (const unit of units) {
    if (unit.scenarioGuardTargetId === undefined || activeTargetIds.has(unit.scenarioGuardTargetId)) continue;
    unit.scenarioGuardTargetId = undefined;
    if (unit.attackTarget === undefined) {
      unit.orderDestination = undefined;
      unit.path = [];
      unit.flowGoal = undefined;
      unit.routePending = false;
      unit.idle = true;
    }
  }
  if (!targets.length || !units.length) return;
  // Assign each guard at most one objective. If there are more targets than
  // guards, repeatedly assigning the same unit would make it flip between
  // perimeter tiles every tick.
  targets.slice(0, units.length).forEach((target, index) => {
    const guard = units.find((unit) => unit.scenarioGuardTargetId === target.id)
      ?? units.find((unit) => unit.scenarioGuardTargetId === undefined)
      ?? units[index % units.length]!;
    if (guard.attackTarget !== undefined) return;
    // Keep the selected perimeter tile stable while the guard approaches the
    // same building. Recomputing the nearest tile from a sub-tile position
    // can alternate between two equally close tiles at the midpoint.
    if (guard.scenarioGuardTargetId === target.id && guard.orderMode === "move") return;
    guard.scenarioGuardTargetId = target.id;
    assignMove(state, guard, closestApproach(state, guard, target));
  });
}

export function guardResourceLane(
  state: SimState,
  units: Entity[],
  yard: Entity,
  knownPlayers?: Entity[],
  aiOwner: Owner = 1,
  opponents: readonly Owner[] = [0],
): void {
  if (directorPhase(state) === "opening") return;
  const point = contestedResourcePoint(state, yard, knownPlayers, aiOwner, opponents);
  const guardIndex = homeGuardCount(state.missionIndex);
  if (!point || units.length <= guardIndex) return;

  const guard = [...units]
    .filter((unit) => unit.scenarioGuardTargetId === undefined)
    .sort((a, b) => distToEntity(a, yard) - distToEntity(b, yard) || a.id - b.id)[guardIndex];
  if (!guard || guard.attackTarget !== undefined) return;
  if (guard.orderDestination && distance(guard.orderDestination, point) < 2 && guard.orderMode === "move") return;
  assignMove(state, guard, point);
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

  const difficulty = missionDifficulty(state.missionIndex);
  const generatedHoldLine = state.win.kind === "holdTheLine" && state.runtime?.director !== undefined;
  // A rush that abandons the yard still has to survive the timer. Scale 8
  // made those runs unwinnable for the defender and let every rush hold.
  // With repairs paused between incoming shots, refresh survival pressure
  // slightly faster so rushing away from the yard still carries a risk.
  const holdLinePressureScale = generatedHoldLine ? 2.75 : 1;
  const holdLineAssaultEvery = difficulty.enemyAssaultEvery * holdLinePressureScale;
  const profile = state.runtime?.director
    ? resolveMissionProfile(state.seed, state.missionIndex, state.win.kind)
    : undefined;
  const profileContract = profile ? profileContractFor(profile) : undefined;
  const objectiveContract = objectiveContractFor(state.win.kind);
  const phase = directorPhase(state);
  const recoveryRoutes = state.gameplayRulesVersion === 2 && (state.runtime?.kind === "escort" || isTimedRecovery(state.runtime?.kind ?? state.win.kind));
  const timedScenario = state.runtime?.director !== undefined && (state.missionIndex >= 4 || recoveryRoutes) && (
    state.runtime.kind === "escort" || isTimedRecovery(state.runtime.kind)
  );
  const openingOffensive = !state.multiplayer && state.win.kind === "decapitate" && state.missionIndex < 2;
  const timedProductionScale = recoveryRoutes ? 4 : state.runtime?.kind === "extraction" ? 2.5 : 2;
  const holdLineProductionScale = holdLinePressureScale;
  const productionEvery = timedScenario
    ? Math.round(difficulty.enemyProductionEvery * timedProductionScale)
    : openingOffensive ? Math.round(difficulty.enemyProductionEvery * 4)
      : objectiveContract
        ? Math.max(1, Math.round(difficulty.enemyProductionEvery * objectiveContract.productionScale))
        : Math.round(difficulty.enemyProductionEvery * holdLineProductionScale);
  // Objective closeout windows need finite pressure: once the finale begins,
  // stop adding fresh enemy units or structures while keeping existing
  // defenses active. Otherwise the player can chase a moving target to timeout.
  const finiteCloseout = ["sabotage", "razeAll", "decapitate", "annihilate"].includes(state.win.kind) && phase === "finale";
  const productionWindow =
    state.tick >= difficulty.enemyProductionStart &&
    (state.tick - difficulty.enemyProductionStart) % productionEvery === 0 &&
    !finiteCloseout;
  const powerDeficit = powerFor(state, aiOwner) < 0;
  if (productionWindow || powerDeficit) {
    const factory = activeProducerFor(state, aiOwner, "factory");
    const barracks = activeProducerFor(state, aiOwner, "barracks");
    const runway = enemyBuildings.find((e) => e.kind === "runway" && e.constructing === 0 && !e.producing);
    const runwayCount = enemyBuildings.filter((e) => e.kind === "runway").length;
    // Introduce dedicated air infrastructure from mission 2 onward, after the
    // player has completed the opening mission and can answer the new threat.
    const airEnabled = state.multiplayer || state.missionIndex >= 2;
    const desiredRunways = state.missionIndex >= 4 ? 2 : 1;
    const aircraftCap = state.missionIndex >= 4 ? 2 : 1;
    const hasRefinery = enemyBuildings.some((e) => e.kind === "refinery");
    const want: UnitKind =
      playerTanks > playerInfantry && playerTanks > playerAntiArmor
        ? "antiArmor"
        : playerAntiArmor > playerTanks
          ? "infantry"
          : rng.chance(0.4) ? "tank" : "infantry";
    const producer = want === "infantry" || want === "antiArmor" ? barracks : factory;
    const supportWant =
      woundedHumans && medicCount === 0 && isUnitAvailable("medic", state.missionIndex) ? "medic"
        : woundedVehicles && repairTruckCount === 0 && isUnitAvailable("repairTruck", state.missionIndex) ? "repairTruck"
          : undefined;
    const supportProducer = supportWant === "medic" ? barracks : supportWant === "repairTruck" ? factory : undefined;
    const power = powerFor(state, aiOwner);
    if (power < 0) {
      // Restore the grid before expanding. If a plant is already under
      // construction (or no valid site/credits are available), stop here;
      // falling through would spend the remaining budget on unrelated
      // barracks while the deficit is still active.
      tryBuildPower(state, yard.x, yard.y, aiOwner);
    } else if (phase !== "opening" && tryBuildForwardInfrastructure(state, yard, knownPlayers, aiOwner, opponents)) {
      // Contest a remote resource lane before committing to another assault wave.
    } else if (!hasRefinery && tryBuildRefinery(state, yard.x, yard.y, aiOwner)) {
      // Keep ore income before spending on combat.
    } else if (!hasHarvester && factory && queueUnit(state, factory, "harvester", aiOwner)) {
      // Replace a lost harvester before more combat units.
    } else if (airEnabled && phase !== "opening" && runwayCount < desiredRunways && tryBuildRunway(state, yard, desiredRunways, aiOwner)) {
      // Establish dedicated air infrastructure before committing to a sortie.
    } else if (airEnabled && phase !== "opening" && runway && enemyAircraft.length < aircraftCap && queueUnit(state, runway, "strikePlane", aiOwner)) {
      // Runways each service one finite-ammunition strike plane.
    } else if (supportWant && supportProducer && queueUnit(state, supportProducer, supportWant, aiOwner)) {
      // Add one support unit when the army has a matching damaged domain.
    } else if (producer && queueUnit(state, producer, want, aiOwner)) {
      // Counter-produce against the player mix.
    } else if (state.credits[aiOwner] >= BUILDING_STATS.barracks.cost && !barracks) {
      const spot = findBuildSite(state, "barracks", yard.x - 3, yard.y, 12, aiOwner);
      if (spot) {
        state.credits[aiOwner] -= BUILDING_STATS.barracks.cost;
        spawnBuilding(state, aiOwner, "barracks", spot.x, spot.y, BUILDING_STATS.barracks.buildTicks);
      }
    } else if (state.credits[aiOwner] >= BUILDING_STATS.factory.cost && !factory) {
      const spot = findBuildSite(state, "factory", yard.x, yard.y - 3, 12, aiOwner);
      if (spot) {
        state.credits[aiOwner] -= BUILDING_STATS.factory.cost;
        spawnBuilding(state, aiOwner, "factory", spot.x, spot.y, BUILDING_STATS.factory.buildTicks);
      }
    } else if (power < 20) {
      tryBuildPower(state, yard.x, yard.y, aiOwner);
    }
  }

  if (state.win.kind === "holdTheLine" && state.tick > 0 && state.tick % holdLineAssaultEvery === 0) {
    const fp = footprintOf("constructionYard");
    const spot = { x: yard.x - 1, y: yard.y + fp.h };
    const spawned = trySpawnUnit(state, aiOwner, rng.chance(0.45) ? "tank" : "infantry", spot.x, spot.y);
    if (spawned) enemyUnits.push(spawned);
    if (state.missionIndex >= 4) {
      const extraSpawned = trySpawnUnit(state, aiOwner, "infantry", spot.x, spot.y + 1);
      if (extraSpawned) enemyUnits.push(extraSpawned);
    }
  }

  const playerYard = nearestKnownPlayer(
    state,
    yard,
    (entity) => opponents.includes(entity.owner) && entity.kind === "constructionYard",
    knownPlayers,
    aiOwner,
    opponents,
  );
  const pressureScale = timedScenario ? recoveryRoutes ? 4 : 2 : (!state.multiplayer && state.win.kind === "decapitate" && state.missionIndex < 2) ? 4 : 1;
  const waveEvery = Math.max(240, Math.round((holdLineAssaultEvery
    + (profileContract?.assaultEveryOffset ?? 0)
    + (objectiveContract?.assaultDelay ?? 0)) * pressureScale));
  for (const b of enemyBuildings) {
    if (b.constructing > 0 || b.hp <= 0) continue;
    if (b.hp < b.maxHp && shouldAutoRepair(state, b)) b.repairing = true;
    else if (!shouldAutoRepair(state, b)) b.repairing = false;
  }

  const threat = nearestKnownPlayer(
    state,
    yard,
    (e) => opponents.includes(e.owner) && isUnitEntity(e) && isCombatTarget(state, e) && e.kind !== "harvester" && !isSupportUnit(e.kind) && (
      (!e.neutral || e.scenarioRole === "convoy")
    ) && !(e.scenarioRole === "convoy" && state.runtime?.convoyStartTick !== undefined),
    knownPlayers,
    aiOwner,
    opponents,
  );
  const airThreat = nearestKnownPlayer(
    state,
    yard,
    (e) => opponents.includes(e.owner) && isUnitEntity(e) && isAirUnit(e.kind) && e.hp > 0 && isCombatTarget(state, e),
    knownPlayers,
    aiOwner,
    opponents,
  );
  const units = enemyUnits;
  const averageHealth = units.length ? units.reduce((sum, unit) => sum + unit.hp / unit.maxHp, 0) / units.length : 1;
  if (shouldRetreat(state, averageHealth, aiOwner)) setAiBehavior(state, aiOwner, "retreat");
  else if (threat && distToEntity(yard, threat) <= YARD_DEFENSE_RANGE) setAiBehavior(state, aiOwner, "defense");
  else if (playerYard && state.tick >= waveEvery) setAiBehavior(state, aiOwner, "assault");
  else if (units.length > 0 && state.tick % 180 === 0) setAiBehavior(state, aiOwner, "regroup");
  else setAiBehavior(state, aiOwner, "economy");

  if (airThreat && distToEntity(yard, airThreat) <= YARD_DEFENSE_RANGE + 4) {
    tryBuildAntiAir(state, yard, airThreat, aiOwner);
  }

  const behavior = aiBehavior(state, aiOwner);
  if (behavior === "defense" && threat && distToEntity(yard, threat) <= YARD_DEFENSE_RANGE) {
    tryBuildTurret(state, yard, threat, aiOwner);
    for (const u of units) {
      if (u.attackTarget) continue;
      assignAttack(state, u, threat);
    }
  } else if (behavior === "assault" && playerYard && state.tick > 0) {
    assignAssault(state, units, yard, playerYard, state.tick % waveEvery === 0, knownPlayers, aiOwner, opponents);
    for (const aircraft of enemyAircraft) {
      if (aircraft.attackTarget !== undefined && byId(state, aircraft.attackTarget)) continue;
      const aircraftTarget = nearestKnownPlayer(
        state,
        aircraft,
        (entity) => opponents.includes(entity.owner)
          && entity.class === "unit"
          && entity.kind !== "harvester"
          && !isAirUnit(entity.kind)
          && entity.hp > 0
          && isCombatTarget(state, entity),
        knownPlayers,
        aiOwner,
        opponents,
      ) ?? playerYard;
      assignAttack(state, aircraft, aircraftTarget);
    }
  } else if (behavior === "retreat") {
    for (const u of units) sendHome(state, u, yard);
  } else if (behavior === "economy" || behavior === "regroup") {
    for (const u of units) {
      // Combat acquires targets before the director runs. Do not replace an
      // active attack with a return-to-base route on the same tick.
      if (u.attackTarget !== undefined) continue;
      if (isActiveScout(state, u.id, aiOwner) && !playerYard) continue;
      if (distToEntity(u, yard) <= YARD_DEFENSE_RANGE) continue;
      sendHome(state, u, yard);
    }
    guardScenarioObjectives(state, units);
    if (!state.runtime || (state.runtime.kind !== "sabotage" && state.runtime.kind !== "destroyMarked")) {
      guardResourceLane(state, units, yard, knownPlayers, aiOwner, opponents);
    }
    // Escort has a hard completion deadline and its combat reserve must stay
    // with the convoy. Other mission types can afford the pre-contact patrol.
    if (state.runtime?.kind !== "escort") {
      const influence = buildInfluenceMap(state, knownPlayers, aiOwner, opponents);
      const scoutTasks = updateScouts(state, units, influence, !!playerYard, yard, aiOwner);
      for (const { unit, target } of scoutTasks) {
        assignMove(state, unit, target);
      }
    }
  }
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
