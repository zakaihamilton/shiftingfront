import { createBoxMesh, mergeMeshes } from "../meshPrimitives";
import type { UnitModel } from "./types";

export function buildHarvesterModel(): UnitModel {
  const mainCab = createBoxMesh(-0.6, -0.32, 0.15, 0.5, 0.32, 0.5, 1);
  const operatorCab = createBoxMesh(0.1, -0.3, 0.48, 0.52, 0.3, 0.95, 1);
  const windshield = createBoxMesh(0.32, -0.26, 0.52, 0.54, 0.26, 0.9, 3);
  const hazardBeacon = createBoxMesh(0.18, -0.08, 0.95, 0.32, 0.08, 1.08, 3);
  const sideTanks = createBoxMesh(-0.45, 0.32, 0.48, 0.05, 0.44, 0.75, 2);
  const sideTanksR = createBoxMesh(-0.45, -0.44, 0.48, 0.05, -0.32, 0.75, 2);
  const cargoHopper = createBoxMesh(-0.72, -0.34, 0.35, 0.05, 0.34, 0.85, 4);
  const leftTrack = createBoxMesh(-0.65, 0.32, 0.0, 0.55, 0.48, 0.48, 4);
  const rightTrack = createBoxMesh(-0.65, -0.48, 0.0, 0.55, -0.32, 0.48, 4);
  const chassisMesh = mergeMeshes([
    mainCab,
    operatorCab,
    windshield,
    hazardBeacon,
    sideTanks,
    sideTanksR,
    cargoHopper,
    leftTrack,
    rightTrack,
  ]);

  const scoopArmL = createBoxMesh(0.0, 0.28, -0.08, 0.45, 0.38, 0.1, 2);
  const scoopArmR = createBoxMesh(0.0, -0.38, -0.08, 0.45, -0.28, 0.1, 2);
  const bucket = createBoxMesh(0.45, -0.44, -0.22, 0.82, 0.44, 0.28, 4);
  const teeth = createBoxMesh(0.82, -0.42, -0.22, 0.95, 0.42, -0.08, 3);
  const scoopMesh = mergeMeshes([scoopArmL, scoopArmR, bucket, teeth]);

  return {
    kind: "harvester",
    nodes: [
      { name: "chassis", pivot: [0, 0, 0], mesh: chassisMesh },
      { name: "scoop", parent: "chassis", pivot: [0.48, 0, 0.25], mesh: scoopMesh },
    ],
  };
}
