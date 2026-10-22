import type { ReadonlyMissionDef, SimState, UnitKind, Vec2 } from "../types";
import type { GeneratedMap } from "../gen/map";
import { objectiveContractFor } from "../gen/profile";
import type { MissionDifficulty } from "./difficulty";
import { spawnBuildingAt, spawnUnit } from "./world";
import { entitiesFor } from "./entities";

function baseOrientationVectors(from: Vec2, to: Vec2): { forward: Vec2; lateral: Vec2 } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const fx = Math.round(dx / len);
  const fy = Math.round(dy / len);
  const forwardX = fx !== 0 || fy !== 0 ? fx : 1;
  const forwardY = fx !== 0 || fy !== 0 ? fy : 1;
  return {
    forward: { x: forwardX, y: forwardY },
    lateral: { x: -forwardY, y: forwardX },
  };
}

function dirPoint(
  anchor: Vec2,
  forward: Vec2,
  lateral: Vec2,
  fDist: number,
  lDist: number,
  width: number,
  height: number,
): Vec2 {
  return {
    x: Math.max(3, Math.min(width - 4, Math.round(anchor.x + forward.x * fDist + lateral.x * lDist))),
    y: Math.max(3, Math.min(height - 4, Math.round(anchor.y + forward.y * fDist + lateral.y * lDist))),
  };
}

export function placePlayerBase(
  state: SimState,
  map: GeneratedMap,
  mission: ReadonlyMissionDef,
  difficulty: MissionDifficulty,
): void {
  const p = map.playerStart;
  const e = map.enemyStart;
  const pVecs = baseOrientationVectors(p, e);
  const offensiveMission = ["sabotage", "destroyMarked", "razeAll", "decapitate", "annihilate"].includes(mission.win.kind);
  // Player base layout
  spawnBuildingAt(state, 0, "constructionYard", p.x, p.y);
  const pPower = dirPoint(p, pVecs.forward, pVecs.lateral, -2, 2, state.width, state.height);
  spawnBuildingAt(state, 0, "power", pPower.x, pPower.y);
  const pRefinery = dirPoint(p, pVecs.forward, pVecs.lateral, 0, 3, state.width, state.height);
  spawnBuildingAt(state, 0, "refinery", pRefinery.x, pRefinery.y);
  const pHarvester = dirPoint(p, pVecs.forward, pVecs.lateral, 0, 4, state.width, state.height);
  spawnUnit(state, 0, "harvester", pHarvester.x, pHarvester.y);
  const pInfantry = dirPoint(p, pVecs.forward, pVecs.lateral, 3, 1, state.width, state.height);
  spawnUnit(state, 0, "infantry", pInfantry.x, pInfantry.y);

  if (mission.index >= 1 || offensiveMission) {
    const pTurret = dirPoint(p, pVecs.forward, pVecs.lateral, 4, 0, state.width, state.height);
    spawnBuildingAt(state, 0, "turret", pTurret.x, pTurret.y);
    const pBarracks = dirPoint(p, pVecs.forward, pVecs.lateral, 2, -2, state.width, state.height);
    spawnBuildingAt(state, 0, "barracks", pBarracks.x, pBarracks.y);
    const pAntiArmor = dirPoint(p, pVecs.forward, pVecs.lateral, 4, -1, state.width, state.height);
    spawnUnit(state, 0, "antiArmor", pAntiArmor.x, pAntiArmor.y);
  }
  if (mission.index >= 4 || offensiveMission || mission.win.kind === "holdTheLine") {
    const pTank = dirPoint(p, pVecs.forward, pVecs.lateral, 5, 0, state.width, state.height);
    spawnUnit(state, 0, "tank", pTank.x, pTank.y);
  }
  if (mission.win.kind === "annihilate") {
    const pAssaultTank = dirPoint(p, pVecs.forward, pVecs.lateral, 6, 2, state.width, state.height);
    spawnUnit(state, 0, "tank", pAssaultTank.x, pAssaultTank.y);
    const pAssaultAntiArmor = dirPoint(p, pVecs.forward, pVecs.lateral, 6, -2, state.width, state.height);
    spawnUnit(state, 0, "antiArmor", pAssaultAntiArmor.x, pAssaultAntiArmor.y);
  }
  if (mission.win.kind === "decapitate" || mission.win.kind === "annihilate") {
    const pAssaultMedic = dirPoint(p, pVecs.forward, pVecs.lateral, 3, 3, state.width, state.height);
    spawnUnit(state, 0, "medic", pAssaultMedic.x, pAssaultMedic.y);
  }
  for (let turretIndex = 0; turretIndex < difficulty.offensiveStartingTurrets && offensiveMission; turretIndex += 1) {
    const pExtraTurret = dirPoint(p, pVecs.forward, pVecs.lateral, 3, 2 + turretIndex * 2, state.width, state.height);
    spawnBuildingAt(state, 0, "turret", pExtraTurret.x, pExtraTurret.y);
  }
  if (mission.index >= 3 || offensiveMission) {
    const pFactory = dirPoint(p, pVecs.forward, pVecs.lateral, -3, -2, state.width, state.height);
    spawnBuildingAt(state, 0, "factory", pFactory.x, pFactory.y);
  }
  if (mission.index === 0 && !offensiveMission) {
    const pBarracks = dirPoint(p, pVecs.forward, pVecs.lateral, 2, -2, state.width, state.height);
    spawnBuildingAt(state, 0, "barracks", pBarracks.x, pBarracks.y);
  }

  for (const building of entitiesFor(state).filter((entity) => entity.owner === 0 && entity.class === "building" && entity.hp > 0 && entity.constructing === 0)) {
    state.buildingsCompleted[0] += 1;
    state.buildingsCompletedByKind[building.kind] = (state.buildingsCompletedByKind[building.kind] ?? 0) + 1;
  }
}

export function placeEnemyBase(
  state: SimState,
  map: GeneratedMap,
  mission: ReadonlyMissionDef,
  difficulty: MissionDifficulty,
): void {
  const e = map.enemyStart;
  const p = map.playerStart;
  const eVecs = baseOrientationVectors(e, p);
  // Enemy base layout
  spawnBuildingAt(state, 1, "constructionYard", e.x, e.y);
  const ePower = dirPoint(e, eVecs.forward, eVecs.lateral, -2, 2, state.width, state.height);
  spawnBuildingAt(state, 1, "power", ePower.x, ePower.y);
  const eRefinery = dirPoint(e, eVecs.forward, eVecs.lateral, 0, 3, state.width, state.height);
  spawnBuildingAt(state, 1, "refinery", eRefinery.x, eRefinery.y);
  const eBarracks = dirPoint(e, eVecs.forward, eVecs.lateral, 2, -2, state.width, state.height);
  spawnBuildingAt(state, 1, "barracks", eBarracks.x, eBarracks.y);
  if (difficulty.startingTurret) {
    const eTurret = dirPoint(e, eVecs.forward, eVecs.lateral, 4, 0, state.width, state.height);
    spawnBuildingAt(state, 1, "turret", eTurret.x, eTurret.y);
  }
  const eHarvester = dirPoint(e, eVecs.forward, eVecs.lateral, 0, 4, state.width, state.height);
  spawnUnit(state, 1, "harvester", eHarvester.x, eHarvester.y);
  const eInfantry = dirPoint(e, eVecs.forward, eVecs.lateral, 3, 1, state.width, state.height);
  spawnUnit(state, 1, "infantry", eInfantry.x, eInfantry.y);
  if (difficulty.startingTank) {
    const eTank = dirPoint(e, eVecs.forward, eVecs.lateral, 4, -1, state.width, state.height);
    spawnUnit(state, 1, "tank", eTank.x, eTank.y);
  }

  const openingGuardKinds: UnitKind[] = ["infantry", "antiArmor", "tank"];
  for (let i = 0; i < difficulty.startingGuards; i++) {
    const guardPos = dirPoint(e, eVecs.forward, eVecs.lateral, 3 + Math.floor(i / 3), -2 + (i % 3) * 2, state.width, state.height);
    spawnUnit(state, 1, openingGuardKinds[i % openingGuardKinds.length]!, guardPos.x, guardPos.y);
  }

  const extraGuards = Math.floor(mission.index / 2);
  for (let i = 0; i < extraGuards; i++) {
    const extraGuardPos = dirPoint(e, eVecs.forward, eVecs.lateral, 4 + Math.floor(i / 2), i % 2 === 0 ? 2 : -2, state.width, state.height);
    spawnUnit(state, 1, i % 2 === 0 ? "infantry" : "antiArmor", extraGuardPos.x, extraGuardPos.y);
  }
  if (mission.index >= 3) {
    const eFactory = dirPoint(e, eVecs.forward, eVecs.lateral, -3, -2, state.width, state.height);
    spawnBuildingAt(state, 1, "factory", eFactory.x, eFactory.y);
    const eSecondTurret = dirPoint(e, eVecs.forward, eVecs.lateral, 4, -3, state.width, state.height);
    spawnBuildingAt(state, 1, "turret", eSecondTurret.x, eSecondTurret.y);
  }

  const assault =
    mission.win.kind === "razeAll" ||
    mission.win.kind === "decapitate" ||
    mission.win.kind === "annihilate" ||
    mission.win.kind === "destroyMarked";
  if (assault && difficulty.assaultSupport && (objectiveContractFor(mission.win.kind)?.startingSupport ?? true)) {
    const assaultTurret = dirPoint(e, eVecs.forward, eVecs.lateral, 3, 2, state.width, state.height);
    spawnBuildingAt(state, 1, "turret", assaultTurret.x, assaultTurret.y);
    const assaultTank = dirPoint(e, eVecs.forward, eVecs.lateral, 4, 1, state.width, state.height);
    spawnUnit(state, 1, "tank", assaultTank.x, assaultTank.y);
  }

  if (mission.win.kind === "holdTheLine") {
    const holdLineKinds: UnitKind[] = ["infantry", "antiArmor", "tank", "infantry", "antiArmor", "tank", "infantry", "antiArmor"];
    // The hold objective already receives periodic pressure waves. Keep one
    // opening reinforcement slot available for the player's defensive setup.
    const openingHoldReinforcements = Math.max(0, difficulty.holdLineReinforcements - 1);
    for (let i = 0; i < openingHoldReinforcements; i++) {
      const kind = holdLineKinds[i]!;
      const pos = dirPoint(e, eVecs.forward, eVecs.lateral, 3 + (i % 2), -3 + (i % 3) * 2, state.width, state.height);
      spawnUnit(state, 1, kind, pos.x, pos.y);
    }
  }
}

export function placeHoldOutposts(state: SimState, map: GeneratedMap): void {
  // Center-Hold perimeter outposts
  if (map.enemyOutposts && map.enemyOutposts.length > 0) {
    for (const outpost of map.enemyOutposts) {
      spawnBuildingAt(state, 1, "turret", outpost.x, outpost.y);
      spawnUnit(state, 1, "infantry", outpost.x + 1, outpost.y);
      spawnUnit(state, 1, "antiArmor", outpost.x - 1, outpost.y);
    }
  }
}
