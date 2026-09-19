export type { MeshData, ModelKind, ModelNode, UnitModel } from "./modelLoader/types";
export {
  computeNormal,
  createBoxMesh,
  createTrapezoidMesh,
  createCylinderMesh,
  createCylinderXMesh,
  createPolygonPrismMesh,
  mergeMeshes,
} from "./modelLoader/types";
export { buildTankModel } from "./modelLoader/tank";
export { buildHarvesterModel } from "./modelLoader/harvester";
export { buildInfantryModel } from "./modelLoader/infantry";
export { buildAntiArmorModel } from "./modelLoader/antiArmor";
export { buildTurretHeadModel } from "./modelLoader/turret";
export { buildAntiAirTurretModel } from "./modelLoader/antiAirTurret";
export { buildConvoyTruckModel } from "./modelLoader/convoyTruck";
export { buildStrikePlaneModel } from "./modelLoader/plane";
export { buildUnitModel, parseObjModel } from "./modelLoader/index";
