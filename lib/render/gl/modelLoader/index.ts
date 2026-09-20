import { parseObjModelData } from "../objModel";
import { buildTankModel } from "./tank";
import { buildHarvesterModel } from "./harvester";
import { buildInfantryModel } from "./infantry";
import { buildAntiArmorModel } from "./antiArmor";
import { buildTurretHeadModel } from "./turret";
import { buildAntiAirTurretModel } from "./antiAirTurret";
import { buildConvoyTruckModel } from "./convoyTruck";
import { buildStrikePlaneModel } from "./plane";
import type { ModelKind, UnitModel } from "./types";

export type { MeshData, ModelKind, ModelNode, UnitModel } from "./types";
export {
  computeNormal,
  createBoxMesh,
  createTrapezoidMesh,
  createCylinderMesh,
  createCylinderXMesh,
  createPolygonPrismMesh,
  mergeMeshes,
} from "./types";

export { buildTankModel } from "./tank";
export { buildHarvesterModel } from "./harvester";
export { buildInfantryModel } from "./infantry";
export { buildAntiArmorModel } from "./antiArmor";
export { buildTurretHeadModel } from "./turret";
export { buildAntiAirTurretModel } from "./antiAirTurret";
export { buildConvoyTruckModel } from "./convoyTruck";
export { buildStrikePlaneModel } from "./plane";

export function buildUnitModel(kind: ModelKind): UnitModel {
  switch (kind) {
    case "tank": return buildTankModel();
    case "harvester": return buildHarvesterModel();
    case "infantry": return buildInfantryModel();
    case "antiArmor": return buildAntiArmorModel();
    case "medic": return { ...buildInfantryModel(), kind: "medic" };
    case "repairTruck": return { ...buildHarvesterModel(), kind: "repairTruck" };
    case "convoyTruck": return buildConvoyTruckModel();
    case "strikePlane": return buildStrikePlaneModel();
    case "turret":
    case "turretHead": return buildTurretHeadModel();
    case "antiAirTurret": return buildAntiAirTurretModel();
  }
}

export function parseObjModel(text: string, kind: ModelKind): UnitModel {
  return parseObjModelData(text, kind, buildUnitModel);
}
