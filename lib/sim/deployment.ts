import type { DeploymentEdge, SimState } from "../types";
import { POWER_RESERVE_BONUS } from "./fieldIdentity";
import { spawnBuildingAt, trySpawnUnit } from "./world";

/** Applies one chosen reward to a freshly created campaign mission. */
export function applyDeploymentEdge(state: SimState, edge: DeploymentEdge | undefined): void {
  if (!edge || state.multiplayer || state.tutorialStage !== undefined) return;
  const yard = state.entities.find((entity) => entity.owner === 0 && entity.class === "building" && entity.kind === "constructionYard" && entity.hp > 0);
  if (!yard) return;
  if (edge === "powerReserve") {
    state.powerReserve = POWER_RESERVE_BONUS;
    return;
  }
  if (edge === "forwardTurret") {
    const turret = spawnBuildingAt(state, 0, "turret", yard.x + 3, yard.y, 0);
    if (turret) {
      state.buildingsCompleted[0] += 1;
      state.buildingsCompletedByKind.turret = (state.buildingsCompletedByKind.turret ?? 0) + 1;
    }
    return;
  }
  if (edge === "airSortie") {
    const plane = trySpawnUnit(state, 0, "strikePlane", yard.x + 2, yard.y + 2);
    if (!plane) return;
    plane.ammo = 3;
    plane.maxAmmo = 3;
    plane.flightState = "airborne";
    state.unitsProduced[0] += 1;
    state.unitsProducedByRole.strikePlane += 1;
    return;
  }
  for (let index = 0; index < 4; index += 1) {
    const veteran = trySpawnUnit(state, 0, "infantry", yard.x + 2, yard.y + index);
    if (!veteran) continue;
    veteran.veteranRank = 1;
    state.unitsProduced[0] += 1;
    state.unitsProducedByRole.infantry += 1;
  }
}
