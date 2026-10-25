import { createBoxMesh, mergeMeshes } from "../meshPrimitives";
import type { UnitModel } from "./types";

/** Lightweight preview mesh for the open recon buggy. Battlefield art is the directional raster. */
export function buildScoutModel(): UnitModel {
  const hull = createBoxMesh(-0.62, -0.28, 0.16, 0.58, 0.28, 0.42, 1);
  const nose = createBoxMesh(0.42, -0.24, 0.18, 0.72, 0.24, 0.36, 2);
  const rollBar = createBoxMesh(-0.08, -0.26, 0.42, 0.34, 0.26, 0.78, 1);
  const leftFront = createBoxMesh(0.28, 0.24, 0.02, 0.52, 0.4, 0.28, 4);
  const rightFront = createBoxMesh(0.28, -0.4, 0.02, 0.52, -0.24, 0.28, 4);
  const leftRear = createBoxMesh(-0.48, 0.24, 0.02, -0.24, 0.4, 0.28, 4);
  const rightRear = createBoxMesh(-0.48, -0.4, 0.02, -0.24, -0.24, 0.28, 4);
  const chassis = mergeMeshes([hull, nose, rollBar, leftFront, rightFront, leftRear, rightRear]);

  const gunBody = createBoxMesh(-0.08, -0.05, 0.08, 0.42, 0.05, 0.16, 3);
  const gunMount = createBoxMesh(-0.06, -0.08, 0.0, 0.08, 0.08, 0.1, 1);
  const antenna = createBoxMesh(-0.22, -0.02, 0.16, -0.18, 0.02, 0.72, 2);
  const weapon = mergeMeshes([gunBody, gunMount, antenna]);

  return {
    kind: "scout",
    nodes: [
      { name: "chassis", pivot: [0, 0, 0], mesh: chassis },
      { name: "gun", parent: "chassis", pivot: [0.05, 0, 0.72], mesh: weapon },
    ],
  };
}
