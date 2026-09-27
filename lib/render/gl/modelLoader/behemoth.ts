import { createBoxMesh, mergeMeshes } from "../meshPrimitives";
import type { UnitModel } from "./types";

export function buildBehemothModel(): UnitModel {
  // Super-heavy wider chassis (-0.7 to 0.7 length, -0.55 to 0.55 width)
  const mainHull = createBoxMesh(-0.68, -0.36, 0.16, 0.68, 0.36, 0.60, 1);
  const frontGlacis = createBoxMesh(0.48, -0.34, 0.16, 0.78, 0.34, 0.46, 2);
  const rearDeck = createBoxMesh(-0.78, -0.34, 0.24, -0.58, 0.34, 0.56, 2);
  const rearExhaustL = createBoxMesh(-0.82, 0.12, 0.44, -0.70, 0.28, 0.58, 4);
  const rearExhaustR = createBoxMesh(-0.82, -0.28, 0.44, -0.70, -0.12, 0.58, 4);

  // Heavy outer track assemblies (Left and Right)
  const leftTrack = createBoxMesh(-0.76, 0.36, 0.0, 0.76, 0.58, 0.52, 4);
  const rightTrack = createBoxMesh(-0.76, -0.58, 0.0, 0.76, -0.36, 0.52, 4);
  const chassisMesh = mergeMeshes([mainHull, frontGlacis, rearDeck, rearExhaustL, rearExhaustR, leftTrack, rightTrack]);

  // Massive Angular Turret
  const turretBase = createBoxMesh(-0.42, -0.34, 0.0, 0.42, 0.34, 0.42, 1);
  const turretCheekL = createBoxMesh(-0.35, 0.30, 0.05, 0.35, 0.38, 0.36, 2);
  const turretCheekR = createBoxMesh(-0.35, -0.38, 0.05, 0.35, -0.30, 0.36, 2);
  const cupola = createBoxMesh(-0.15, -0.24, 0.42, 0.12, -0.06, 0.58, 2);
  // Roof-mounted auxiliary AA pod
  const aaPod = createBoxMesh(-0.08, 0.10, 0.42, 0.18, 0.28, 0.56, 3);
  const antenna = createBoxMesh(-0.32, 0.24, 0.42, -0.28, 0.27, 0.95, 3);
  const turretMesh = mergeMeshes([turretBase, turretCheekL, turretCheekR, cupola, aaPod, antenna]);

  // Twin Heavy Cannons (Left and Right barrels)
  const mantlet = createBoxMesh(-0.10, -0.22, -0.12, 0.16, 0.22, 0.12, 4);
  // Left Barrel
  const cannonLeft = createBoxMesh(0.16, 0.07, -0.06, 0.96, 0.17, 0.06, 4);
  const muzzleLeft = createBoxMesh(0.96, 0.05, -0.08, 1.10, 0.19, 0.08, 3);
  // Right Barrel
  const cannonRight = createBoxMesh(0.16, -0.17, -0.06, 0.96, -0.07, 0.06, 4);
  const muzzleRight = createBoxMesh(0.96, -0.19, -0.08, 1.10, -0.05, 0.08, 3);
  const barrelMesh = mergeMeshes([mantlet, cannonLeft, muzzleLeft, cannonRight, muzzleRight]);

  return {
    kind: "behemoth",
    nodes: [
      { name: "chassis", pivot: [0, 0, 0], mesh: chassisMesh },
      { name: "turret", parent: "chassis", pivot: [0, 0, 0.60], mesh: turretMesh },
      { name: "barrel", parent: "turret", pivot: [0.42, 0, 0.20], mesh: barrelMesh },
    ],
  };
}
