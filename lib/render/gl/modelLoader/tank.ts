import { createBoxMesh, mergeMeshes } from "../meshPrimitives";
import type { UnitModel } from "./types";

export function buildTankModel(): UnitModel {
  const mainHull = createBoxMesh(-0.55, -0.28, 0.15, 0.55, 0.28, 0.55, 1);
  const frontSlope = createBoxMesh(0.4, -0.26, 0.15, 0.65, 0.26, 0.42, 2);
  const rearDeck = createBoxMesh(-0.65, -0.26, 0.22, -0.48, 0.26, 0.52, 2);
  const rearExhaust = createBoxMesh(-0.68, -0.18, 0.42, -0.58, 0.18, 0.56, 4);
  const leftTrack = createBoxMesh(-0.6, 0.28, 0.0, 0.6, 0.46, 0.45, 4);
  const rightTrack = createBoxMesh(-0.6, -0.46, 0.0, 0.6, -0.28, 0.45, 4);
  const chassisMesh = mergeMeshes([
    mainHull,
    frontSlope,
    rearDeck,
    rearExhaust,
    leftTrack,
    rightTrack,
  ]);

  const turretBase = createBoxMesh(-0.32, -0.26, 0.0, 0.32, 0.26, 0.38, 1);
  const cupola = createBoxMesh(-0.12, -0.18, 0.38, 0.1, 0.05, 0.52, 2);
  const sensorVisor = createBoxMesh(0.18, -0.22, 0.18, 0.34, 0.22, 0.3, 3);
  const antenna = createBoxMesh(-0.25, 0.18, 0.38, -0.22, 0.21, 0.85, 3);
  const turretMesh = mergeMeshes([turretBase, cupola, sensorVisor, antenna]);

  const mantlet = createBoxMesh(-0.08, -0.12, -0.1, 0.12, 0.12, 0.1, 4);
  const cannon = createBoxMesh(0.12, -0.05, -0.05, 0.85, 0.05, 0.05, 4);
  const muzzle = createBoxMesh(0.85, -0.07, -0.07, 0.98, 0.07, 0.07, 3);
  const barrelMesh = mergeMeshes([mantlet, cannon, muzzle]);

  return {
    kind: "tank",
    nodes: [
      { name: "chassis", pivot: [0, 0, 0], mesh: chassisMesh },
      { name: "turret", parent: "chassis", pivot: [0, 0, 0.55], mesh: turretMesh },
      { name: "barrel", parent: "turret", pivot: [0.32, 0, 0.18], mesh: barrelMesh },
    ],
  };
}
