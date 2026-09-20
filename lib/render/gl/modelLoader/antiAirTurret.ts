import {
  createBoxMesh,
  createCylinderMesh,
  createCylinderXMesh,
  createPolygonPrismMesh,
  createTrapezoidMesh,
  mergeMeshes,
} from "../meshPrimitives";
import type { UnitModel } from "./types";

/** The rotating upper assembly for the anti-air building. */
export function buildAntiAirTurretModel(): UnitModel {
  const bearing = createCylinderMesh(0, 0, -0.08, 0.16, 0.38, 0.34, 12, 4);
  const bearingTrim = createCylinderMesh(0, 0, 0.10, 0.22, 0.34, 0.30, 10, 5);

  const armoredHead = createPolygonPrismMesh(
    [
      [-0.38, -0.24],
      [0.22, -0.28],
      [0.38, -0.12],
      [0.38, 0.12],
      [0.22, 0.28],
      [-0.38, 0.24],
    ],
    0.18,
    0.48,
    1,
  );
  const upperArmor = createTrapezoidMesh(
    -0.30, -0.20,
    -0.24, -0.17,
    0.24, 0.20,
    0.20, 0.17,
    0.46,
    0.62,
    7,
  );
  const sideArmorL = createBoxMesh(-0.22, 0.22, 0.22, 0.20, 0.30, 0.52, 2);
  const sideArmorR = createBoxMesh(-0.22, -0.30, 0.22, 0.20, -0.22, 0.52, 2);

  const radarMast = createBoxMesh(-0.18, -0.045, 0.48, -0.12, 0.045, 0.94, 4);
  const radarHub = createCylinderXMesh(-0.10, 0.10, -0.16, 0.76, 0.16, 0.12, 10, 7);
  const radarDish = createCylinderXMesh(-0.12, 0.12, -0.16, 0.76, 0.28, 0.035, 12, 2);
  const radarOptic = createCylinderXMesh(-0.15, 0.15, -0.16, 0.76, 0.055, 0.055, 8, 3);
  const radarTip = createBoxMesh(-0.20, -0.045, 0.94, -0.10, 0.045, 1.05, 3);

  const headMesh = mergeMeshes([
    bearing,
    bearingTrim,
    armoredHead,
    upperArmor,
    sideArmorL,
    sideArmorR,
    radarMast,
    radarHub,
    radarDish,
    radarOptic,
    radarTip,
  ]);

  const mantlet = createTrapezoidMesh(
    0.22, -0.22,
    0.26, -0.19,
    0.52, 0.22,
    0.48, 0.19,
    0.28,
    0.56,
    2,
  );
  // Separate armored cradles make the twin-gun silhouette read clearly at
  // battlefield scale instead of collapsing into one dark horizontal bar.
  const barrelSupport = createBoxMesh(0.34, -0.24, 0.44, 0.66, 0.24, 0.66, 4);
  const barrelHousingL = createTrapezoidMesh(
    0.28, 0.02,
    0.34, 0.04,
    0.72, 0.22,
    0.66, 0.19,
    0.46,
    0.70,
    1,
  );
  const barrelHousingR = createTrapezoidMesh(
    0.28, -0.22,
    0.34, -0.19,
    0.72, -0.02,
    0.66, -0.04,
    0.46,
    0.70,
    1,
  );

  const barrelL = createCylinderXMesh(0.48, 1.20, 0.11, 0.56, 0.085, 0.060, 8, 4);
  const barrelSleeveL = createCylinderXMesh(0.42, 0.58, 0.11, 0.56, 0.12, 0.10, 8, 5);
  const muzzleL = createCylinderXMesh(1.18, 1.34, 0.11, 0.56, 0.078, 0.070, 10, 4);
  const muzzleAccentL = createCylinderXMesh(1.20, 1.27, 0.11, 0.56, 0.090, 0.080, 10, 3);
  const boreL = createCylinderXMesh(1.33, 1.35, 0.11, 0.56, 0.040, 0.040, 8, 4, true, false);

  const barrelR = createCylinderXMesh(0.48, 1.20, -0.11, 0.56, 0.085, 0.060, 8, 4);
  const barrelSleeveR = createCylinderXMesh(0.42, 0.58, -0.11, 0.56, 0.12, 0.10, 8, 5);
  const muzzleR = createCylinderXMesh(1.18, 1.34, -0.11, 0.56, 0.078, 0.070, 10, 4);
  const muzzleAccentR = createCylinderXMesh(1.20, 1.27, -0.11, 0.56, 0.090, 0.080, 10, 3);
  const boreR = createCylinderXMesh(1.33, 1.35, -0.11, 0.56, 0.040, 0.040, 8, 4, true, false);

  const barrelMesh = mergeMeshes([
    mantlet,
    barrelSupport,
    barrelHousingL,
    barrelHousingR,
    barrelL,
    barrelSleeveL,
    muzzleL,
    muzzleAccentL,
    boreL,
    barrelR,
    barrelSleeveR,
    muzzleR,
    muzzleAccentR,
    boreR,
  ]);

  return {
    kind: "antiAirTurret",
    nodes: [
      { name: "turretHead", pivot: [0, 0, 0], mesh: headMesh },
      { name: "barrel", parent: "turretHead", pivot: [0.40, 0, 0.50], mesh: barrelMesh },
    ],
  };
}
