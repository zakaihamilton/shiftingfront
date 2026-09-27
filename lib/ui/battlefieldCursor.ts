import { canPlaceBuilding, isStaticWalkable } from "@/lib/sim/world";
import { canRepair } from "@/lib/sim/repair";
import { canSell } from "@/lib/sim/sell";
import { BUILDING_DEFINITIONS } from "@/lib/catalog";
import { isBuildingEntity, TILE_RESOURCE, type BuildingKind, type Entity, type SimState } from "@/lib/types";

export type BattlefieldCursor = "crosshair" | "pointer" | "cell" | "not-allowed";

const SUPPORT_KINDS = new Set(["harvester", "medic", "repairTruck", "convoyTruck"]);

function hasResourceNear(state: SimState, cx: number, cy: number, maxRadius = 1): boolean {
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < state.width && ny >= 0 && ny < state.height) {
        const i = ny * state.width + nx;
        if (state.tiles[i] === TILE_RESOURCE && (state.resourceAmount[i] ?? 0) > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

export function battlefieldCursor({
  state,
  hoverTile,
  hoverEntity,
  selectedIds,
  placeKind,
  repairMode,
  sellMode,
}: {
  state: SimState;
  hoverTile: { x: number; y: number } | null;
  hoverEntity: Entity | undefined;
  selectedIds: number[];
  placeKind: BuildingKind | null;
  repairMode: boolean;
  sellMode: boolean;
}): BattlefieldCursor {
  const owner = state.viewOwner ?? 0;
  if (placeKind) {
    if (!hoverTile) return "cell";
    return canPlaceBuilding(state, placeKind, hoverTile.x, hoverTile.y, owner) ? "cell" : "not-allowed";
  }
  if (repairMode) {
    if (!hoverEntity) return "not-allowed";
    return hoverEntity.owner === owner && (hoverEntity.repairing || canRepair(hoverEntity)) ? "pointer" : "not-allowed";
  }
  if (sellMode) {
    if (!hoverEntity) return "not-allowed";
    return hoverEntity.owner === owner && canSell(hoverEntity) ? "pointer" : "not-allowed";
  }
  const selectedProducer = selectedIds.length === 1
    ? state.entities.find((entity) => entity.id === selectedIds[0] && entity.hp > 0)
    : undefined;
  if (
    selectedProducer?.owner === owner &&
    isBuildingEntity(selectedProducer) &&
    selectedProducer.constructing <= 0 &&
    Boolean(BUILDING_DEFINITIONS[selectedProducer.kind].production)
  ) {
    if (!hoverTile || hoverEntity) return "not-allowed";
    return isStaticWalkable(state, hoverTile.x, hoverTile.y) ? "cell" : "not-allowed";
  }
  if (hoverEntity?.owner === owner) return "pointer";
  if (hoverEntity && hoverEntity.owner !== owner) {
    const selectedCombat = selectedIds.some((id) => {
      const entity = state.entities.find((item) => item.id === id && item.hp > 0 && item.owner === owner && item.class === "unit");
      return Boolean(entity && !SUPPORT_KINDS.has(entity.kind));
    });
    return selectedCombat ? "crosshair" : "not-allowed";
  }
  if (hoverTile && hasResourceNear(state, hoverTile.x, hoverTile.y, 1)) {
    const harvesting = selectedIds.some((id) => {
      const entity = state.entities.find((item) => item.id === id);
      return entity?.kind === "harvester" && entity.hp > 0 && entity.owner === owner;
    });
    if (harvesting) return "cell";
  }
  return "crosshair";
}
