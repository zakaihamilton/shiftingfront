import { assignAttack } from "@/lib/sim/ai/combat";
import { spawnBuilding, spawnUnit } from "@/lib/sim/world";
import type { BuildingKind, Entity, UnitKind, Vec2 } from "@/lib/types";
import { canPlaceBuilding } from "@/lib/sim/world";
import { BUILDING_STATS } from "@/lib/catalog";
import type { createMission } from "@/lib/sim/api";

export const CINEMA_SEED = 1847;

export type CinemaScenarioKind =
  | "baseAssault"
  | "turretDefense"
  | "harvesterAmbush"
  | "armorClash"
  | "infantryStorm"
  | "convoyRaid";

export const CINEMA_SCENARIO_KINDS: readonly CinemaScenarioKind[] = [
  "baseAssault",
  "turretDefense",
  "harvesterAmbush",
  "armorClash",
  "infantryStorm",
  "convoyRaid",
];

export type CinemaScenarioAnchor = "playerBase" | "enemyBase" | "resourceField" | "midfield";
export type CinemaTargetPolicy = "enemyStructure" | "playerStructure" | "harvester" | "armor" | "infantry" | "convoy";

export const CINEMA_BUILDING_SEARCH_RADIUS = 8;

export interface CinemaScenarioDef {
  defendingOwner: 0 | 1;
  structures: readonly [BuildingKind, BuildingKind];
  anchor: CinemaScenarioAnchor;
  targetPolicy: CinemaTargetPolicy;
  playerOffsets: readonly Vec2[];
  enemyOffsets: readonly Vec2[];
  structureOffsets: readonly [Vec2, Vec2];
  replacementKinds: { player: readonly UnitKind[]; enemy: readonly UnitKind[] };
}

export const CINEMA_SCENARIOS: Record<CinemaScenarioKind, CinemaScenarioDef> = {
  // Enemy base assault (Player attacks enemy base at e0; structures are 100% Enemy / owner 1)
  baseAssault: {
    defendingOwner: 1,
    structures: ["turret", "barracks"],
    anchor: "enemyBase",
    targetPolicy: "enemyStructure",
    playerOffsets: [{ x: -3, y: 1 }, { x: -2, y: 2 }, { x: -3, y: 3 }, { x: -1, y: 3 }],
    enemyOffsets: [{ x: 2, y: -1 }, { x: 3, y: -2 }, { x: 3, y: 0 }, { x: 1, y: -2 }],
    structureOffsets: [{ x: 1, y: -1 }, { x: 2, y: -2 }],
    replacementKinds: { player: ["tank", "antiArmor"], enemy: ["tank", "antiArmor", "infantry"] },
  },
  // Home base defense (Enemy attacks player base at p0; structures are 100% Player / owner 0)
  turretDefense: {
    defendingOwner: 0,
    structures: ["turret", "factory"],
    anchor: "playerBase",
    targetPolicy: "playerStructure",
    playerOffsets: [{ x: -2, y: -1 }, { x: -1, y: 0 }, { x: -2, y: 1 }, { x: 0, y: 1 }],
    enemyOffsets: [{ x: 3, y: -2 }, { x: 4, y: -1 }, { x: 4, y: 0 }, { x: 3, y: 1 }],
    structureOffsets: [{ x: -1, y: -1 }, { x: -2, y: -2 }],
    replacementKinds: { player: ["tank", "infantry"], enemy: ["tank", "antiArmor"] },
  },
  // Enemy resource base ambush (Player ambushes enemy mining operations at e0; structures are 100% Enemy / owner 1)
  harvesterAmbush: {
    defendingOwner: 1,
    structures: ["refinery", "power"],
    anchor: "resourceField",
    targetPolicy: "harvester",
    playerOffsets: [{ x: -3, y: 1 }, { x: -2, y: 2 }, { x: -2, y: 3 }, { x: -3, y: 3 }],
    enemyOffsets: [{ x: 1, y: -1 }, { x: 2, y: 0 }, { x: 3, y: -1 }, { x: 2, y: 1 }],
    structureOffsets: [{ x: 1, y: -2 }, { x: 2, y: -2 }],
    replacementKinds: { player: ["antiArmor", "tank", "infantry"], enemy: ["tank", "antiArmor", "infantry"] },
  },
  // Enemy forward vehicle factory assault (Player armor attacks enemy factory at e0; structures are 100% Enemy / owner 1)
  armorClash: {
    defendingOwner: 1,
    structures: ["factory", "turret"],
    anchor: "midfield",
    targetPolicy: "armor",
    playerOffsets: [{ x: -4, y: -1 }, { x: -3, y: 0 }, { x: -2, y: 1 }, { x: -5, y: -1 }],
    enemyOffsets: [{ x: 4, y: 1 }, { x: 3, y: 0 }, { x: 2, y: -1 }, { x: 5, y: 1 }],
    structureOffsets: [{ x: 3, y: -2 }, { x: 2, y: -3 }],
    replacementKinds: { player: ["tank"], enemy: ["tank"] },
  },
  // Home base defense against infantry assault (Enemy storming player base at p0; structures are 100% Player / owner 0)
  infantryStorm: {
    defendingOwner: 0,
    structures: ["barracks", "power"],
    anchor: "playerBase",
    targetPolicy: "infantry",
    playerOffsets: [{ x: -2, y: -1 }, { x: -1, y: 0 }, { x: -2, y: 1 }, { x: -1, y: 1 }],
    enemyOffsets: [{ x: 3, y: -1 }, { x: 4, y: 0 }, { x: 3, y: 1 }, { x: 2, y: 1 }],
    structureOffsets: [{ x: -1, y: -2 }, { x: -2, y: -2 }],
    replacementKinds: { player: ["infantry", "antiArmor"], enemy: ["infantry", "antiArmor"] },
  },
  // Home base raid interception (Enemy raiding player logistics base at p0; structures are 100% Player / owner 0)
  convoyRaid: {
    defendingOwner: 0,
    structures: ["turret", "refinery"],
    anchor: "midfield",
    targetPolicy: "convoy",
    playerOffsets: [{ x: -3, y: -2 }, { x: -2, y: -1 }, { x: -3, y: 0 }, { x: -1, y: 0 }],
    enemyOffsets: [{ x: 3, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 1 }, { x: 3, y: 2 }],
    structureOffsets: [{ x: -1, y: 2 }, { x: -2, y: 2 }],
    replacementKinds: { player: ["tank", "antiArmor"], enemy: ["tank", "antiArmor", "infantry"] },
  },
};

export const CINEMA_STRUCTURE_KINDS: Record<CinemaScenarioKind, { player?: BuildingKind; enemy?: BuildingKind; primary: BuildingKind; secondary: BuildingKind }> = {
  baseAssault: { primary: "turret", secondary: "barracks", enemy: "turret" },
  turretDefense: { primary: "turret", secondary: "factory", player: "turret" },
  harvesterAmbush: { primary: "refinery", secondary: "power", enemy: "refinery" },
  armorClash: { primary: "factory", secondary: "turret", enemy: "factory" },
  infantryStorm: { primary: "barracks", secondary: "power", player: "barracks" },
  convoyRaid: { primary: "turret", secondary: "refinery", player: "turret" },
};

export function spawnCinemaBuilding(
  state: ReturnType<typeof createMission>,
  owner: 0 | 1,
  kind: BuildingKind,
  preferred: { x: number; y: number },
  anchor: { x: number; y: number },
) {
  const candidates: { x: number; y: number }[] = [];
  for (let dy = -CINEMA_BUILDING_SEARCH_RADIUS; dy <= CINEMA_BUILDING_SEARCH_RADIUS; dy++) {
    for (let dx = -CINEMA_BUILDING_SEARCH_RADIUS; dx <= CINEMA_BUILDING_SEARCH_RADIUS; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > CINEMA_BUILDING_SEARCH_RADIUS) continue;
      const x = preferred.x + dx;
      const y = preferred.y + dy;
      if (!canPlaceBuilding(state, kind, x, y, owner, false)) continue;
      const footprint = BUILDING_STATS[kind].footprint;
      const overlapsUnit = state.entities.some(
        (entity) => entity.class === "unit" && entity.hp > 0
          && Math.round(entity.x) < x + footprint.w
          && Math.round(entity.x) >= x
          && Math.round(entity.y) < y + footprint.h
          && Math.round(entity.y) >= y,
      );
      if (!overlapsUnit) candidates.push({ x, y });
    }
  }
  const anchorIso = anchor.x - anchor.y;
  const anchorSum = anchor.x + anchor.y;
  candidates.sort((a, b) => {
    const anchorDistance = Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y);
    if (anchorDistance !== 0) return anchorDistance;
    const sumDelta = Math.abs((a.x + a.y) - anchorSum) - Math.abs((b.x + b.y) - anchorSum);
    if (sumDelta !== 0) return sumDelta;
    const isoDelta = Math.abs((a.x - a.y) - anchorIso) - Math.abs((b.x - b.y) - anchorIso);
    if (isoDelta !== 0) return isoDelta;
    const preferredDelta = Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y);
    if (preferredDelta !== 0) return preferredDelta;
    return a.x - b.x || a.y - b.y;
  });
  const spot = candidates[0];
  if (!spot) throw new Error(`No valid cinema building site for ${kind}`);
  return spawnBuilding(state, owner, kind, spot.x, spot.y);
}

export interface ScenarioSpawnResult {
  pUnits: ReturnType<typeof spawnUnit>[];
  eUnits: ReturnType<typeof spawnUnit>[];
  structures: ReturnType<typeof spawnBuilding>[];
  objectiveTarget?: Entity;
  playerStructure?: ReturnType<typeof spawnBuilding>;
  enemyStructure?: ReturnType<typeof spawnBuilding>;
  defendingOwner: 0 | 1;
}

function offsetSlots(anchor: { x: number; y: number }, offsets: readonly Vec2[]): { x: number; y: number }[] {
  return offsets.map((offset) => ({ x: anchor.x + offset.x, y: anchor.y + offset.y }));
}

export function populateScenarioForces(
  state: ReturnType<typeof createMission>,
  scenarioKind: CinemaScenarioKind,
  clashX: number,
  clashY: number,
): ScenarioSpawnResult {
  const pUnits: ReturnType<typeof spawnUnit>[] = [];
  const eUnits: ReturnType<typeof spawnUnit>[] = [];
  const scenarioDef = CINEMA_SCENARIOS[scenarioKind];
  const defendingOwner = scenarioDef.defendingOwner;
  const [bKind1, bKind2] = scenarioDef.structures;
  const pSlots = offsetSlots({ x: clashX, y: clashY }, scenarioDef.playerOffsets);
  const eSlots = offsetSlots({ x: clashX, y: clashY }, scenarioDef.enemyOffsets);
  let objectiveTarget: Entity | undefined;

  if (scenarioKind === "baseAssault") {
    // Player assault breaching enemy forward fortification
    pUnits.push(
      spawnUnit(state, 0, "tank", pSlots[0]!.x, pSlots[0]!.y),
      spawnUnit(state, 0, "tank", pSlots[1]!.x, pSlots[1]!.y),
      spawnUnit(state, 0, "antiArmor", pSlots[2]!.x, pSlots[2]!.y),
      spawnUnit(state, 0, "repairTruck", pSlots[3]!.x, pSlots[3]!.y),
    );
    eUnits.push(
      spawnUnit(state, 1, "tank", eSlots[0]!.x, eSlots[0]!.y),
      spawnUnit(state, 1, "antiArmor", eSlots[1]!.x, eSlots[1]!.y),
      spawnUnit(state, 1, "infantry", eSlots[3]!.x, eSlots[3]!.y),
    );
  } else if (scenarioKind === "turretDefense") {
    // Player defending forward gun turret outpost against armored assault
    pUnits.push(
      spawnUnit(state, 0, "tank", pSlots[0]!.x, pSlots[0]!.y),
      spawnUnit(state, 0, "infantry", pSlots[2]!.x, pSlots[2]!.y),
      spawnUnit(state, 0, "medic", pSlots[3]!.x, pSlots[3]!.y),
    );
    eUnits.push(
      spawnUnit(state, 1, "tank", eSlots[0]!.x, eSlots[0]!.y),
      spawnUnit(state, 1, "tank", eSlots[1]!.x, eSlots[1]!.y),
      spawnUnit(state, 1, "antiArmor", eSlots[2]!.x, eSlots[2]!.y),
      spawnUnit(state, 1, "infantry", eSlots[3]!.x, eSlots[3]!.y),
    );
  } else if (scenarioKind === "harvesterAmbush") {
    // Ambush on enemy ore harvester and escort
    const harvester = spawnUnit(state, 1, "harvester", eSlots[1]!.x, eSlots[1]!.y);
    objectiveTarget = harvester;
    eUnits.push(
      harvester,
      spawnUnit(state, 1, "tank", eSlots[0]!.x, eSlots[0]!.y),
      spawnUnit(state, 1, "antiArmor", eSlots[2]!.x, eSlots[2]!.y),
      spawnUnit(state, 1, "infantry", eSlots[3]!.x, eSlots[3]!.y),
    );
    pUnits.push(
      spawnUnit(state, 0, "antiArmor", pSlots[0]!.x, pSlots[0]!.y),
      spawnUnit(state, 0, "antiArmor", pSlots[1]!.x, pSlots[1]!.y),
      spawnUnit(state, 0, "tank", pSlots[2]!.x, pSlots[2]!.y),
      spawnUnit(state, 0, "infantry", pSlots[3]!.x, pSlots[3]!.y),
    );
    assignAttack(state, pUnits[0]!, harvester);
    assignAttack(state, pUnits[1]!, harvester);
  } else if (scenarioKind === "armorClash") {
    // Heavy armor brawl with battlefield repair mechanics
    pUnits.push(
      spawnUnit(state, 0, "tank", pSlots[0]!.x, pSlots[0]!.y),
      spawnUnit(state, 0, "tank", pSlots[1]!.x, pSlots[1]!.y),
      spawnUnit(state, 0, "tank", pSlots[2]!.x, pSlots[2]!.y),
      spawnUnit(state, 0, "repairTruck", pSlots[3]!.x, pSlots[3]!.y),
    );
    eUnits.push(
      spawnUnit(state, 1, "tank", eSlots[0]!.x, eSlots[0]!.y),
      spawnUnit(state, 1, "tank", eSlots[1]!.x, eSlots[1]!.y),
      spawnUnit(state, 1, "tank", eSlots[2]!.x, eSlots[2]!.y),
      spawnUnit(state, 1, "repairTruck", eSlots[3]!.x, eSlots[3]!.y),
    );
  } else if (scenarioKind === "infantryStorm") {
    // Multi-squad infantry battle with medics healing the frontline
    pUnits.push(
      spawnUnit(state, 0, "infantry", pSlots[0]!.x, pSlots[0]!.y),
      spawnUnit(state, 0, "infantry", pSlots[1]!.x, pSlots[1]!.y),
      spawnUnit(state, 0, "antiArmor", pSlots[2]!.x, pSlots[2]!.y),
      spawnUnit(state, 0, "medic", pSlots[3]!.x, pSlots[3]!.y),
    );
    eUnits.push(
      spawnUnit(state, 1, "infantry", eSlots[0]!.x, eSlots[0]!.y),
      spawnUnit(state, 1, "infantry", eSlots[1]!.x, eSlots[1]!.y),
      spawnUnit(state, 1, "antiArmor", eSlots[2]!.x, eSlots[2]!.y),
      spawnUnit(state, 1, "medic", eSlots[3]!.x, eSlots[3]!.y),
    );
  } else {
    // convoyRaid: armored logistics interception
    const convoyTruck = spawnUnit(state, 1, "convoyTruck", eSlots[1]!.x, eSlots[1]!.y);
    objectiveTarget = convoyTruck;
    eUnits.push(
      convoyTruck,
      spawnUnit(state, 1, "tank", eSlots[0]!.x, eSlots[0]!.y),
      spawnUnit(state, 1, "antiArmor", eSlots[2]!.x, eSlots[2]!.y),
      spawnUnit(state, 1, "infantry", eSlots[3]!.x, eSlots[3]!.y),
    );
    pUnits.push(
      spawnUnit(state, 0, "tank", pSlots[0]!.x, pSlots[0]!.y),
      spawnUnit(state, 0, "antiArmor", pSlots[1]!.x, pSlots[1]!.y),
      spawnUnit(state, 0, "antiArmor", pSlots[2]!.x, pSlots[2]!.y),
      spawnUnit(state, 0, "infantry", pSlots[3]!.x, pSlots[3]!.y),
    );
    assignAttack(state, pUnits[1]!, convoyTruck);
  }

  // Base structures: Both buildings belong exclusively to defendingOwner (single faction).
  // Each scenario supplies its own offsets so the feed does not always frame the same base cluster.
  const [structureOffset1, structureOffset2] = scenarioDef.structureOffsets;
  const bSlot1 = { x: clashX + structureOffset1.x, y: clashY + structureOffset1.y };
  const bSlot2 = { x: clashX + structureOffset2.x, y: clashY + structureOffset2.y };

  const s1 = spawnCinemaBuilding(state, defendingOwner, bKind1, bSlot1, { x: clashX, y: clashY });
  const s2 = spawnCinemaBuilding(state, defendingOwner, bKind2, bSlot2, { x: clashX, y: clashY });
  const structures = [s1, s2];

  const playerStructure = defendingOwner === 0 ? s1 : undefined;
  const enemyStructure = defendingOwner === 1 ? s1 : undefined;

  if (
    scenarioDef.targetPolicy === "enemyStructure"
    || scenarioDef.targetPolicy === "playerStructure"
    || scenarioDef.targetPolicy === "infantry"
  ) {
    objectiveTarget = s1;
  }

  if (objectiveTarget === s1) {
    if (defendingOwner === 1) {
      // Attacking player units immediately target the enemy base structure
      if (pUnits[0]) assignAttack(state, pUnits[0], s1);
      if (pUnits[1]) assignAttack(state, pUnits[1], s1);
    } else {
      // Attacking enemy units immediately target the player base structure
      if (eUnits[0]) assignAttack(state, eUnits[0], s1);
      if (eUnits[1]) assignAttack(state, eUnits[1], s1);
    }
  }

  return { pUnits, eUnits, structures, objectiveTarget, playerStructure, enemyStructure, defendingOwner };
}
