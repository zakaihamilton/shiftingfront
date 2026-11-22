import { createBoxMesh, mergeMeshes } from "../meshPrimitives";
import type { UnitModel } from "./types";

export function buildAntiArmorModel(): UnitModel {
  const torso = createBoxMesh(-0.18, -0.24, 0.0, 0.18, 0.24, 0.55, 1);
  const pauldrons = createBoxMesh(-0.16, -0.32, 0.25, 0.16, 0.32, 0.55, 2);
  const head = createBoxMesh(-0.14, -0.14, 0.55, 0.14, 0.14, 0.85, 2);
  const heavyVisor = createBoxMesh(0.08, -0.12, 0.62, 0.16, 0.12, 0.75, 3);
  const missilePack = createBoxMesh(-0.28, -0.22, 0.18, -0.18, 0.22, 0.65, 4);
  const launcherTubes = createBoxMesh(-0.28, 0.16, 0.48, 0.32, 0.36, 0.82, 4);
  const rocketTips = createBoxMesh(0.32, 0.18, 0.52, 0.38, 0.34, 0.78, 3);
  const torsoMesh = mergeMeshes([
    torso,
    pauldrons,
    head,
    heavyVisor,
    missilePack,
    launcherTubes,
    rocketTips,
  ]);

  const legL = createBoxMesh(-0.12, -0.1, -0.45, 0.12, 0.1, 0.0, 4);
  const armorPlateL = createBoxMesh(0.04, -0.11, -0.35, 0.15, 0.11, -0.12, 1);
  const bootL = createBoxMesh(-0.13, -0.11, -0.75, 0.18, 0.11, -0.45, 2);
  const legLMesh = mergeMeshes([legL, armorPlateL, bootL]);

  const legR = createBoxMesh(-0.12, -0.1, -0.45, 0.12, 0.1, 0.0, 4);
  const armorPlateR = createBoxMesh(0.04, -0.11, -0.35, 0.15, 0.11, -0.12, 1);
  const bootR = createBoxMesh(-0.13, -0.11, -0.75, 0.18, 0.11, -0.45, 2);
  const legRMesh = mergeMeshes([legR, armorPlateR, bootR]);

  return {
    kind: "antiArmor",
    nodes: [
      { name: "torso", pivot: [0, 0, 0.75], mesh: torsoMesh },
      { name: "legL", parent: "torso", pivot: [0, 0.16, 0.0], mesh: legLMesh },
      { name: "legR", parent: "torso", pivot: [0, -0.16, 0.0], mesh: legRMesh },
    ],
  };
}
