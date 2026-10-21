import { explicitFactionArchetype, type FactionArchetype } from "../gen/names";
import type { BiomeName, DeploymentEdge, Owner, SimState } from "../types";

export type { DeploymentEdge };

export const DEPLOYMENT_EDGES: readonly DeploymentEdge[] = [
  "veteranSquad",
  "forwardTurret",
  "airSortie",
  "powerReserve",
];

export const POWER_RESERVE_BONUS = 40;
export const VETERAN_DAMAGE = 48;
export const FINALE_WARNING_TICKS = 120;
export const CACHE_CREDITS = 450;
export const CACHE_FINALE_PULL_TICKS = 240;
export const VOLCANIC_CLOSURE_PERIOD = 600;
export const VOLCANIC_CLOSURE_WINDOW = 120;
export const VOLCANIC_CLOSURE_COST = 2.8;
export const CANYON_GULLY_VEHICLE_COST = 1.45;

export function isDeploymentEdge(value: unknown): value is DeploymentEdge {
  return typeof value === "string" && (DEPLOYMENT_EDGES as readonly string[]).includes(value);
}

export function campaignIdentityActive(state: Pick<SimState, "multiplayer" | "tutorialStage">): boolean {
  return state.multiplayer !== true && state.tutorialStage === undefined;
}

export type EnemyDoctrine = {
  archetype: FactionArchetype;
  assaultScale: number;
  thinTurrets: boolean;
  thickTurrets: boolean;
  raidHarvesters: boolean;
  supportFirst: boolean;
  retreatEnterBonus: number;
};

/** Campaign enemy behavior derived from the generated faction name. */
export function enemyDoctrine(state: SimState, aiOwner: Owner = 1): EnemyDoctrine | undefined {
  if (!campaignIdentityActive(state) || aiOwner !== 1) return undefined;
  const archetype = explicitFactionArchetype(state.factions[1]?.name ?? "");
  if (!archetype) return undefined;
  return {
    archetype,
    assaultScale: archetype === "legion" ? 0.82 : 1,
    thinTurrets: archetype === "legion",
    thickTurrets: archetype === "directorate",
    raidHarvesters: archetype === "syndicate",
    supportFirst: archetype === "concord",
    retreatEnterBonus: archetype === "concord" ? 0.1 : 0,
  };
}

export function volcanicClosureCost(tick: number, kind: string, active: boolean): number | undefined {
  if (!active || kind !== "lavaScar") return undefined;
  return tick % VOLCANIC_CLOSURE_PERIOD < VOLCANIC_CLOSURE_WINDOW ? VOLCANIC_CLOSURE_COST : undefined;
}

export function canyonGullyVehicleCost(kind: string, active: boolean): number | undefined {
  return active && kind === "strataGully" ? CANYON_GULLY_VEHICLE_COST : undefined;
}

const GROUND_NOTES: Record<BiomeName, string> = {
  "ash plains": "Ash drifts cut sight by one.",
  "crystal flats": "Crystal ground extends sight, and power plants yield extra power.",
  "rust canyons": "Gullies slow vehicles, so the shelf is the faster route. Units in a gully take less damage.",
  "salt marshes": "Mud slows vehicles.",
  "glass desert": "Open glass extends weapon range.",
  "tundra grid": "Packed frost lets vehicles move faster.",
  "jungle wreckage": "Infantry in the canopy take less damage.",
  "volcanic shelf": "Shots from the shelf hit harder. Lava scars periodically slow movement.",
};

const DOCTRINE_NOTES: Record<FactionArchetype, string> = {
  legion: "The enemy attacks sooner and does not dig in behind new turrets.",
  syndicate: "The enemy raids harvesters and ore lanes.",
  directorate: "The enemy builds and repairs turrets.",
  concord: "The enemy fields medics and repair trucks, then pulls its damaged units back.",
};

export function fieldNotes(enemyName: string, biome: BiomeName): { doctrine?: string; ground: string } {
  const archetype = explicitFactionArchetype(enemyName);
  return {
    doctrine: archetype ? DOCTRINE_NOTES[archetype] : undefined,
    ground: GROUND_NOTES[biome],
  };
}

export function deploymentEdgeForMission(
  progress: { unlockedMission: number; deploymentEdge?: DeploymentEdge },
  missionIndex: number,
): DeploymentEdge | undefined {
  if (!progress.deploymentEdge || missionIndex <= 0 || missionIndex !== progress.unlockedMission) return undefined;
  return progress.deploymentEdge;
}
