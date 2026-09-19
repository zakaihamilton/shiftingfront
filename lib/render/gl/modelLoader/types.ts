import type { UnitKind } from "../../../types";
import type { MeshData } from "../meshPrimitives";

export type { MeshData } from "../meshPrimitives";
export {
  computeNormal,
  createBoxMesh,
  createTrapezoidMesh,
  createCylinderMesh,
  createCylinderXMesh,
  createPolygonPrismMesh,
  mergeMeshes,
} from "../meshPrimitives";

export type ModelKind = UnitKind | "turret" | "turretHead" | "antiAirTurret";

export type ModelNode = {
  name: string;
  parent?: string;
  pivot: [number, number, number];
  mesh: MeshData;
};

export type UnitModel = {
  kind: ModelKind;
  nodes: ModelNode[];
};
