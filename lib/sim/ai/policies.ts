import { BUILDING_STATS, footprintOf, isAirUnit, isSupportUnit, isUnitAvailable } from "../../catalog";
import { isUnitEntity, type Entity, type MissionDirectorPhase, type Owner, type SimState, type UnitKind } from "../../types";
import type { Rng } from "../../seed/rng";
import { adaptiveAirCapacity, adaptiveCombatWant, retreatEnterHealth } from "../proficiency";
import type { MissionObjectiveContract, MissionProfileContract } from "../../gen/profile";
import { byId, distToEntity, findBuildSite, powerFor, spawnBuilding, trySpawnUnit } from "../world";
import { tryBuildAntiAir, tryBuildForwardInfrastructure, tryBuildPower, tryBuildRefinery, tryBuildRunway, tryBuildTurret } from "./building";
import { assignAttack, assignAssault, assignMove, sendHome } from "./combat";
import { queueUnit, shouldAutoRepair, shouldRetreat } from "./helpers";
import { nearestKnownPlayer } from "./visibility";
import { buildInfluenceMap } from "./influence";
import { isActiveScout, updateScouts } from "./scouting";
import { aiBehavior, setAiBehavior } from "./ownerState";
import { isCombatTarget } from "../combat/grid";
import { activeProducerFor } from "../producerState";
import type { EnemyDoctrine } from "../fieldIdentity";
import { guardResourceLane, guardScenarioObjectives } from "./guards";

export const YARD_DEFENSE_RANGE = 14;

export type AiOwnerTurn = {
  state: SimState;
  aiOwner: Owner;
  opponents: readonly Owner[];
  rng: Rng;
  knownPlayers: Entity[];
  enemyBuildings: Entity[];
  enemyUnits: Entity[];
  enemyAircraft: Entity[];
  yard: Entity;
  hasHarvester: boolean;
  playerTanks: number;
  playerInfantry: number;
  playerAntiArmor: number;
  woundedHumans: boolean;
  woundedVehicles: boolean;
  medicCount: number;
  repairTruckCount: number;
  phase: MissionDirectorPhase;
  doctrine: EnemyDoctrine | undefined;
  shift: number;
  difficultyMission: number;
  holdLineAssaultEvery: number;
  profileContract: MissionProfileContract | undefined;
  objectiveContract: MissionObjectiveContract | undefined;
  recoveryRoutes: boolean;
  timedScenario: boolean;
  productionWindow: boolean;
  powerDeficit: boolean;
};

export function runProductionWindow(turn: AiOwnerTurn): void {
  const {
    state, aiOwner, enemyBuildings, phase, knownPlayers, opponents, yard, hasHarvester,
    difficultyMission, shift, rng, playerTanks, playerInfantry, playerAntiArmor, doctrine,
    medicCount, repairTruckCount, woundedHumans, woundedVehicles, enemyAircraft, productionWindow,
    powerDeficit,
  } = turn;
  if (productionWindow || powerDeficit) {
    const factory = activeProducerFor(state, aiOwner, "factory");
    const barracks = activeProducerFor(state, aiOwner, "barracks");
    const runway = enemyBuildings.find((e) => e.kind === "runway" && e.constructing === 0 && !e.producing);
    const runwayCount = enemyBuildings.filter((e) => e.kind === "runway").length;
    // Introduce dedicated air infrastructure from mission 2 onward, after the
    // player has completed the opening mission and can answer the new threat.
    const airEnabled = state.multiplayer || state.missionIndex >= 2;
    const airCapacity = adaptiveAirCapacity(difficultyMission, shift);
    const desiredRunways = airCapacity;
    const aircraftCap = airCapacity;
    const hasRefinery = enemyBuildings.some((e) => e.kind === "refinery");
    const want: UnitKind = adaptiveCombatWant(
      { tanks: playerTanks, infantry: playerInfantry, antiArmor: playerAntiArmor },
      shift,
      (chance) => rng.chance(chance),
    );
    const producer = want === "infantry" || want === "antiArmor" ? barracks : factory;
    const supportWant =
      doctrine?.supportFirst && medicCount === 0 && isUnitAvailable("medic", state.missionIndex) ? "medic"
        : doctrine?.supportFirst && repairTruckCount === 0 && isUnitAvailable("repairTruck", state.missionIndex) ? "repairTruck"
          : woundedHumans && medicCount === 0 && isUnitAvailable("medic", state.missionIndex) ? "medic"
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
}

export function spawnHoldLineReinforcements(turn: AiOwnerTurn): void {
  const { shift, state, holdLineAssaultEvery, yard, rng, enemyUnits, aiOwner } = turn;
  if (shift >= 0 && state.win.kind === "holdTheLine" && state.tick > 0 && state.tick % holdLineAssaultEvery === 0) {
    const fp = footprintOf("constructionYard");
    const spot = { x: yard.x - 1, y: yard.y + fp.h };
    const spawned = trySpawnUnit(state, aiOwner, rng.chance(0.45) ? "tank" : "infantry", spot.x, spot.y);
    if (spawned) enemyUnits.push(spawned);
    if (state.missionIndex >= 4) {
      const extraSpawned = trySpawnUnit(state, aiOwner, "infantry", spot.x, spot.y + 1);
      if (extraSpawned) enemyUnits.push(extraSpawned);
    }
  }
}

export function directOwnerForces(turn: AiOwnerTurn): void {
  const {
    state, yard, knownPlayers, aiOwner, opponents, enemyBuildings, doctrine, timedScenario,
    recoveryRoutes, holdLineAssaultEvery, profileContract, objectiveContract, enemyUnits,
    enemyAircraft, shift,
  } = turn;
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
    + (objectiveContract?.assaultDelay ?? 0)) * pressureScale * (doctrine?.assaultScale ?? 1)));
  for (const b of enemyBuildings) {
    if (b.constructing > 0 || b.hp <= 0) continue;
    const directorateRepair = doctrine?.thickTurrets === true && b.kind !== "objective" && !b.marked && b.hp < b.maxHp * 0.85;
    if (b.hp < b.maxHp && (shouldAutoRepair(state, b) || directorateRepair)) b.repairing = true;
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
  if (shouldRetreat(state, averageHealth, aiOwner, retreatEnterHealth(shift) + (doctrine?.retreatEnterBonus ?? 0))) setAiBehavior(state, aiOwner, "retreat");
  else if (threat && distToEntity(yard, threat) <= YARD_DEFENSE_RANGE) setAiBehavior(state, aiOwner, "defense");
  else if (playerYard && state.tick >= waveEvery) setAiBehavior(state, aiOwner, "assault");
  else if (units.length > 0 && state.tick % 180 === 0) setAiBehavior(state, aiOwner, "regroup");
  else setAiBehavior(state, aiOwner, "economy");

  if (airThreat && distToEntity(yard, airThreat) <= YARD_DEFENSE_RANGE + 4) {
    tryBuildAntiAir(state, yard, airThreat, aiOwner, shift);
  }

  const behavior = aiBehavior(state, aiOwner);
  if (doctrine?.thickTurrets && state.tick % 240 === 0 && behavior !== "assault") {
    tryBuildTurret(state, yard, threat ?? yard, aiOwner, shift);
  }
  if (behavior === "defense" && threat && distToEntity(yard, threat) <= YARD_DEFENSE_RANGE) {
    if (!doctrine?.thinTurrets) tryBuildTurret(state, yard, threat, aiOwner, shift);
    for (const u of units) {
      if (u.attackTarget) continue;
      assignAttack(state, u, threat);
    }
  } else if (behavior === "assault" && playerYard && state.tick > 0) {
    assignAssault(state, units, yard, playerYard, state.tick % waveEvery === 0, knownPlayers, aiOwner, opponents, shift);
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
}
