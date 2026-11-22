import {
  createBoxMesh,
  createCylinderMesh,
  createCylinderXMesh,
  createPolygonPrismMesh,
  createTrapezoidMesh,
  mergeMeshes,
} from "../meshPrimitives";
import type { UnitModel } from "./types";

export function buildTurretHeadModel(): UnitModel {
  const bearingMount = createCylinderMesh(0, 0, -0.1, 0.02, 0.38, 0.35, 12, 4);
  const bearingTeeth = createCylinderMesh(0, 0, -0.04, 0.04, 0.36, 0.33, 8, 2);

  const hullFaceted = createPolygonPrismMesh(
    [
      [-0.38, -0.26],
      [0.15, -0.32],
      [0.38, -0.16],
      [0.38, 0.16],
      [0.15, 0.32],
      [-0.38, 0.26],
      [-0.42, 0.16],
      [-0.42, -0.16],
    ],
    0.0,
    0.32,
    1,
  );

  const upperDeck = createTrapezoidMesh(
    -0.32,
    -0.22,
    -0.26,
    -0.18,
    0.28,
    0.22,
    0.22,
    0.18,
    0.3,
    0.42,
    1,
  );

  const frontCheekL = createTrapezoidMesh(
    0.12,
    0.2,
    0.15,
    0.16,
    0.36,
    0.28,
    0.32,
    0.18,
    0.06,
    0.34,
    2,
  );
  const frontCheekR = createTrapezoidMesh(
    0.12,
    -0.28,
    0.15,
    -0.18,
    0.36,
    -0.2,
    0.32,
    -0.16,
    0.06,
    0.34,
    2,
  );

  const sideArmorL = createTrapezoidMesh(
    -0.3,
    0.26,
    -0.26,
    0.24,
    0.16,
    0.36,
    0.12,
    0.32,
    0.06,
    0.32,
    2,
  );
  const sideArmorR = createTrapezoidMesh(
    -0.3,
    -0.36,
    -0.26,
    -0.32,
    0.16,
    -0.26,
    0.12,
    -0.24,
    0.06,
    0.32,
    2,
  );

  const sideConduitL = createBoxMesh(-0.08, 0.32, 0.16, 0.08, 0.37, 0.22, 3);
  const sideConduitR = createBoxMesh(-0.08, -0.37, 0.16, 0.08, -0.32, 0.22, 3);

  const cupolaBase = createCylinderMesh(-0.1, 0.1, 0.4, 0.5, 0.11, 0.08, 8, 1);
  const cupolaVisor = createCylinderMesh(-0.1, 0.1, 0.44, 0.48, 0.115, 0.115, 8, 4);
  const cupolaOptic = createBoxMesh(-0.05, 0.06, 0.44, 0.02, 0.14, 0.48, 3);

  const rearAmmoBustle = createTrapezoidMesh(
    -0.46,
    -0.2,
    -0.42,
    -0.18,
    -0.34,
    0.2,
    -0.32,
    0.18,
    0.08,
    0.36,
    4,
  );
  const rearRadiatorGrille = createBoxMesh(-0.47, -0.14, 0.18, -0.45, 0.14, 0.3, 5);

  const mainTargetVisor = createBoxMesh(0.32, -0.14, 0.18, 0.4, 0.14, 0.28, 3);
  const topRangefinderVisor = createBoxMesh(0.18, -0.1, 0.38, 0.26, 0.1, 0.44, 3);

  const antennaBase = createCylinderMesh(-0.24, -0.14, 0.38, 0.46, 0.035, 0.025, 6, 4);
  const antennaMast = createCylinderMesh(-0.24, -0.14, 0.46, 0.88, 0.018, 0.01, 4, 4);
  const antennaTip = createBoxMesh(-0.255, -0.155, 0.88, -0.225, -0.125, 0.94, 3);

  const headMesh = mergeMeshes([
    bearingMount,
    bearingTeeth,
    hullFaceted,
    upperDeck,
    frontCheekL,
    frontCheekR,
    sideArmorL,
    sideArmorR,
    sideConduitL,
    sideConduitR,
    cupolaBase,
    cupolaVisor,
    cupolaOptic,
    rearAmmoBustle,
    rearRadiatorGrille,
    mainTargetVisor,
    topRangefinderVisor,
    antennaBase,
    antennaMast,
    antennaTip,
  ]);

  const mantletBase = createTrapezoidMesh(
    0.28,
    -0.18,
    0.3,
    -0.16,
    0.48,
    0.18,
    0.46,
    0.16,
    0.08,
    0.32,
    4,
  );
  const mantletPlate = createTrapezoidMesh(
    0.36,
    -0.16,
    0.38,
    -0.14,
    0.49,
    0.16,
    0.47,
    0.14,
    0.14,
    0.3,
    2,
  );

  const pistonL = createCylinderXMesh(0.24, 0.48, 0.13, 0.14, 0.025, 0.025, 6, 7);
  const pistonR = createCylinderXMesh(0.24, 0.48, -0.13, 0.14, 0.025, 0.025, 6, 7);

  const barrelSleeveL = createCylinderXMesh(0.46, 0.8, 0.09, 0.2, 0.062, 0.056, 8, 4);
  const barrelTubeL = createCylinderXMesh(0.8, 1.2, 0.09, 0.2, 0.046, 0.042, 8, 4);
  const gasPortL = createCylinderXMesh(0.92, 0.98, 0.09, 0.2, 0.054, 0.054, 8, 5);
  const muzzleBrakeL = createCylinderXMesh(1.2, 1.36, 0.09, 0.2, 0.064, 0.058, 8, 4);
  const muzzleVentsL = createCylinderXMesh(1.24, 1.32, 0.09, 0.2, 0.068, 0.068, 8, 5);
  const boreL = createCylinderXMesh(1.35, 1.37, 0.09, 0.2, 0.032, 0.032, 8, 4, true, false);

  const barrelSleeveR = createCylinderXMesh(0.46, 0.8, -0.09, 0.2, 0.062, 0.056, 8, 4);
  const barrelTubeR = createCylinderXMesh(0.8, 1.2, -0.09, 0.2, 0.046, 0.042, 8, 4);
  const gasPortR = createCylinderXMesh(0.92, 0.98, -0.09, 0.2, 0.054, 0.054, 8, 5);
  const muzzleBrakeR = createCylinderXMesh(1.2, 1.36, -0.09, 0.2, 0.064, 0.058, 8, 4);
  const muzzleVentsR = createCylinderXMesh(1.24, 1.32, -0.09, 0.2, 0.068, 0.068, 8, 5);
  const boreR = createCylinderXMesh(1.35, 1.37, -0.09, 0.2, 0.032, 0.032, 8, 4, true, false);

  const barrelBrace = createBoxMesh(0.52, -0.04, 0.17, 0.82, 0.04, 0.23, 4);
  const rangefinderOptic = createCylinderXMesh(0.82, 0.94, 0.0, 0.2, 0.03, 0.03, 6, 3);

  const barrelMesh = mergeMeshes([
    mantletBase,
    mantletPlate,
    pistonL,
    pistonR,
    barrelSleeveL,
    barrelTubeL,
    gasPortL,
    muzzleBrakeL,
    muzzleVentsL,
    boreL,
    barrelSleeveR,
    barrelTubeR,
    gasPortR,
    muzzleBrakeR,
    muzzleVentsR,
    boreR,
    barrelBrace,
    rangefinderOptic,
  ]);

  return {
    kind: "turret",
    nodes: [
      { name: "turretHead", pivot: [0, 0, 0], mesh: headMesh },
      { name: "barrel", parent: "turretHead", pivot: [0.35, 0, 0.2], mesh: barrelMesh },
    ],
  };
}
