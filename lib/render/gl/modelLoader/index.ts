import { parseObjModelData } from "../objModel";
import { buildAntiAirTurretModel } from "./antiAirTurret";
import { buildAntiArmorModel } from "./antiArmor";
import { buildBehemothModel } from "./behemoth";
import { buildConvoyTruckModel } from "./convoyTruck";
import { buildHarvesterModel } from "./harvester";
import { buildInfantryModel } from "./infantry";
import { buildStrikePlaneModel } from "./plane";
import { buildScoutModel } from "./scout";
import { buildTankModel } from "./tank";
import { buildTurretHeadModel } from "./turret";
import type { ModelKind, UnitModel } from "./types";

export { buildAntiAirTurretModel } from "./antiAirTurret";
export { buildAntiArmorModel } from "./antiArmor";
export { buildBehemothModel } from "./behemoth";
export { buildConvoyTruckModel } from "./convoyTruck";
export { buildHarvesterModel } from "./harvester";
export { buildInfantryModel } from "./infantry";
export { buildStrikePlaneModel } from "./plane";
export { buildScoutModel } from "./scout";
export { buildTankModel } from "./tank";
export { buildTurretHeadModel } from "./turret";
export type { MeshData, ModelKind, ModelNode, UnitModel } from "./types";
export {
  computeNormal,
  createBoxMesh,
  createCylinderMesh,
  createCylinderXMesh,
  createPolygonPrismMesh,
  createTrapezoidMesh,
  mergeMeshes,
} from "./types";

export function buildUnitModel(kind: ModelKind): UnitModel {
  switch (kind) {
    case "tank":
      return buildTankModel();
    case "harvester":
      return buildHarvesterModel();
    case "infantry":
      return buildInfantryModel();
    case "antiArmor":
      return buildAntiArmorModel();
    case "medic":
      return { ...buildInfantryModel(), kind: "medic" };
    case "repairTruck":
      return { ...buildHarvesterModel(), kind: "repairTruck" };
    case "convoyTruck":
      return buildConvoyTruckModel();
    case "strikePlane":
      return buildStrikePlaneModel();
    case "behemoth":
      return buildBehemothModel();
    case "scout":
      return buildScoutModel();
    case "turret":
    case "turretHead":
      return buildTurretHeadModel();
    case "antiAirTurret":
      return buildAntiAirTurretModel();
  }
}

export function parseObjModel(text: string, kind: ModelKind): UnitModel {
  return parseObjModelData(text, kind, buildUnitModel);
}
