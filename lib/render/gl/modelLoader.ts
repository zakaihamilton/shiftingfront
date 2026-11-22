export { buildAntiAirTurretModel } from "./modelLoader/antiAirTurret";
export { buildAntiArmorModel } from "./modelLoader/antiArmor";
export { buildConvoyTruckModel } from "./modelLoader/convoyTruck";
export { buildHarvesterModel } from "./modelLoader/harvester";
export { buildUnitModel, parseObjModel } from "./modelLoader/index";
export { buildInfantryModel } from "./modelLoader/infantry";
export { buildStrikePlaneModel } from "./modelLoader/plane";
export { buildTankModel } from "./modelLoader/tank";
export { buildTurretHeadModel } from "./modelLoader/turret";
export type { MeshData, ModelKind, ModelNode, UnitModel } from "./modelLoader/types";
export {
  computeNormal,
  createBoxMesh,
  createCylinderMesh,
  createCylinderXMesh,
  createPolygonPrismMesh,
  createTrapezoidMesh,
  mergeMeshes,
} from "./modelLoader/types";
