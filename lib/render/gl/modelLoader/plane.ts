import {
  createBoxMesh,
  createCylinderXMesh,
  createPolygonPrismMesh,
  createTrapezoidMesh,
  mergeMeshes,
} from "../meshPrimitives";
import type { UnitModel } from "./types";

/** Bespoke fallback model for the airframe preview/3D renderer. */
export function buildStrikePlaneModel(): UnitModel {
  const fuselage = createTrapezoidMesh(
    -0.92, -0.16,
    -0.78, -0.11,
    0.94, 0.16,
    0.70, 0.11,
    0.28,
    0.52,
    1,
  );
  const nose = createTrapezoidMesh(
    0.56, -0.11,
    0.64, -0.07,
    1.04, 0.11,
    0.92, 0.07,
    0.34,
    0.48,
    2,
  );
  const canopy = createTrapezoidMesh(
    0.02, -0.09,
    0.12, -0.06,
    0.48, 0.09,
    0.38, 0.06,
    0.50,
    0.68,
    3,
  );
  const engineL = createCylinderXMesh(-0.62, 0.34, 0.28, 0.43, 0.14, 0.11, 8, 4);
  const engineR = createCylinderXMesh(-0.62, 0.34, -0.28, 0.43, 0.14, 0.11, 8, 4);
  const intakeL = createBoxMesh(-0.16, 0.20, 0.38, 0.22, 0.35, 0.49, 3);
  const intakeR = createBoxMesh(-0.16, -0.35, 0.38, 0.22, -0.20, 0.49, 3);
  const airframeMesh = mergeMeshes([fuselage, nose, canopy, engineL, engineR, intakeL, intakeR]);

  const wingL = createPolygonPrismMesh(
    [[-0.52, 0.10], [0.30, 0.10], [0.42, 0.86], [-0.12, 0.54]],
    0.30,
    0.38,
    2,
  );
  const wingR = createPolygonPrismMesh(
    [[-0.52, -0.10], [-0.12, -0.54], [0.42, -0.86], [0.30, -0.10]],
    0.30,
    0.38,
    2,
  );
  const wingMesh = mergeMeshes([wingL, wingR]);

  const tailFinL = createBoxMesh(-0.74, 0.08, 0.42, -0.50, 0.16, 0.88, 3);
  const tailFinR = createBoxMesh(-0.74, -0.16, 0.42, -0.50, -0.08, 0.88, 3);
  const tailMesh = mergeMeshes([tailFinL, tailFinR]);

  const hardpointL = createBoxMesh(0.12, 0.43, 0.24, 0.54, 0.49, 0.30, 4);
  const hardpointR = createBoxMesh(0.12, -0.49, 0.24, 0.54, -0.43, 0.30, 4);
  const storesMesh = mergeMeshes([hardpointL, hardpointR]);

  return {
    kind: "strikePlane",
    nodes: [
      { name: "airframe", pivot: [0, 0, 0], mesh: airframeMesh },
      { name: "wings", parent: "airframe", pivot: [0, 0, 0.30], mesh: wingMesh },
      { name: "tail", parent: "airframe", pivot: [-0.62, 0, 0.42], mesh: tailMesh },
      { name: "stores", parent: "airframe", pivot: [0.22, 0, 0.24], mesh: storesMesh },
    ],
  };
}
